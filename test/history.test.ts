import assert from "node:assert/strict"
import { setImmediate as nextTurn } from "node:timers/promises"
import test from "node:test"
import { createHistory, pageSize } from "../src/history.ts"
import { fakeSource, page, session } from "./data-fixtures.ts"

const settle = async () => { await nextTurn(); await nextTurn() }
const fullPage = () => Array.from({ length: pageSize }, (_, index) => session(`s-${index}`))

test("explicit row rename updates the title without inventing an activity timestamp", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    const time = history.snapshot()[0].sessions[0].time.updated
    history.renameTitle(f.source.id, "one", "Renamed")
    assert.equal(history.snapshot()[0].sessions[0].title, "Renamed")
    assert.equal(history.snapshot()[0].sessions[0].time.updated, time)
  } finally { history.dispose() }
})

test("successful archive/delete tombstones a row even before its metadata event arrives", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    history.forget(f.source.id, "one")
    history.remember(f.source.id, session("one"))
    await history.reload(f.source.id)
    assert.deepEqual(history.snapshot()[0].sessions, [])
  } finally { history.dispose() }
})

test("action refresh retains older loaded pages", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  f.read(async (cursor) => cursor ? page([session("older")]) : page(fullPage(), "next"))
  try {
    history.sources([f.source]); await settle()
    await history.more(f.source.id)
    await history.reload(f.source.id)
    assert.equal(history.snapshot()[0].sessions.length, 101)
    assert.ok(history.snapshot()[0].sessions.some((session) => session.id === "older"))
  } finally { history.dispose() }
})

test("loads history independently of open tabs and stops at a short final page", async () => {
  const f = fakeSource()
  const history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    assert.equal(history.snapshot()[0].sessions[0].id, "one")
    assert.equal(history.snapshot()[0].cursor, undefined)
    assert.equal(f.calls.length, 1)
    assert.equal(f.subscriptions(), 1)
  } finally { history.dispose() }
})

test("loads older pages on request, deduplicates overlap and detects the final page", async () => {
  const f = fakeSource()
  f.read(async (cursor) => cursor ? page([session("s-99"), session("older")]) : page(fullPage(), "older-cursor"))
  const history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    assert.equal(history.snapshot()[0].cursor, "older-cursor")
    await history.more(f.source.id)
    assert.equal(history.snapshot()[0].sessions.length, 101)
    assert.equal(history.snapshot()[0].cursor, undefined)
    assert.equal(f.calls[1].cursor, "older-cursor")
  } finally { history.dispose() }
})

test("a repeating next cursor cannot produce an endless pagination loop", async () => {
  const f = fakeSource()
  f.read(async () => page(fullPage(), "repeat"))
  const history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    await history.more(f.source.id)
    assert.equal(history.snapshot()[0].cursor, undefined)
  } finally { history.dispose() }
})

test("one unreachable server does not suppress another server's history", async () => {
  const a = fakeSource("local"), b = fakeSource("remote")
  b.read(async () => { throw new Error("private credential details must never reach UI") })
  const history = createHistory(() => {})
  try {
    history.sources([a.source, b.source]); await settle()
    assert.equal(history.snapshot()[0].sessions.length, 1)
    assert.equal(history.snapshot()[1].error, true)
    assert.equal(JSON.stringify(history.snapshot()).includes("credential"), false)
  } finally { history.dispose() }
})

test("a refresh error retains previously loaded sessions and supports retry", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    f.read(async () => { throw new Error("offline") })
    await history.refresh(f.source.id)
    assert.equal(history.snapshot()[0].sessions.length, 1)
    assert.equal(history.snapshot()[0].error, true)
    f.read(async () => page([session("recovered")]))
    await history.refresh(f.source.id)
    assert.equal(history.snapshot()[0].sessions[0].id, "recovered")
    assert.equal(history.snapshot()[0].error, false)
  } finally { history.dispose() }
})

test("deletion removes a session immediately and late responses cannot resurrect it", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  let resolve!: (value: ReturnType<typeof page>) => void
  f.read(() => new Promise((done) => { resolve = done }))
  try {
    history.sources([f.source])
    f.event({ remove: "gone" })
    resolve(page([session("gone"), session("kept")]))
    await settle()
    assert.deepEqual(history.snapshot()[0].sessions.map((session) => session.id), ["kept"])
  } finally { history.dispose() }
})

