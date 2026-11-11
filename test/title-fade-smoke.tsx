import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import type { Context } from "@opencode/plugin/gui"
import { SessionRow } from "../src/session-row.tsx"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"

/** Real row and ResizeObserver, mock data only; no session writes. */
export async function runTitleFadeSmoke(ctx: Pick<Context, "ui">) {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const paint = async () => { for (let i = 0; i < 4; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())) }
  const previous = document.activeElement as HTMLElement | null
  const host = document.createElement("div")
  host.setAttribute("data-projects-sidebar-root", "")
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:240px"
  document.body.append(host)
  const [name, setName] = createSignal("Short name")
  const [working, setWorking] = createSignal(false)
  const [fork, setFork] = createSignal(false)
  const longName = "Длинное название без многоточия — ".repeat(5)
  const info = session("title-fade", "/mock")
  const unmount = render(() => <SessionRow ctx={{ ui: ctx.ui, tabs: { list: () => [], open() {}, close() {}, move() {}, focus() {} } }}
    server="mock" session={{ ...info, title: name(), fork: fork() ? { sessionID: "source", boundary: { type: "through", messageID: "message" } } : undefined }}
    selected={false} connected text={copy("en")} activity={working() ? "running" : undefined}
    actions={{ rename: async () => false, fork: async () => false, close: async () => false, remove: async () => false, dispose() {} }} />, host)
  const viewport = () => host.querySelector<HTMLElement>(".psb-title-viewport")!
  const title = () => host.querySelector<HTMLElement>(".psb-session-title")!
  const button = () => host.querySelector<HTMLButtonElement>(".psb-session")!
  const contrast = matchMedia("(forced-colors: active)").matches
  const faded = () => getComputedStyle(viewport()).maskImage !== "none"
  try {
    await paint()
    check(!viewport().hasAttribute("data-overflow") && !faded(), "Short names remain fully opaque without an unnecessary trailing fade")
    setName(longName); await paint()
    check(title().scrollWidth > title().clientWidth && viewport().hasAttribute("data-overflow"), "Long titles are detected as overflowing without changing their text")
    check(contrast ? !faded() : faded(), "Overflowing names have a static 20px trailing fade with a forced-colors fallback")
    check(getComputedStyle(title()).textOverflow === (contrast ? "ellipsis" : "clip"), "Normal titles fade instead of displaying an ellipsis")
    check(title().textContent === longName.trim() && button().title.startsWith(longName.trim()), "Full title remains intact for accessibility and its native tooltip")
    const width = title().getBoundingClientRect().width
    setWorking(true); await paint()
    check(title().getBoundingClientRect().width === width && (contrast ? !faded() : faded()), "Overflow fade remains stable when the working radar appears")
    check(matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)").matches
      ? getComputedStyle(title()).animationName === "none"
      : getComputedStyle(title()).animationName === "psb-working-wave" && getComputedStyle(title()).maskImage !== "none", "Working-title wave and overflow fade use independent nested masks")
    host.dir = "rtl"; await paint()
    check(contrast || getComputedStyle(viewport()).maskImage.includes("to left"), "Overflow fade mirrors to the trailing left edge in RTL")
    host.removeAttribute("dir")
    setWorking(false)
    setFork(true); await paint()
    check((contrast ? !faded() : faded()) && !host.querySelector(".psb-fork, small") && title().getBoundingClientRect().width === width, "Fork titles use the full available width without a redundant trailing fork badge")
    setFork(false)
    setName("Name that fits after widening")
    host.style.width = "100px"; await paint()
    check(viewport().hasAttribute("data-overflow"), "Narrowing the sidebar recomputes title overflow")
    host.style.width = "600px"; await paint()
    check(!viewport().hasAttribute("data-overflow") && !faded(), "Widening the sidebar removes the fade when the whole title fits")
    host.style.width = "240px"
    setName(longName); await paint()
    setName("Short again"); await paint()
    check(!viewport().hasAttribute("data-overflow") && !faded(), "A title update from long to short clears its stale overflow fade")
    setName(longName); host.style.display = "none"; await paint()
    host.style.removeProperty("display"); await paint()
    check(viewport().hasAttribute("data-overflow") && (contrast ? !faded() : faded()), "Revealing a collapsed or hidden row remeasures the fade")
    title().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); await paint()
    const input = host.querySelector<HTMLInputElement>(".psb-rename")!
    check(!!input && !viewport() && input.selectionStart === 0 && input.scrollLeft === 0, "Rename removes the masked viewport and starts with the beginning fully visible")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await paint()
    check(viewport().hasAttribute("data-overflow") && (contrast ? !faded() : faded()), "Cancelling Rename restores overflow detection on the new title viewport")
    return results
  } finally { unmount(); host.remove(); previous?.focus({ preventScroll: true }) }
}
