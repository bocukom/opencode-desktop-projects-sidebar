import { ErrorBoundary, createSignal } from "solid-js"
import { render } from "solid-js/web"
import { installPrototype, selectors } from "../src/adapter.ts"
import { copy } from "../src/copy.ts"
import { mountFixture } from "./fixture-markup.ts"

/** An isolated iframe exercises real Solid runtime recovery without touching host preferences or chats. */
export async function runFallbackSmoke(css: string) {
  const frame = document.createElement("iframe")
  frame.hidden = true
  document.body.append(frame)
  const doc = frame.contentDocument!
  mountFixture(doc)
  const style = doc.createElement("style")
  style.textContent = css
  doc.head.append(style)
  const [broken, setBroken] = createSignal(false)
  const Broken = () => {
    const title = () => { if (broken()) throw new Error("Mock incompatible renderer"); return "Mock history" }
    return <span>{title()}</span>
  }
  let errors = 0
  let writes = 0
  const results: string[] = []
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); results.push(message) }
  const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const adapter = installPrototype({
    document: doc, enabled: () => true, setEnabled: () => { writes++ }, copy: () => copy("en"),
    mountList: (container) => render(() => <ErrorBoundary fallback={() => { adapter.fail(); return null }}><Broken /></ErrorBoundary>, container),
    onError: () => { errors++ },
  })
  try {
    check(doc.defaultView!.getComputedStyle(doc.querySelector(selectors.inbox)!).visibility === "hidden", "Saved Projects hides intermediate Inbox synchronously before the adapter's first reconciliation")
    await paint()
    const inbox = doc.querySelector<HTMLElement>(selectors.inbox)!
    check(!!doc.querySelector(`${selectors.root}[data-ready="true"]`) && getComputedStyle(inbox).display === "none", "Isolated compatible renderer mounts Projects and covers only native Inbox")
    check(!doc.querySelector('[data-projects-sidebar-startup]'), "Startup hiding is removed as soon as the ready Projects mount covers Inbox")
    setBroken(true)
    await paint()
    check(!doc.querySelector(selectors.root) && getComputedStyle(inbox).display !== "none", "Solid reactive rendering error automatically reveals native Inbox and removes failed Projects")
    adapter.refresh()
    await paint()
    check(errors === 1 && writes === 0 && !doc.querySelector(selectors.root), "Runtime fallback reports once, preserves preferences and does not loop")
    let clicks = 0
    inbox.querySelector("button")!.addEventListener("click", () => { clicks++ })
    inbox.querySelector<HTMLButtonElement>("button")!.click()
    check(clicks === 1, "Native Inbox actions remain intact after renderer failure")
    setBroken(false)
    doc.querySelector<HTMLInputElement>(`${selectors.card} input`)!.click()
    await paint()
    check(!!doc.querySelector(`${selectors.root}[data-ready="true"]`), "Selecting Projects explicitly retries successfully after runtime fallback")
    return results
  } finally { adapter.dispose(); frame.remove() }
}
