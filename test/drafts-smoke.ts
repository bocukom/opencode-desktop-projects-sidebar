import type { Context } from "@opencode/plugin/gui"
import type { DraftLinks } from "../src/project-drafts.ts"

/** Real native drafts only. Never edits pre-existing drafts, submits, or creates server sessions. */
export async function runDraftsSmoke(ctx: Pick<Context, "tabs">, links: () => DraftLinks) {
  const results: string[] = []
  const check = (ok: unknown, name: string) => { if (!ok) throw new Error(name); results.push(name) }
  const wait = (predicate: () => boolean) => new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve() }
      else if (Date.now() - start > 15000) { clearInterval(timer); reject(new Error("Native draft check timed out")) }
    }, 25)
  })
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const before = new Set(ctx.tabs.list().map((tab) => tab.key))
  const active = ctx.tabs.list().find((tab) => tab.active)?.key
  const created = new Set<string>()
  const root = () => document.querySelector<HTMLElement>("[data-projects-sidebar-root]")!
  const groups = [...root().querySelectorAll<HTMLDetailsElement>("[data-psb-group]")]
  const free = groups.filter((group) => {
    const [server, , directory] = JSON.parse(group.dataset.psbGroup!) as string[]
    return !group.querySelector<HTMLButtonElement>("[data-psb-project-new]")!.disabled
      && !ctx.tabs.list().some((tab) => links()[tab.key]?.server === server && links()[tab.key]?.directory === directory)
  })
  const editor = () => document.querySelector<HTMLElement>('[data-component="new-session"] [data-component="composer-editor"][contenteditable="true"]')
  const current = () => ctx.tabs.list().find((tab) => tab.active)?.key
  const plus = (group: Element) => group.querySelector<HTMLButtonElement>("[data-psb-project-new]")!
  check(groups.every((group) => plus(group).getAttribute("aria-label") && plus(group).type === "button"), "Every project has an accessible native plus button")
  if (matchMedia("(hover: hover)").matches) {
    const inactive = groups.find((group) => !group.matches(":hover") && group.open && !plus(group).disabled)
    if (inactive) {
      const outside = root().querySelector<HTMLButtonElement>("[data-psb-restore]")!
      const previous = document.activeElement as HTMLElement | null
      const style = () => getComputedStyle(plus(inactive))
      const box = () => plus(inactive).getBoundingClientRect()
      try {
        outside.focus(); await frame()
        const original = box()
        check(style().opacity === "0" && style().pointerEvents === "none", "Project plus is invisible and non-clickable outside its project block")
        inactive.querySelector("summary")!.focus(); await frame()
        check(style().opacity === "1" && style().pointerEvents === "auto", "Focusing a project heading reveals its plus for keyboard navigation")
        inactive.querySelector<HTMLButtonElement>("[data-psb-session]")!.focus(); await frame()
        check(style().opacity === "1", "Focus in a project's chat rows also keeps its plus visible")
        plus(inactive).focus(); await frame()
        check(style().opacity === "1" && document.activeElement === plus(inactive), "The revealed plus remains directly keyboard-focusable")
        outside.focus(); await frame()
        check(style().opacity === "0" && style().pointerEvents === "none", "Leaving the project block hides its plus again")
        check(box().x === original.x && box().width === original.width && box().height === original.height, "Showing and hiding project plus does not shift the header layout")
      } finally { previous?.focus() }
    }
  }
  if (!free.length) return [...results, "Native draft check skipped: every project already has a user-owned draft"]
  const groupKey = free[0].dataset.psbGroup!
  const group = () => [...root().querySelectorAll<HTMLDetailsElement>("[data-psb-group]")].find((item) => item.dataset.psbGroup === groupKey)!
  const originallyOpen = group().open
  try {
    if (originallyOpen) { group().querySelector("summary")!.click(); await wait(() => !group().open) }
    const height = group().querySelector("summary")!.getBoundingClientRect().height
    plus(group()).click()
    await wait(() => ctx.tabs.list().some((tab) => tab.active && tab.key.startsWith("draft:") && !before.has(tab.key)) && !!editor())
    const key = current()!; created.add(key)
    check(group().open, "Project plus expands a collapsed group and opens a native draft")
    check(group().querySelector("summary")!.getBoundingClientRect().height === height && height === 26, "Plus preserves compact 26px project headings")
    check(!editor()!.textContent?.trim(), "A new project draft starts empty")
    const count = ctx.tabs.list().length
    plus(group()).click(); await frame()
    check(current() === key && ctx.tabs.list().length === count, "Repeated plus on an empty native draft reuses the same tab")
    const text = "Projects sidebar unsent diagnostic\nSecond line — do not send"
    editor()!.textContent = text
    editor()!.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }))
    await frame()
    const chat = root().querySelector<HTMLButtonElement>("[data-psb-session]:not(:disabled)")!
    chat.click(); await wait(() => !!ctx.tabs.list().find((tab) => tab.active)?.session)
    plus(group()).click(); await wait(() => current() === key && !!editor())
    await frame()
    check(editor()!.textContent === text && ctx.tabs.list().length === count, "Returning from an existing chat restores the same native draft and its multiline text")
    if (free.length > 1) {
      plus(free[1]).click()
      await wait(() => !!current()?.startsWith("draft:") && current() !== key && !!editor())
      const second = current()!; created.add(second)
      check(!editor()!.textContent?.trim(), "Another project opens a separate empty native draft")
      plus(group()).click(); await wait(() => current() === key && !!editor()); await frame()
      check(editor()!.textContent === text, "Switching projects does not mix their draft text")
    }
    root().querySelector<HTMLButtonElement>("[data-psb-restore]")!.click()
    await wait(() => !document.querySelector("[data-projects-sidebar-root]"))
    document.dispatchEvent(new Event("projects-sidebar-smoke-settings"))
    await wait(() => !!document.querySelector<HTMLInputElement>("[data-projects-sidebar-card] input"))
    document.querySelector<HTMLInputElement>("[data-projects-sidebar-card] input")!.click()
    await wait(() => !!document.querySelector("[data-projects-sidebar-root] [data-psb-project-new]") && !!group())
    plus(group()).click(); await wait(() => current() === key && !!editor()); await frame()
    check(editor()!.textContent === text, "Sidebar disable/remount still resumes the same populated native draft")
    check(created.size === ctx.tabs.list().filter((tab) => !before.has(tab.key) && tab.key.startsWith("draft:")).length, "Draft checks leave no duplicate native drafts")
  } finally {
    for (const key of created) {
      ctx.tabs.close(key)
      await wait(() => !ctx.tabs.list().some((tab) => tab.key === key))
    }
    if (active) ctx.tabs.focus(active)
    if (group() && group().open !== originallyOpen) group().querySelector("summary")!.click()
  }
  check([...created].every((key) => !ctx.tabs.list().some((tab) => tab.key === key)), "Diagnostic native drafts are closed without sending prompts")
  return results
}
