import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { JSDOM } from "jsdom"
import { installPrototype, selectors } from "../src/adapter.ts"
import { copy } from "../src/copy.ts"
import { mountFixture, type NativeMode } from "./fixture-markup.ts"
import { demoList } from "./demo-list.ts"

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

function fixture(mode: NativeMode = "inbox", saved = false, mount?: (container: HTMLElement) => () => void) {
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>")
  const doc = dom.window.document
  const host = mountFixture(doc, mode)
  let enabled = saved
  let errors = 0
  let locale = "en"
  const writes: boolean[] = []
  const adapter = installPrototype({
    document: doc,
    enabled: () => enabled,
    setEnabled: (value) => { enabled = value; writes.push(value) },
    copy: () => copy(locale),
    mountList: mount ?? ((container) => demoList(container, () => { enabled = false; adapter.refresh() }, locale === "ru")),
    onError: () => errors++,
  })
  const input = (value: string) => doc.querySelector<HTMLInputElement>(`input[value="${value}"]`)!
  const card = () => doc.querySelector<HTMLInputElement>(`${selectors.card} input`)!
  return {
    dom, doc, host, adapter, input, card, writes,
    enabled: () => enabled, errors: () => errors,
    disable: () => { enabled = false; adapter.refresh() },
    locale: (value: string) => { locale = value; adapter.refresh() },
    close: () => { adapter.dispose(); dom.window.close() },
  }
}

test("adds only a fourth card; initial state leaves native Inbox intact", async () => {
  const f = fixture()
  try {
    const inbox = f.doc.querySelector(selectors.inbox)
    await settle()
    assert.equal(f.doc.querySelectorAll(selectors.card).length, 1)
    assert.equal(f.doc.querySelectorAll('input[type="radio"]').length, 4)
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.doc.querySelector(selectors.inbox), inbox)
    assert.equal(inbox!.hasAttribute("data-projects-sidebar-covered"), false)
    assert.deepEqual(f.writes, [])
    assert.equal(f.input("inbox").checked, true)
    const card = f.doc.querySelector<HTMLElement>(selectors.card)!
    assert.equal(card.querySelector('[data-slot="interface-mode-name"]')?.textContent, 'Projects')
    assert.equal(card.querySelectorAll('[data-slot="interface-mode-sketch"] [data-slot="preview-rail"]').length, 1)
    assert.equal(card.querySelectorAll('[data-slot="interface-mode-copy"], [data-slot="interface-mode-description"]').length, 0)
    assert.ok(card.title.includes(copy('en').description))
  } finally { f.close() }
})

for (const mode of ["top", "side", "inbox"] as const) {
  test(`Projects selected from ${mode} uses native Inbox, not a fourth persisted layout`, async () => {
    const f = fixture(mode)
    try {
      await settle()
      f.card().click()
      await settle()
      assert.equal(f.host.mode(), "inbox")
      assert.equal(f.enabled(), true)
      const root = f.doc.querySelector(selectors.root)!
      assert.ok(root)
      assert.equal(root.previousElementSibling, f.doc.querySelector(selectors.inbox))
      assert.equal(root.getAttribute("data-ready"), "true")
      assert.equal(root.querySelectorAll("details").length, 2)
      assert.match(root.textContent!, /not real chats/)
      assert.equal(f.card().checked, true)
      assert.equal(f.input("inbox").checked, false)
      assert.equal(f.doc.querySelectorAll('input[type="radio"]:checked').length, 1)
      assert.equal(f.errors(), 0)
    } finally { f.close() }
  })
}

for (const mode of ["top", "side", "inbox"] as const) {
  test(`switching Projects → ${mode} restores the standard mode`, async () => {
    const f = fixture()
    try {
      await settle(); f.card().click(); await settle()
      f.input(mode).click(); await settle()
      assert.equal(f.host.mode(), mode)
      assert.equal(f.enabled(), false)
      assert.equal(f.doc.querySelector(selectors.root), null)
      assert.equal(f.card().checked, false)
      assert.equal(f.input(mode).checked, true)
      assert.equal(f.doc.querySelector("[data-projects-sidebar-covered]"), null)
    } finally { f.close() }
  })
}

test("Restore Inbox preserves host-owned elements and their event handlers", async () => {
  const f = fixture()
  try {
    const inbox = f.doc.querySelector(selectors.inbox)!
    const header = f.doc.querySelector("aside header")
    let clicked = 0
    inbox.querySelector("button")!.addEventListener("click", () => clicked++)
    await settle(); f.card().click(); await settle()
    f.doc.querySelector<HTMLButtonElement>(`${selectors.root} button`)!.click()
    await settle()
    assert.equal(f.doc.querySelector(selectors.inbox), inbox)
    assert.equal(f.doc.querySelector("aside header"), header)
    inbox.querySelector("button")!.click()
    assert.equal(clicked, 1)
    assert.equal(f.input("inbox").checked, true)
  } finally { f.close() }
})