test("disconnection aborts reads, unsubscribes events and reconnect refreshes history", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    history.sources([{ ...f.source, connected: false }])
    assert.equal(f.subscriptions(), 0)
    assert.equal(history.snapshot()[0].connected, false)
    assert.equal(history.snapshot()[0].sessions.length, 1)
    f.read(async () => page([session("new-index")]))
    history.sources([f.source]); await settle()
    assert.equal(f.subscriptions(), 1)
    assert.equal(history.snapshot()[0].sessions[0].id, "new-index")
  } finally { history.dispose() }
})

test("unmount aborts pending reads and ignores late results", async () => {
  const f = fakeSource()
  let changed = 0
  const history = createHistory(() => changed++)
  let resolve!: (value: ReturnType<typeof page>) => void
  f.read(() => new Promise((done) => { resolve = done }))
  history.sources([f.source])
  history.dispose()
  const before = changed
  assert.equal(f.calls[0].signal.aborted, true)
  assert.equal(f.subscriptions(), 0)
  resolve(page([session("late")]))
  await settle()
  assert.equal(changed, before)
  assert.equal(history.snapshot().length, 0)
})

test("duplicate source updates do not refetch or multiply subscriptions", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    for (let i = 0; i < 5; i++) history.sources([{ ...f.source }])
    await settle()
    assert.equal(f.calls.length, 1)
    assert.equal(f.subscriptions(), 1)
    history.sources([])
    assert.equal(f.subscriptions(), 0)
  } finally { history.dispose() }
})

test("published snapshots change identity when loading or error flags change", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source])
    const loading = history.snapshot()[0]
    await settle()
    const ready = history.snapshot()[0]
    assert.notEqual(loading, ready)
    assert.equal(loading.loading, true)
    assert.equal(ready.loading, false)
  } finally { history.dispose() }
})

test("metadata events refresh titles without fetching message transcripts", async () => {
  const f = fakeSource(), history = createHistory(() => {}, 0)
  try {
    history.sources([f.source]); await settle()
    let called!: () => void
    const requested = new Promise<void>((resolve) => { called = resolve })
    f.read(async () => { called(); return page([session("one", "/work/app", { title: "Updated title" })]) })
    f.event()
    await requested; await settle()
    assert.equal(history.snapshot()[0].sessions[0].title, "Updated title")
    assert.equal(f.calls.length, 2)
  } finally { history.dispose() }
})

test("new server generation refreshes without leaking old subscriptions", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    history.sources([{ ...f.source, generation: {} }]); await settle()
    assert.equal(f.calls.length, 2)
    assert.equal(f.subscriptions(), 1)
  } finally { history.dispose() }
})

test("restore events permit a previously removed session to reappear", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    f.event({ remove: "one" })
    assert.equal(history.snapshot()[0].sessions.length, 0)
    f.event({ restore: "one" })
    await history.refresh(f.source.id)
    assert.equal(history.snapshot()[0].sessions.length, 1)
  } finally { history.dispose() }
})

test("selected-session cache cannot overwrite known index metadata", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  f.read(async () => page([session("one", "/work/app", { title: "Index title", time: { created: 1, updated: 50 } })]))
  try {
    history.sources([f.source]); await settle()
    history.remember(f.source.id, session("one", "/work/app", { title: "Stale cache", time: { created: 1, updated: 2 } }))
    assert.equal(history.snapshot()[0].sessions[0].title, "Index title")
    assert.equal(history.snapshot()[0].sessions[0].time.updated, 50)
  } finally { history.dispose() }
})

test("visiting an older root retains it when selecting a different session", async () => {
  const f = fakeSource(), history = createHistory(() => {})
  try {
    history.sources([f.source]); await settle()
    history.remember(f.source.id, session("older"))
    history.remember(f.source.id, session("one"))
    assert.deepEqual(history.snapshot()[0].sessions.map((session) => session.id), ["one", "older"])
    history.remember(f.source.id, session("child", "/work/app", { parentID: "one" }))
    assert.equal(history.snapshot()[0].sessions.length, 2)
  } finally { history.dispose() }
})
