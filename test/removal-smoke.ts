import { createSignal } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { groupSessions } from "../src/groups.ts"
import { prepareRemovalNavigation } from "../src/removal-navigation.ts"
import { project, session } from "./data-fixtures.ts"

/** Real reactive navigation guard, mock tabs only: never archives/deletes a user's chat. */
export function runRemovalSmoke() {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const initial = [
    { key: "target", active: true, session: { server: { id: "mock" }, id: "one" } },
    { key: "elsewhere", active: false, session: { server: { id: "mock" }, id: "other" } },
  ]
  const groups = () => groupSessions([{ id: "mock", name: "Mock", projects: [project()], sessions: [
    session("above", "/work/app", { time: { created: 1, idle: 30 , updated: 30 } }),
    session("one", "/work/app", { time: { created: 1, idle: 20 , updated: 20 } }),
    session("below", "/work/app", { time: { created: 1, idle: 10 , updated: 10 } }),
    session("other", "/work/other"),
  ] }])
  function scenario(test: (f: { away(): void; nativeClose(): void; focus(): void; calls: string[] }) => void, blocked = false) {
    const [tabs, setTabs] = createSignal(initial.map((tab) => ({ ...tab })))
    const calls: string[] = []
    const ctx = { tabs: { list: tabs, open: (input: { id: string }) => calls.push(input.id) }, layout: { draft: () => calls.push("draft") } } as unknown as Pick<Context, "tabs" | "layout">
    const navigation = prepareRemovalNavigation(ctx, groups, "mock", "one", (_server, id) => blocked && id === "above")
    try {
      test({
        away: () => setTabs((tabs) => tabs.map((tab) => ({ ...tab, active: tab.key === "elsewhere" }))),
        nativeClose: () => setTabs((tabs) => tabs.filter((tab) => tab.key !== "target").map((tab) => ({ ...tab, active: true }))),
        focus: navigation.focus, calls,
      })
    } finally { navigation.dispose() }
  }
  scenario((f) => {
    f.focus()
    check(f.calls.join() === "above", "Successful removal focuses the nearest sidebar chat above, not another project's tab")
  })
  scenario((f) => {
    f.nativeClose(); f.focus()
    check(f.calls.join() === "above", "Native tab cleanup before the response still selects the same-project neighbor")
  })
  scenario((f) => {
    f.away(); f.nativeClose(); f.focus()
    check(!f.calls.length, "Switching away during deletion permanently revokes navigation, even if native cleanup removes the old tab")
  })
  scenario((f) => {
    f.focus()
    check(f.calls.join() === "below", "A neighbor already being deleted or archived is skipped")
  }, true)
  return results
}
