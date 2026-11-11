import assert from "node:assert/strict"
import test from "node:test"
import { groupSessions } from "../src/groups.ts"
import { removalNeighbors } from "../src/removal-navigation.ts"
import { createSessionActions, type ActionContext } from "../src/session-actions.ts"
import { copy } from "../src/copy.ts"
import { project, session } from "./data-fixtures.ts"

function fixture(ids = ["far", "above", "one", "below"]) {
  const calls: Array<[string, unknown]> = []
  let sessions = ids.map((id, index) => session(id, "/work/app", { time: { created: 1, idle: 100 - index , updated: 100 - index } }))
  let tabs = [
    { key: "target", active: true, session: { server: { id: "remote" }, id: "one" } },
    { key: "elsewhere", active: false, session: { server: { id: "remote" }, id: "other-project" } },
  ]
  let wait = Promise.resolve()
  let fail = false
  let confirm = true
  const groups = () => groupSessions([
    { id: "remote", name: "Remote", projects: [project()], sessions: [...sessions, session("other-project", "/other/app")] },
    { id: "local", name: "Local", projects: [project()], sessions: [session("one"), session("local-neighbor")] },
  ])
  const write = async (input: unknown) => { calls.push(["write", input]); await wait; if (fail) throw new Error("failed") }
  const ctx = {
    servers: { get: () => ({ connected: true, compatible: true, client: { session: { update: write, remove: write } } }) },
    tabs: {
      list: () => tabs,
      open: (input: { server: string; id: string }, options: unknown) => {
        calls.push(["open", { ...input, options }]); tabs = tabs.map((tab) => ({ ...tab, active: false }))
      },
      close: (key: string) => { calls.push(["close", key]); tabs = tabs.filter((tab) => tab.key !== key) },
    },
    layout: { draft: (input: unknown) => { calls.push(["draft", input]); tabs = tabs.map((tab) => ({ ...tab, active: false })) } },
    dialogs: { confirm: async () => confirm },
    toast: { show: () => calls.push(["toast", true]) },
  } as unknown as ActionContext
  const actions = createSessionActions(ctx, () => copy("en"), {
    groups, renamed() {}, added() {}, refresh() {},
    removed: (_server, id) => { sessions = sessions.filter((session) => session.id !== id) },
  })
  return {
    actions, calls, groups,
    wait: (value: Promise<void>) => { wait = value }, fail: () => { fail = true }, cancel: () => { confirm = false },
    switchAway: () => { tabs = tabs.map((tab) => ({ ...tab, active: tab.key === "elsewhere" })) },
    forget: (id: string) => { sessions = sessions.filter((session) => session.id !== id) },
    nativeDelete: () => { sessions = sessions.filter((session) => session.id !== "one"); tabs = tabs.filter((tab) => tab.key !== "target").map((tab) => ({ ...tab, active: true })) },
  }
}

test("removal candidates follow sidebar order: nearest above first, then below, never another group/server", () => {
  const f = fixture()
  const plan = removalNeighbors(f.groups(), "remote", "one")!
  assert.deepEqual(plan.candidates, ["above", "far", "below"])
  assert.equal(plan.directory, "/work/app")
  assert.equal(removalNeighbors(f.groups(), "remote", "missing"), undefined)
})

for (const action of ["close", "remove"] as const) {
  const perform = (f: ReturnType<typeof fixture>) => action === "close" ? f.actions.close("remote", "one") : f.actions.remove("remote", "one", "One")
  test(`${action} focuses the chat above in the same project before closing the target tab`, async () => {
    const f = fixture()
    assert.equal(await perform(f), true)
    assert.deepEqual(f.calls, [
      ["write", action === "close" ? { sessionID: "one", archived: true } : { sessionID: "one" }],
      ["open", { server: "remote", id: "above", options: { focus: true } }], ["close", "target"],
    ])
  })
  test(`${action} falls back below when removing the first chat`, async () => {
    const f = fixture(["one", "below"])
    await perform(f)
    assert.equal((f.calls.find(([name]) => name === "open")![1] as { id: string }).id, "below")
  })
  test(`${action} keeps an empty project in a blank draft instead of jumping to another project`, async () => {
    const f = fixture(["one"])
    await perform(f)
    assert.deepEqual(f.calls.slice(1), [["draft", { server: "remote", directory: "/work/app", prompt: "" }], ["close", "target"]])
  })
  test(`${action} on a background chat leaves the current selection alone`, async () => {
    const f = fixture(); f.switchAway()
    await perform(f)
    assert.deepEqual(f.calls.map(([name]) => name), ["write", "close"])
  })
  test(`${action} failure leaves navigation and tabs untouched`, async () => {
    const f = fixture(); f.fail()
    assert.equal(await perform(f), false)
    assert.deepEqual(f.calls.map(([name]) => name), ["write", "toast"])
  })
  test(`${action} respects a user switching away while the write is pending`, async () => {
    const f = fixture()
    let release!: () => void
    f.wait(new Promise<void>((resolve) => { release = resolve }))
    const result = perform(f)
    // Delete awaits confirmation before sending the write.
    for (let i = 0; i < 5; i++) await Promise.resolve()
    f.switchAway(); release(); await result
    assert.deepEqual(f.calls.map(([name]) => name), ["write", "close"])
  })
  test(`${action} skips neighbors that disappeared while the write was pending`, async () => {
    const f = fixture()
    let release!: () => void
    f.wait(new Promise<void>((resolve) => { release = resolve }))
    const result = perform(f)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    f.forget("above"); release(); await result
    assert.equal((f.calls.find(([name]) => name === "open")![1] as { id: string }).id, "far")
  })
  test(`${action} survives a native removal event arriving before the API response`, async () => {
    const f = fixture()
    let release!: () => void
    f.wait(new Promise<void>((resolve) => { release = resolve }))
    const result = perform(f)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    f.nativeDelete(); release(); await result
    assert.deepEqual(f.calls.slice(1), [["open", { server: "remote", id: "above", options: { focus: true } }]])
  })
}

test("cancelled Delete never changes selection", async () => {
  const f = fixture(); f.cancel()
  await f.actions.remove("remote", "one", "One")
  assert.deepEqual(f.calls, [])
})

test("unloading during Close cannot navigate or close tabs after the response", async () => {
  const f = fixture()
  let release!: () => void
  f.wait(new Promise<void>((resolve) => { release = resolve }))
  const result = f.actions.close("remote", "one")
  f.actions.dispose(); release(); await result
  assert.deepEqual(f.calls.map(([name]) => name), ["write"])
})
