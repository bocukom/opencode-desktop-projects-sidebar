import { For, Show, createEffect, onCleanup, onMount } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import type { Copy } from "./copy.ts"
import type { Waiting } from "./requests.ts"
import { alignActivityPopup } from "./activity-popup.ts"

export type ActivityEntry = { server: string; id: string; title: string; waiting?: Waiting }

export function HistoryFooter(props: {
  ctx: Pick<Context, "ui" | "tabs">
  lists: Record<"running" | "ready", ActivityEntry[]>
  text: Copy
  settings?(): void
  reveal?(item: ActivityEntry): void
}) {
  let footer!: HTMLDivElement
  const popups = new Map<HTMLElement, () => void>()
  onCleanup(() => { popups.forEach((dispose) => dispose()); popups.clear() })
  const heading = (kind: "running" | "ready") => kind === "running" ? props.text.runningShort : props.text.readyShort
  // Ui.Menu does not expose class/title props. Decorate only menus explicitly linked
  // to our triggers; never replace native nodes, labels, handlers or keyboard behavior.
  const decorate = () => {
    if (!footer) return
    for (const [menu, dispose] of popups) if (!menu.isConnected) { dispose(); popups.delete(menu) }
    for (const kind of ["running", "ready"] as const) {
      const trigger = footer.querySelector(`[data-psb-counter="${kind}"] button`)
      const id = trigger?.getAttribute("aria-controls")
      const menu = id && document.getElementById(id)
      if (!menu || menu.getAttribute("aria-labelledby") !== trigger?.id) continue
      menu.classList.add("psb-activity-menu")
      menu.dataset.psbKind = kind
      menu.dir = getComputedStyle(footer).direction
      if (!popups.has(menu)) popups.set(menu, alignActivityPopup(footer, menu))
      const groupLabel = menu.querySelector<HTMLElement>('[data-slot="menu-v2-group-label"]')
      if (groupLabel) {
        groupLabel.dataset.psbHeading = heading(kind)
        groupLabel.dataset.psbCount = String(props.lists[kind].length)
      }
      menu.querySelectorAll<HTMLElement>('[role="menuitem"]').forEach((row, index) => {
        const item = props.lists[kind][index]
        if (!item) return
        const description = item.waiting ? props.text[item.waiting] : ""
        row.title = [item.title, description].filter(Boolean).join("\n")
        row.setAttribute("aria-label", [item.title, description].filter(Boolean).join(" — "))
        row.dataset.psbWaiting = item.waiting ?? ""
        row.querySelector<HTMLElement>('[data-slot="menu-v2-item-content"]')?.setAttribute("data-psb-description", item.waiting ? props.text[`${item.waiting}Short`] : "")
      })
    }
  }
  onMount(() => {
    const observer = new MutationObserver(decorate)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-controls"] })
    onCleanup(() => observer.disconnect())
    decorate()
  })
  createEffect(decorate)
  return <div class="psb-footer">
    <div class="psb-footer-activity" ref={footer} role="group" aria-label={`${props.text.runningShort} / ${props.text.readyShort}`}>
      <For each={(["running", "ready"] as const)}>{(kind) => {
        const items = () => props.lists[kind]
        const label = () => `${heading(kind)} · ${items().length}`
        const menu = (disabled: boolean) => <props.ctx.ui.Menu trigger="button" label={label()}
          placement="top-start" disabled={disabled}
          items={[{ type: "group", label: label(), items: items().map((item) => ({ label: item.title,
            onSelect: () => {
              props.ctx.tabs.open({ server: item.server, id: item.id }, { focus: true })
              props.reveal?.(item)
            } })) }]} />
        return <div class="psb-footer-counter" data-psb-counter={kind} data-active={items().length ? "true" : "false"}
          title={`${kind === "running" ? props.text.runningList : props.text.readyList}: ${items().length}`}>
          {/* Menu has no controlled-open API. Dispose its popup when the last entry disappears. */}
          <Show when={items().length > 0} fallback={menu(true)}>{menu(false)}</Show>
          <span class="psb-counter-face" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <Show when={kind === "running"} fallback={<><rect x="3" y="3" width="10" height="10" rx="3" /><path d="m5.5 8 1.7 1.7 3.3-3.4" /></>}>
                <circle cx="8" cy="8" r="5.4" /><path d="M8 4.8V8l2 1.3" />
              </Show>
            </svg>
            <span class="psb-counter-label">{heading(kind)}</span>
            <span class="psb-counter-badge">{items().length}</span>
          </span>
        </div>
      }}</For>
    </div>
    <div class="psb-footer-actions">
    <span class="psb-footer-update-slot" aria-hidden="true" />
    <Show when={props.settings}>
      <button type="button" class="psb-footer-settings" title={props.text.settings} aria-label={props.text.settings} onClick={() => props.settings?.()}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 3-.6 2.3-2 .9L4.2 6l-2 3.5 1.6 1.7v2L2.2 15l2 3.5 2.2-.3 2 .9L9 21h4l.6-2 2-.9 2.2.3 2-3.5-1.6-1.8v-2l1.6-1.6-2-3.5-2.2.2-2-.9L13 3Z" transform="translate(1 0)" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </Show>
    </div>
  </div>
}
