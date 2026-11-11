import { createMemo, createSignal } from "solid-js"
import { render } from "solid-js/web"
import type { Context } from "@opencode/plugin/gui"
import { SessionList } from "../src/session-list.tsx"
import { SessionRow } from "../src/session-row.tsx"
import { sessionTree } from "../src/session-tree.ts"
import { createSessionActions, type ActionContext } from "../src/session-actions.ts"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"

/** Exercise the real tree and native menu with mock API writes; never fork real history. */
export async function runForksSmoke(ctx: Pick<Context, "ui">, preview?: HTMLElement) {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
  const previous = document.activeElement as HTMLElement | null
  const host = document.createElement("div")
  host.setAttribute("data-projects-sidebar-root", "")
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:240px"
  document.body.append(host)
  const [sessions, setSessions] = createSignal([
    session("source", "/mock", { time: { created: 1, idle: 10 , updated: 10 } }),
    session("other", "/mock", { time: { created: 1, idle: 20 , updated: 20 } }),
  ])
  const [selected, select] = createSignal("source")
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
  const calls: string[] = []
  let count = 0
  const api = {
    servers: { get: () => ({ connected: true, compatible: true, client: { session: {
      fork: async ({ sessionID }: { sessionID: string }) => {
        calls.push(`fork:${sessionID}`)
        return session(`fork-${++count}`, "/mock", { time: { created: 1, idle: 100 + count , updated: 100 + count }, fork: { sessionID, boundary: { type: "through", messageID: "message" } } })
      },
      update: async () => {},
    } } }) },
    tabs: { list: () => [], open: ({ id }: { id: string }) => { calls.push(`open:${id}`); select(id) }, close() {}, move() {}, focus() {} },
    toast: { show: () => { throw new Error("Unexpected fork error toast") } },
  } as unknown as ActionContext
  const actions = createSessionActions(api, () => copy("en"), {
    groups: () => [], renamed() {}, removed() {}, refresh() {},
    added: (_server, info) => setSessions((items) => [...items, info]),
  })
  const mount = () => render(() => {
    const tree = createMemo(() => sessionTree(sessions()))
    return <SessionList nodes={tree()} collapsed={(id) => collapsed().has(id)} collapse={(id, closed) => setCollapsed((value) => {
      const next = new Set(value)
      if (closed) next.add(id)
      else next.delete(id)
      return next
    })} row={(info, branch) => <SessionRow ctx={{ ui: ctx.ui, tabs: api.tabs }} branch={branch}
      actions={actions} server="mock" session={info()} connected selected={selected() === info().id} text={copy("en")} />} />
  }, host)
  let dispose = mount()
  const row = (id: string) => host.querySelector<HTMLElement>(`[data-psb-tree-node="${id}"] > .psb-session-row`)!
  const button = (id: string) => row(id).querySelector<HTMLButtonElement>(".psb-session")!
  const toggle = (id: string) => row(id).querySelector<HTMLButtonElement>(".psb-fork-toggle")!
  const list = (id: string) => host.querySelector<HTMLUListElement>(`[data-psb-tree-node="${id}"] > ul`)!
  const childIDs = (list: Element) => [...list.children].map((node) => node.getAttribute("data-psb-tree-node"))
  try {
    await settle()
    check(!host.querySelector(".psb-fork-toggle"), "Sessions without forks have no disclosure or extra title inset")
    const sourceRow = row("source")
    sourceRow.querySelector<HTMLButtonElement>(".psb-actions button")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    await settle()
    const menu = [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((menu) => menu.getBoundingClientRect().height > 0)!
    const forkItem = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.trim() === "Fork")!
    forkItem.focus(); forkItem.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await settle()
    check(calls.join() === "fork:source,open:fork-1", "Native Fork menu creates and opens only an independent mock fork, without compaction")
    check(button("fork-1").getAttribute("aria-current") === "page", "Newly created fork is selected")
    const children = host.querySelector<HTMLElement>('[data-psb-tree-node="source"] > ul')!
    check(children?.classList.contains("psb-fork-children") && childIDs(children).join() === "fork-1", "New fork renders in a nested list directly under its source")
    check(childIDs(host.firstElementChild!).join() === "other,source", "Fork creation does not promote the source above newer root chats")
    check(row("source") === sourceRow, "Adding a child preserves the existing source row")
    check(toggle("source").getAttribute("aria-expanded") === "true" && toggle("source").getAttribute("aria-controls") === children.id && !toggle("fork-1"), "Only a source with children gets an accessible branch disclosure")
    const chevron = toggle("source").querySelector("path")!
    check(toggle("source").querySelector("svg")!.getBoundingClientRect().width === 10 && chevron.getAttribute("fill") === "none" && chevron.getAttribute("stroke-linecap") === "round" && chevron.getAttribute("stroke-linejoin") === "round", "Branch uses a compact 10px outlined chevron with rounded ends and join")
    check(getComputedStyle(button("source")).paddingInlineStart === "17px" && getComputedStyle(button("fork-1")).paddingInlineStart === "8px", "Branch disclosure keeps a compact title gap without adding a gutter to leaves")
    const sourceRect = sourceRow.getBoundingClientRect(), childRect = row("fork-1").getBoundingClientRect()
    check(Math.abs(childRect.left - sourceRect.left - 18) < 0.5 && childRect.right === sourceRect.right, "Fork is indented 18px without overflowing the parent row")
    const connector = (id: string) => getComputedStyle(row(id), "::before")
    const rounded = connector("fork-1")
    check(rounded.borderInlineStartWidth === "1px" && rounded.borderBlockEndWidth === "1px" && rounded.borderEndStartRadius === "6px", "Only-child fork ends the tree line with a rounded elbow")
    check(parseFloat(rounded.insetInlineStart) + parseFloat(rounded.width) <= 2, "Rounded fork connector ends before the compact working-indicator gutter")
    check(Math.abs(parseFloat(rounded.bottom) - childRect.height / 2) < 0.5 && rounded.top === "-1px", "Rounded tree line stops at the fork's own vertical center")
    await actions.fork("mock", "source"); await actions.fork("mock", "fork-1"); await settle()
    check(childIDs(children).join() === "fork-2,fork-1" && host.querySelector('[data-psb-tree-node="fork-1"] > ul > [data-psb-tree-node="fork-3"]'), "Sibling forks are newest first and forks of forks nest one level deeper")
    const opened = calls.length
    const nestedRow = row("fork-3")
    toggle("fork-1").click(); await settle()
    check(list("fork-1").hidden && toggle("fork-1").getAttribute("aria-expanded") === "false" && !list("source").hidden, "A nested branch collapses independently of its parent")
    toggle("source").click(); await settle()
    check(list("source").hidden && row("fork-3").getClientRects().length === 0 && calls.length === opened, "Collapsing a source hides all descendants without opening or mutating sessions")
    setSessions((items) => items.map((info) => ({ ...info, time: { ...info.time, viewed: 25 } }))); await settle()
    toggle("source").click(); await settle()
    check(!list("source").hidden && list("fork-1").hidden && row("fork-3") === nestedRow, "Reopening a source preserves nested collapse state and row identity across metadata refresh")
    toggle("fork-1").click(); await settle()
    check(!list("fork-1").hidden && row("fork-3").getClientRects().length > 0, "Expanding a nested branch restores its existing child rows")
    const continuing = getComputedStyle(row("fork-2").parentElement!, "::before")
    check(continuing.borderInlineStartWidth === "1px" && continuing.top === "0px" && continuing.bottom === "0px" && connector("fork-2").content === "none", "Non-last sibling keeps the vertical line through its full branch without an elbow")
    check(Math.abs(parseFloat(connector("fork-1").bottom) - row("fork-1").getBoundingClientRect().height / 2) < 0.5 && connector("fork-3").borderEndStartRadius === "6px", "Last sibling ends at its own row even when it has nested forks")
    setSessions((items) => items.filter((info) => info.id !== "fork-2")); await settle()
    check(connector("fork-1").borderEndStartRadius === "6px", "Removing a sibling retains the last child's rounded connector")
    await actions.fork("mock", "source"); await settle()
    check(connector("fork-4").content === "none" && connector("fork-1").borderEndStartRadius === "6px", "Adding a newer sibling leaves only the last child rounded")
    host.dir = "rtl"
    check(connector("fork-1").borderBottomRightRadius === "6px" && connector("fork-1").borderRightWidth === "1px", "Rounded connector mirrors correctly in right-to-left layouts")
    toggle("source").click(); await settle()
    const triangle = toggle("source").querySelector("svg")!
    triangle.getAnimations().forEach((animation) => animation.finish())
    const rtl = getComputedStyle(triangle)
    check(rtl.transform === "matrix(-1, 0, 0, -1, 0, 0)" && toggle("source").getBoundingClientRect().right === row("source").getBoundingClientRect().right, "Collapsed disclosure points left and moves to the leading right edge in RTL")
    toggle("source").click(); await settle()
    host.dir = "ltr"
    calls.length = 0
    button("fork-1").click(); await settle()
    check(calls.join() === "open:fork-1", "Clicking a nested fork opens only that fork")
    const forkRow = row("fork-1")
    forkRow.querySelector(".psb-session-title")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    await settle()
    const input = forkRow.querySelector<HTMLInputElement>("input")!
    check(!!input && getComputedStyle(forkRow.querySelector(".psb-activity")!).display === "none", "Nested forks retain inline rename and hide their activity marker while editing")
    const inputRect = input.getBoundingClientRect(), forkRect = forkRow.getBoundingClientRect()
    check(inputRect.left === forkRect.left && inputRect.right === forkRect.right, "Nested rename spans its entire indented row")
    input.value = "Unsent rename"; input.dispatchEvent(new InputEvent("input", { bubbles: true }))
    setSessions((items) => items.map((info) => ({ ...info, time: { ...info.time, viewed: 30 } })))
    await settle()
    check(row("fork-1") === forkRow && forkRow.querySelector("input") === input && input.value === "Unsent rename", "Metadata refresh preserves nested row identity and an in-progress rename")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle()
    setSessions((items) => items.map((info) => info.id === "fork-1" ? { ...info, title: "Renamed fork" } : info)); await settle()
    check(button("fork-1").textContent?.includes("Renamed fork"), "Nested row receives updated metadata without stale title props")
    toggle("source").click(); await settle()
    dispose(); dispose = mount(); await settle()
    check(list("source").hidden && toggle("source").getAttribute("aria-expanded") === "false", "Stored branch state survives a sidebar remount")
    toggle("source").click(); await settle()
    if (preview) preview.append(host.firstElementChild!.cloneNode(true))
    setSessions((items) => items.filter((info) => info.id !== "source")); await settle()
    check(host.querySelectorAll("[data-psb-session]").length === 4 && childIDs(host.firstElementChild!).join() === "fork-4,fork-1,other", "Removing the source keeps all surviving forks visible as independent roots")
    return results
  } finally {
    actions.dispose(); dispose(); host.remove()
    if (previous?.isConnected) previous.focus({ preventScroll: true })
  }
}