test("unloading cleans nodes, attributes, radio selection and event listeners", async () => {
  const f = fixture()
  try {
    await settle(); f.card().click(); await settle()
    f.adapter.dispose()
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.doc.querySelector(selectors.card), null)
    assert.equal(f.doc.querySelector("[data-projects-sidebar-covered]"), null)
    assert.equal(f.doc.querySelector("[data-projects-sidebar-selected]"), null)
    assert.equal(f.input("inbox").checked, true)
    const writes = f.writes.length
    f.input("top").click(); await settle()
    assert.equal(f.writes.length, writes)
    assert.equal(f.doc.querySelector(selectors.card), null)
  } finally { f.close() }
})

test("hot reload does not duplicate cards or lists", async () => {
  const f = fixture()
  try {
    await settle(); f.card().click(); await settle()
    const original = f.doc.querySelector(selectors.root)
    for (let i = 0; i < 8; i++) f.adapter.refresh()
    await settle()
    assert.equal(f.doc.querySelectorAll(selectors.root).length, 1)
    assert.equal(f.doc.querySelectorAll(selectors.card).length, 1)
    assert.equal(f.doc.querySelector(selectors.root), original)
    f.adapter.dispose()
    const next = installPrototype({ document: f.doc, enabled: () => true, setEnabled: () => {}, copy: () => copy("en"), mountList: demoList })
    await settle()
    assert.equal(f.doc.querySelectorAll(selectors.root).length, 1)
    assert.equal(f.doc.querySelectorAll(selectors.card).length, 1)
    next.dispose()
  } finally { f.close() }
})

test("saved Projects state restores without any host version allowlist", async () => {
  const f = fixture("inbox", true)
  try {
    const source = readFileSync(new URL("../src/adapter.ts", import.meta.url), "utf8")
    const gui = readFileSync(new URL("../src/gui.tsx", import.meta.url), "utf8")
    assert.doesNotMatch(source, /\bversion\b/)
    assert.doesNotMatch(gui, /ctx\.app\.version/)
    await settle()
    assert.ok(f.doc.querySelector(selectors.root))
    assert.equal(f.card().disabled, false)
    assert.equal(f.card().checked, true)
    assert.deepEqual(f.writes, [])
  } finally { f.close() }
})

test("mount failure reveals Inbox, preserves the preference and retries only on explicit selection", async () => {
  let mounts = 0
  const f = fixture("inbox", true, (container) => {
    if (++mounts === 1) throw new Error("Changed host API")
    return demoList(container)
  })
  try {
    await settle()
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.doc.querySelector("[data-projects-sidebar-covered]"), null)
    assert.equal(f.input("inbox").checked, true)
    assert.equal(f.enabled(), true)
    assert.equal(f.errors(), 1)
    f.adapter.refresh(); f.doc.querySelector("aside")!.append(f.doc.createElement("span"))
    await settle()
    assert.equal(mounts, 1)
    f.card().click(); await settle()
    assert.equal(mounts, 2)
    assert.ok(f.doc.querySelector(`${selectors.root}[data-ready="true"]`))
    assert.equal(f.card().checked, true)
  } finally { f.close() }
})

test("runtime failure immediately reveals Inbox and reports only once without changing saved state", async () => {
  const f = fixture("inbox", true)
  try {
    await settle()
    const root = f.doc.querySelector(selectors.root)!
    f.adapter.fail(); f.adapter.fail()
    assert.equal(f.doc.querySelector("[data-projects-sidebar-covered]"), null)
    assert.equal(root.hasAttribute("data-ready"), false)
    await settle()
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.input("inbox").checked, true)
    assert.equal(f.enabled(), true)
    assert.equal(f.errors(), 1)
    assert.deepEqual(f.writes, [])
  } finally { f.close() }
})

test("a failing cleanup cannot leave a blank sidebar or an endless retry loop", async () => {
  let cleanups = 0
  const f = fixture("inbox", true, (container) => {
    container.textContent = "Mock history"
    return () => { cleanups++; throw new Error("Changed cleanup API") }
  })
  try {
    await settle()
    f.adapter.fail()
    await settle()
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.doc.querySelector("[data-projects-sidebar-covered]"), null)
    assert.equal(f.input("inbox").checked, true)
    assert.equal(cleanups, 1)
    assert.equal(f.errors(), 1)
  } finally { f.close() }
})

test("a changed native radio schema is left alone", async () => {
  const f = fixture()
  try {
    f.doc.querySelector('input[value="inbox"]')!.remove()
    await settle()
    assert.equal(f.doc.querySelector(selectors.card), null)
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.errors(), 0)
  } finally { f.close() }
})

test("late-mounted Preferences and Inbox are detected", async () => {
  const f = fixture()
  try {
    const children = [...f.doc.body.childNodes]
    f.doc.body.replaceChildren()
    await settle()
    f.doc.body.append(...children)
    await settle()
    f.card().click(); await settle()
    assert.ok(f.doc.querySelector(selectors.root))
    const settings = f.doc.querySelector(selectors.settings)!
    settings.remove(); await settle()
    assert.ok(f.doc.querySelector(selectors.root))
    f.doc.querySelector("main")!.append(settings); await settle()
    assert.equal(f.doc.querySelectorAll(selectors.card).length, 1)
    assert.equal(f.card().checked, true)
  } finally { f.close() }
})

