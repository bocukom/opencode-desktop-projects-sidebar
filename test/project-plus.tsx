import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import type { Context } from "@opencode/plugin/gui"
import { HistoryView } from "../src/history-view.tsx"
import { createProjectDrafts, type DraftLinks } from "../src/project-drafts.ts"
import type { createSessionActivity } from "../src/activity-source.ts"
import { page, project, session } from "./data-fixtures.ts"
import "../src/style.css"

// Real HistoryView and draft controller, isolated from native tabs and user data.
const [collapsed, setCollapsed] = createSignal<readonly string[]>([])
const [busy, setBusy] = createSignal(false)
const [connected, setConnected] = createSignal(true)
const tabs: { key: string }[] = []
const calls: { server: string; directory: string; expanded: boolean }[] = []
const collapses: { key: string; closed: boolean }[] = []
let links: DraftLinks = {}
const server = {
  id: "mock", name: "Mock", compatible: true, get connected() { return connected() },
  client: {
    project: { list: async () => [project("/work/alpha", { id: "alpha" }), project("/work/beta", { id: "beta" })] },
    session: { list: async () => page([
      session("Alpha task", "/work/alpha", { projectID: "alpha" }),
      session("Beta task", "/work/beta", { projectID: "beta" }),
    ]) },
  },
  data: { on: () => () => {} },
}
const ctx = {
  servers: { list: () => [server.id], get: () => server },
  sessions: { current: () => undefined },
  tabs: { list: () => tabs, focus() {}, open() {} },
  layout: { draft: (target: { server: string; directory: string }) => {
    const group = [...document.querySelectorAll<HTMLDetailsElement>("[data-psb-group]")]
      .find((item) => JSON.parse(item.dataset.psbGroup!)[2] === target.directory)!
    calls.push({ ...target, expanded: group.open })
    tabs.push({ key: `draft:${tabs.length}` })
  } },
  locale: { locale: () => "en" },
  ui: { Menu: (props: { label: string; disabled?: boolean }) => <button disabled={props.disabled}>{props.label}</button> },
  toast: { show: () => { throw new Error("Unexpected toast") } },
  dialogs: {},
} as unknown as Context
const drafts = createProjectDrafts(ctx, {
  links: () => links, save: (next) => { links = next }, changed: setBusy,
  error: () => { throw new Error("Unexpected draft error") },
})
const dispose = render(() => <HistoryView ctx={ctx} drafts={drafts} draftBusy={busy}
  activity={{ status: () => undefined, summaryStatus: () => undefined, seen() {} } as unknown as ReturnType<typeof createSessionActivity>}
  collapsed={collapsed} collapse={(key, closed) => {
    collapses.push({ key, closed })
    setCollapsed((items) => closed ? [...new Set([...items, key])] : items.filter((item) => item !== key))
  }} collapsedForks={() => []} collapseFork={() => {}} />, document.querySelector("#projects")!)

Object.assign(window, { plusTest: { calls, collapses, collapsed, setConnected, dispose: () => { dispose(); drafts.dispose() } } })
