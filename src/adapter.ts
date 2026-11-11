import type { Copy } from "./copy.ts"
import { installSidebarWidth } from "./sidebar-width.ts"
import { installFooterUpdate } from "./footer-update.ts"

export const selectors = {
  settings: 'fieldset[data-component="interface-mode"][data-action="settings-tab-layout"]',
  inbox: '#vertical-tabs-sidebar [data-slot="sidebar-inbox"]',
  card: '[data-projects-sidebar-card]',
  root: '[data-projects-sidebar-root]',
} as const

type Options = {
  document: Document
  enabled(): boolean
  ready?(): boolean
  setEnabled(value: boolean): void
  copy(): Copy
  mountList(container: HTMLElement): () => void
  onError?(): void
  width?: { get(): number | undefined; set(width: number): void }
}

/** The only host-DOM-dependent part. Never remove or reparent host-owned nodes. */
export function installPrototype(options: Options) {
  const doc = options.document
  let failed = false
  let disposed = false
  let queued = false
  let switching = false
  let fieldset: HTMLFieldSetElement | undefined
  let card: HTMLLabelElement | undefined
  let native: HTMLElement | undefined
  let root: HTMLElement | undefined
  let disposeList: (() => void) | undefined
  let disposeWidth: (() => void) | undefined
  let disposeUpdate: (() => void) | undefined
  let language: Copy | undefined
  // Global stores normally load before setup; still tolerate delayed readiness.
  const ready = () => options.ready?.() ?? true
  const curtain = doc.createElement("style")
  curtain.setAttribute("data-projects-sidebar-startup", "")
  // Preserve the native shell geometry, but don't expose intermediate history or focus targets.
  curtain.textContent = `${selectors.inbox} { visibility: hidden !important; }`
  if (ready() && options.enabled()) doc.head.append(curtain)
  const releaseStartup = () => curtain.remove()
  const startupTimer = doc.defaultView!.setTimeout(releaseStartup, 2000)

  const nativeInputs = (element: Element) =>
    [...element.querySelectorAll<HTMLInputElement>('[data-slot="interface-mode-option"] > input[type="radio"]')]
      .filter((input) => !input.closest(selectors.card))

  function restoreRadios() {
    if (!fieldset) return
    const input = card?.querySelector("input")
    if (input) input.checked = false
    for (const input of nativeInputs(fieldset)) {
      input.checked = input.parentElement!.hasAttribute("data-checked")
    }
    fieldset.removeAttribute("data-projects-sidebar-selected")
  }

  function unmountList() {
    disposeUpdate?.()
    disposeUpdate = undefined
    disposeWidth?.()
    disposeWidth = undefined
    native?.removeAttribute("data-projects-sidebar-covered")
    const cleanup = disposeList
    const list = root
    disposeList = undefined
    root = undefined
    native = undefined
    try { cleanup?.() } finally { list?.remove() }
  }

  function removeCard() {
    restoreRadios()
    card?.remove()
    card = undefined
    fieldset = undefined
  }

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
    const node = doc.createElement(tag)
    if (text) node.textContent = text
    return node
  }

  function makeCard(parent: HTMLFieldSetElement) {
    const inputs = nativeInputs(parent)
    // Do not guess a changed or expanded host schema after an update.
    if (inputs.length !== 3 || ["top", "side", "inbox"].some((value) => !inputs.some((input) => input.value === value))) return
    if (!inputs[0].name || inputs.some((input) => input.name !== inputs[0].name)) return

    fieldset = parent
    const text = options.copy()
    card = element("label")
    card.dataset.slot = "interface-mode-option"
    card.setAttribute("data-projects-sidebar-card", "")
    card.title = `${text.title} — ${text.badge}\n${text.description}`
    const input = element("input")
    input.type = "radio"
    input.name = inputs[0].name
    input.value = "projects-sidebar-prototype"
    input.setAttribute("aria-label", `${text.title} — ${text.badge}`)
    input.addEventListener("change", () => {
      if (!input.checked) return
      const inbox = nativeInputs(parent).find((item) => item.value === "inbox")
      if (!inbox) return
      failed = false
      switching = true
      try {
        // Invoke the existing handler: never write an unknown layout into host preferences.
        inbox.click()
        options.setEnabled(true)
      } finally {
        switching = false
        refresh()
      }
    })

    const preview = element("span")
    preview.dataset.slot = "interface-mode-sketch"
    preview.className = "psb-preview"
    preview.setAttribute("aria-hidden", "true")
    const rail = element("span")
    rail.dataset.slot = "preview-rail"
    rail.className = "psb-preview-rail"
    for (let group = 0; group < 2; group++) {
      const heading = element("span")
      heading.className = "psb-preview-group"
      const row = element("span")
      row.dataset.slot = "preview-tab"
      if (group === 0) row.setAttribute("data-active", "")
      rail.append(heading, row)
    }
    const chat = element("span")
    chat.dataset.slot = "preview-page"
    for (let line = 0; line < 2; line++) {
      const bar = element("span")
      bar.dataset.slot = "preview-line"
      chat.append(bar)
    }
    const composer = element("span")
    composer.dataset.slot = "preview-composer"
    chat.append(composer)
    preview.append(rail, chat)

    const title = element("span", text.title)
    title.dataset.slot = "interface-mode-name"
    card.append(input, preview, title)
    parent.append(card)
  }

  function makeList(inbox: HTMLElement) {
    const text = options.copy()
    const list = element("section")
    list.setAttribute("data-projects-sidebar-root", "")
    list.setAttribute("aria-label", `${text.title} — ${text.badge}`)
    inbox.after(list)
    native = inbox
    root = list
    disposeList = options.mountList(list)
    if (failed) return
    list.dataset.ready = "true"
    // CSS also requires a connected, ready sibling: removing our list reveals Inbox immediately.
    inbox.setAttribute("data-projects-sidebar-covered", "")
    disposeUpdate = installFooterUpdate(list)
    if (options.width) disposeWidth = installSidebarWidth(list, options.width)
  }

  function reconcile() {
    if (disposed) return
    if (!ready()) return
    const text = options.copy()
    if (language?.title !== text.title) {
      removeCard()
      unmountList()
    }
    language = text

    const settings = doc.querySelector<HTMLFieldSetElement>(selectors.settings)
    if (fieldset !== settings || !card?.isConnected) {
      removeCard()
      if (settings) makeCard(settings)
    }

    const inbox = doc.querySelector<HTMLElement>(selectors.inbox)
    const selected = fieldset && nativeInputs(fieldset).find((input) => input.parentElement!.hasAttribute("data-checked"))
    if (options.enabled() && selected && selected.value !== "inbox") options.setEnabled(false)
    const active = !failed && options.enabled() && !!inbox

    if (root && (native !== inbox || !root.isConnected || root.previousElementSibling !== inbox || !active)) unmountList()
    if (active && !root) makeList(inbox)
    if (!options.enabled() || failed || root?.dataset.ready === "true") releaseStartup()

    if (fieldset && card) {
      if (active && !failed) {
        fieldset.setAttribute("data-projects-sidebar-selected", "")
        if (!card.hasAttribute("data-checked")) card.setAttribute("data-checked", "")
        card.querySelector("input")!.checked = true
      } else {
        if (card.hasAttribute("data-checked")) card.removeAttribute("data-checked")
        restoreRadios()
      }
    }
  }

  function fail() {
    if (disposed || failed) return
    failed = true
    disposeUpdate?.()
    disposeUpdate = undefined
    disposeWidth?.()
    disposeWidth = undefined
    releaseStartup()
    // Reveal Inbox immediately, even before the failed Solid tree is disposed.
    native?.removeAttribute("data-projects-sidebar-covered")
    root?.removeAttribute("data-ready")
    refresh()
    options.onError?.()
  }

  function refresh() {
    if (disposed || queued) return
    queued = true
    queueMicrotask(() => {
      queued = false
      try {
        reconcile()
      } catch {
        // A changed host DOM must fail open, not leave an empty or inaccessible sidebar.
        fail()
        try { unmountList() } finally { removeCard() }
      }
    })
  }

  const changed = (event: Event) => {
    const target = event.target
    if (switching || !fieldset || !target || !nativeInputs(fieldset).includes(target as HTMLInputElement)) return
    options.setEnabled(false)
    refresh()
  }
  doc.addEventListener("change", changed, true)

  const observer = new doc.defaultView!.MutationObserver((records) => {
    const relevant = records.some((record) => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
      if (target?.closest(`${selectors.card}, ${selectors.root}`)) return false
      if (record.type === "attributes") return !!target?.closest(selectors.settings)
      if (target?.closest(`${selectors.settings}, #vertical-tabs-sidebar`)) return true
      return [...record.addedNodes, ...record.removedNodes].some((node) =>
        node.nodeType === 1 && ((node as Element).matches(`${selectors.settings}, #vertical-tabs-sidebar`) ||
          !!(node as Element).querySelector(`${selectors.settings}, #vertical-tabs-sidebar`)),
      )
    })
    if (relevant) refresh()
  })
  observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-checked"] })
  refresh()

  return {
    refresh,
    fail,
    dispose() {
      disposed = true
      doc.defaultView!.clearTimeout(startupTimer)
      releaseStartup()
      observer.disconnect()
      doc.removeEventListener("change", changed, true)
      unmountList()
      removeCard()
    },
  }
}