test("language changes update only plugin-owned content", async () => {
  const f = fixture()
  try {
    await settle(); f.card().click(); await settle()
    const inbox = f.doc.querySelector(selectors.inbox)
    f.locale("ru"); await settle()
    assert.match(f.doc.querySelector(selectors.root)!.textContent!, /не настоящие чаты/)
    assert.equal(f.doc.querySelector(selectors.inbox), inbox)
    assert.equal(f.card().getAttribute("aria-label"), "Проекты — Эксперимент")
  } finally { f.close() }
})

test("hide selector requires a ready, immediately adjacent plugin root", () => {
  const f = fixture()
  try {
    const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
    const hide = css.slice(css.indexOf('[data-slot="sidebar-inbox"]'), css.indexOf("{", css.indexOf('[data-slot="sidebar-inbox"]'))).trim()
    const inbox = f.doc.querySelector(selectors.inbox)!
    inbox.setAttribute("data-projects-sidebar-covered", "")
    assert.equal(inbox.matches(hide), false)
    const root = f.doc.createElement("section")
    root.setAttribute("data-projects-sidebar-root", "")
    inbox.after(root)
    assert.equal(inbox.matches(hide), false)
    root.setAttribute("data-ready", "true")
    assert.equal(inbox.matches(hide), true)
    root.remove()
    assert.equal(inbox.matches(hide), false)
  } finally { f.close() }
})

test("disposal cancels an already queued reconciliation", async () => {
  const f = fixture()
  try {
    f.adapter.dispose()
    await settle()
    assert.equal(f.doc.querySelector(selectors.card), null)
    assert.equal(f.doc.querySelector(selectors.root), null)
  } finally { f.close() }
})

function compactGutterSelector() {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
  const start = css.indexOf('#vertical-tabs-sidebar [data-slot="vertical-tabs-mount"]')
  const end = css.indexOf("}", start)
  const rule = css.slice(start, end)
  assert.match(rule, /padding-inline-start: 9px;/)
  assert.match(rule, /padding-inline-end: 5px;/)
  assert.match(rule, /--psb-history-edge: 5px;/)
  assert.match(rule, /padding-bottom: 0 !important;/)
  assert.doesNotMatch(rule, /(?:width|padding-block|padding-top|margin):/)
  return rule.slice(0, rule.indexOf("{")).trim()
}

test("compact gutters and removal of duplicate bottom inset follow Projects activation, mode switches and disposal without modifying host styles", async () => {
  const f = fixture()
  try {
    await settle()
    const selector = compactGutterSelector()
    const mount = f.doc.querySelector<HTMLElement>('[data-slot="vertical-tabs-mount"]')!
    const originalStyle = mount.getAttribute("style")
    assert.equal(mount.matches(selector), false)
    f.card().click(); await settle()
    assert.equal(mount.matches(selector), true)
    assert.equal(mount.getAttribute("style"), originalStyle)
    f.doc.querySelector<HTMLButtonElement>(`${selectors.root} button`)!.click(); await settle()
    assert.equal(mount.matches(selector), false)
    f.card().click(); await settle()
    assert.equal(mount.matches(selector), true)
    f.input("inbox").click(); await settle()
    assert.equal(mount.matches(selector), false)
    f.card().click(); await settle()
    f.adapter.dispose()
    assert.equal(mount.matches(selector), false)
    assert.equal(mount.getAttribute("style"), originalStyle)
  } finally { f.close() }
})

test("compact gutters fail open if the root is unready, detached or no longer covers the adjacent Inbox", async () => {
  const f = fixture()
  try {
    await settle(); f.card().click(); await settle()
    const selector = compactGutterSelector()
    const mount = f.doc.querySelector('[data-slot="vertical-tabs-mount"]')!
    const root = f.doc.querySelector<HTMLElement>(selectors.root)!
    const inbox = f.doc.querySelector(selectors.inbox)!
    assert.equal(mount.matches(selector), true)
    root.removeAttribute("data-ready")
    assert.equal(mount.matches(selector), false)
    root.dataset.ready = "true"
    inbox.removeAttribute("data-projects-sidebar-covered")
    assert.equal(mount.matches(selector), false)
    inbox.setAttribute("data-projects-sidebar-covered", "")
    inbox.after(f.doc.createElement("div"))
    assert.equal(mount.matches(selector), false)
    inbox.after(root)
    assert.equal(mount.matches(selector), true)
    root.remove()
    assert.equal(mount.matches(selector), false)
  } finally { f.close() }
})

test("fallback to Inbox restores native gutters", async () => {
  const f = fixture("inbox", true)
  try {
    await settle()
    assert.equal(f.doc.querySelector('[data-slot="vertical-tabs-mount"]')!.matches(compactGutterSelector()), true)
    f.adapter.fail()
    await settle()
    assert.equal(f.doc.querySelector('[data-slot="vertical-tabs-mount"]')!.matches(compactGutterSelector()), false)
  } finally { f.close() }
})
