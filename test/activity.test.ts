import { test } from "node:test"
import assert from "node:assert/strict"
import { createActivity } from "../src/activity.ts"
import { session } from "./data-fixtures.ts"

const options = { connected: true, running: false, selected: false }
const completed = (idle = 20, viewed?: number) => session("one", "/work", {
  outcome: "succeeded", time: { created: 1, updated: idle, busy: 10, idle, viewed },
})

test("ordinary history and title updates do not imply completion", () => {
  const activity = createActivity()
  assert.equal(activity.status("a", "one", options, session("one")), undefined)
  assert.equal(activity.status("a", "one", options, session("one", "/work", { time: { created: 1, updated: 500 } })), undefined)
})

test("busy timestamp and live running state both show working, including selected chats", () => {
  const activity = createActivity()
  assert.equal(activity.status("a", "one", { ...options, selected: true }, session("one", "/work", { time: { created: 1, updated: 30, busy: 30, idle: 20 } })), "running")
  assert.equal(activity.status("a", "one", { ...options, running: true }, completed()), "running")
})

test("only unseen successful completion is ready", () => {
  const activity = createActivity()
  assert.equal(activity.status("a", "one", options, completed()), "ready")
  assert.equal(activity.status("a", "one", options, completed(20, 20)), undefined)
  assert.equal(activity.status("a", "one", { ...options, selected: true }, completed()), undefined)
  for (const outcome of ["failed", "interrupted", undefined] as const) {
    assert.equal(activity.status("a", "one", options, { ...completed(), outcome }), undefined)
  }
})

test("visiting clears ready despite a stale index and a later navigation away", () => {
  const activity = createActivity()
  activity.seen("a", "one", completed())
  assert.equal(activity.status("a", "one", options, completed()), undefined)
  assert.equal(activity.status("b", "one", options, completed()), "ready")
  assert.equal(activity.status("a", "one", options, completed(40)), "ready")
})

test("live execution events win over a stale history index", () => {
  const activity = createActivity()
  activity.update("a", "one", { busy: 30 })
  assert.equal(activity.status("a", "one", options, completed()), "running")
  activity.update("a", "one", { idle: 40, outcome: "succeeded" })
  assert.equal(activity.status("a", "one", options, completed()), "ready")
  activity.seen("a", "one", completed())
  assert.equal(activity.status("a", "one", options, completed()), undefined)
})

test("viewed events and the native viewed timestamp clear the same completion", () => {
  const activity = createActivity()
  activity.update("a", "one", { idle: 40, outcome: "succeeded" })
  activity.update("a", "one", { viewed: 40 })
  assert.equal(activity.status("a", "one", options, completed()), undefined)
  assert.equal(activity.status("a", "two", options, completed(), completed(20, 20)), undefined)
})

test("read while working does not hide the next unseen completion", () => {
  const activity = createActivity()
  activity.update("a", "one", { busy: 30 })
  activity.seen("a", "one", completed())
  activity.update("a", "one", { idle: 40, outcome: "succeeded" })
  assert.equal(activity.status("a", "one", options, completed()), "ready")
  activity.seen("a", "one", completed())
  assert.equal(activity.status("a", "one", options, completed()), undefined)
})

test("stale metadata, viewed events and late start events do not undo newer outcomes", () => {
  const activity = createActivity()
  activity.update("a", "one", { busy: 30 })
  activity.update("a", "one", { idle: 40, outcome: "failed" })
  activity.update("a", "one", { busy: 30 })
  activity.update("a", "one", { viewed: 20 })
  assert.equal(activity.status("a", "one", options, completed()), undefined)
  assert.equal(activity.status("a", "one", options, completed(60)), "ready")
})

test("disconnect suppresses stale blue but retains genuine unseen completion", () => {
  const activity = createActivity()
  assert.equal(activity.status("a", "one", { ...options, connected: false, running: true }, completed()), "ready")
  activity.update("a", "one", { busy: 30 })
  assert.equal(activity.status("a", "one", { ...options, connected: false }, completed()), undefined)
})

test("forget and dispose release read/event state; repeated seen is a no-op", () => {
  let changes = 0
  const activity = createActivity(() => changes++)
  activity.seen("a", "one", completed())
  activity.seen("a", "one", completed())
  assert.equal(changes, 1)
  activity.forget("a", "one")
  assert.equal(activity.status("a", "one", options, completed()), "ready")
  activity.seen("a", "one", completed())
  activity.dispose()
  assert.equal(activity.status("a", "one", options, completed()), "ready")
})

test("pending permission or question outranks running, completed and selected state", () => {
  const activity = createActivity()
  for (const waiting of ["approval", "input"] as const) {
    assert.equal(activity.status("a", "one", { ...options, waiting, running: true, selected: true }, completed()), waiting)
    assert.equal(activity.status("a", "one", { ...options, waiting }, completed()), waiting)
  }
})

test("viewing never clears a pending request; answering resumes the underlying activity", () => {
  const activity = createActivity()
  activity.update("a", "one", { busy: 30 })
  activity.seen("a", "one", completed())
  assert.equal(activity.status("a", "one", { ...options, waiting: "approval", selected: true }, completed()), "approval")
  assert.equal(activity.status("a", "one", options, completed()), "running")
  activity.update("a", "one", { idle: 40, outcome: "succeeded" })
  assert.equal(activity.status("a", "one", options, completed()), "ready")
})

test("disconnection suppresses stale waiting rather than claiming an actionable request", () => {
  const activity = createActivity()
  for (const waiting of ["approval", "input"] as const) {
    assert.equal(activity.status("a", "one", { ...options, waiting, connected: false }, session("one")), undefined)
  }
})
