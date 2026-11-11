import { render } from "solid-js/web"
import type { Context } from "@opencode/plugin/gui"
import { SessionRow } from "../src/session-row.tsx"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"

/** Real component and DOM events, but mock writes: never renames a user's session. */
export async function runRenameSmoke(ctx: Pick<Context, "ui">) {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  // Chromium can change activeElement without emitting blur in a background app window.
  // Supply only that missing event; never double-dispatch a real foreground blur.
  const focus = (target: HTMLElement) => {
    const previous = document.activeElement
    let blurred = false
    const onBlur = () => { blurred = true }
    previous?.addEventListener("blur", onBlur)
    target.focus()
    previous?.removeEventListener("blur", onBlur)
    if (previous && previous !== target && document.activeElement === target && !blurred) previous.dispatchEvent(new FocusEvent("blur", { relatedTarget: target }))
  }
  const previous = document.activeElement as HTMLElement | null
  async function scenario(test: (f: {
    host: HTMLElement; outside: HTMLButtonElement; writes: string[]
    edit(value?: string): Promise<HTMLInputElement>
    fail(value: boolean): void; wait(promise: Promise<void>): void
  }) => Promise<void>, title = "Original") {
    const host = document.createElement("div")
    host.setAttribute("data-projects-sidebar-root", "")
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:240px"
    const content = document.createElement("div")
    const outside = document.createElement("button")
    host.append(content, outside); document.body.append(host)
    const writes: string[] = []
    let fail = false, pending = Promise.resolve()
    const dispose = render(() => <SessionRow ctx={{ ui: ctx.ui, tabs: { list: () => [], open() {}, close() {}, move() {}, focus() {} } }}
      server="mock" session={session("mock", "/mock", { title })} connected selected={false} text={copy("en")}
      actions={{
        rename: async (_server, _id, title) => { writes.push(title); await pending; return !fail },
        fork: async () => false, close: async () => false, remove: async () => false, dispose() {},
      }} />, content)
    try {
      // A diagnostic listener can run inside the host's reactive event batch.
      await settle()
      await test({ host, outside, writes,
        edit: async (value) => {
          content.querySelector(".psb-session > span")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
          await settle()
           const input = content.querySelector<HTMLInputElement>("input")!
          if (document.activeElement !== input) throw new Error("Mock rename editor did not receive focus")
           if (value !== undefined) { input.value = value; input.dispatchEvent(new InputEvent("input", { bubbles: true })) }
          return input
        },
        fail: (value) => { fail = value }, wait: (value) => { pending = value },
      })
    } finally { dispose(); host.remove() }
  }
  try {
    const longTitle = "Начало названия — " + "длинное название сессии ".repeat(20) + "конец"
    await scenario(async (f) => {
      const input = await f.edit()
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      check(input.selectionStart === 0 && input.selectionEnd === 0, "Rename places the caret at the beginning without selecting the title")
      check(input.scrollWidth > input.clientWidth && input.scrollLeft === 0, "Long rename titles show their beginning instead of scrolling to the end")
      input.setRangeText("Prefix ", input.selectionStart!, input.selectionEnd!, "end")
      input.dispatchEvent(new InputEvent("input", { bubbles: true }))
      focus(f.outside); await settle()
      check(f.writes.length === 1 && f.writes[0] === "Prefix " + longTitle, "Typing at the initial caret prepends text without replacing the existing title")
    }, longTitle)
    await scenario(async (f) => {
      await f.edit("Original2")
      check(getComputedStyle(f.host.querySelector(".psb-activity")!).display === "none", "Gray dot stays hidden during inline editing")
      focus(f.outside); await settle()
      check(f.writes.join() === "Original2" && !f.host.querySelector("input"), "Changed title saves when focus leaves the editor")
      check(document.activeElement === f.outside, "Blur save does not steal focus from the clicked target")
      check(getComputedStyle(f.host.querySelector(".psb-activity")!).display === "none", "Successful blur save keeps idle activity hidden")
    })
    await scenario(async (f) => {
      const input = await f.edit("Cancelled")
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      focus(f.outside); await settle()
      check(!f.writes.length && !f.host.querySelector("input"), "Escape discards edits even when editor removal fires blur")
    })
    // :focus-visible cannot be exercised by programmatic focus in a background window.
    if (document.hasFocus()) await scenario(async (f) => {
      const input = await f.edit("Original")
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle()
      const row = f.host.querySelector<HTMLElement>(".psb-session-row")!
      const button = row.querySelector<HTMLButtonElement>(".psb-session")!
      check(getComputedStyle(row).outlineStyle === "none", "Finishing Rename does not leave a row-wide focus ring")
      focus(f.outside); focus(button); await settle()
      check(button.matches(":focus-visible") && getComputedStyle(button).outlineStyle === "none" && getComputedStyle(row).outlineStyle === "solid",
        "Keyboard focus outlines the full session row, not the inset title button")
      check(getComputedStyle(row).outlineWidth === "2px" && getComputedStyle(row).outlineOffset === "-2px" && getComputedStyle(row.querySelector(".psb-activity")!).display === "none",
        "Full-row keyboard ring stays inside the row with idle activity hidden")
      const menu = row.querySelector<HTMLButtonElement>(".psb-actions button")!
      focus(menu); await settle()
      check(getComputedStyle(row).outlineStyle === "none" && getComputedStyle(menu).outlineStyle === "solid", "Tabbing to the menu keeps its own distinct keyboard focus ring")
    })
    else results.push("Keyboard focus-ring check skipped: the desktop window is in the background")
    await scenario(async (f) => {
      await f.edit("Original"); focus(f.outside); await settle()
      check(!f.writes.length && !f.host.querySelector("input"), "Unchanged title exits on blur without a write")
    })
    await scenario(async (f) => {
      await f.edit("   "); focus(f.outside); await settle()
      check(!f.writes.length && !f.host.querySelector("input"), "Empty title on blur preserves the original name")
    })
    await scenario(async (f) => {
      let release!: () => void
      f.wait(new Promise<void>((resolve) => { release = resolve }))
      const input = await f.edit("Saved once")
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      focus(f.outside); await settle(); release(); await settle()
      check(f.writes.join() === "Saved once" && !f.host.querySelector("input"), "Enter followed by blur sends exactly one rename")
    })
    await scenario(async (f) => {
      f.fail(true)
      const input = await f.edit("Retry me")
      focus(f.outside); await settle()
      check(f.host.querySelector("input")?.value === "Retry me" && document.activeElement === f.outside, "Failed blur save retains the draft without stealing focus")
      f.fail(false); input.focus()
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle()
      check(f.writes.length === 2 && !f.host.querySelector("input"), "Failed blur save can be retried with Enter")
    })
    return results
  } finally { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
}
