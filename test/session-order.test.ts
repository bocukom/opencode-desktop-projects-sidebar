import assert from "node:assert/strict"
import test from "node:test"
import { activityTime, compareSessions } from "../src/session-order.ts"
import { session } from "./data-fixtures.ts"

test("execution, not metadata update or viewing, determines recency", () => {
  const old = session("old", "/a", { time: { created: 1, busy: 10, idle: 11, updated: 100, viewed: 100 } })
  const recent = session("recent", "/a", { time: { created: 2, busy: 20, idle: 21, updated: 21 } })
  assert.deepEqual([old, recent].sort(compareSessions).map((s) => s.id), ["recent", "old"])
  assert.equal(activityTime({ ...recent, time: { ...recent.time, busy: 30 } }), 30)
})

test("missing execution timestamps fall back to creation with deterministic ties", () => {
  const a = session("a", "/a", { time: { created: 10, updated: 100 } })
  const b = session("b", "/a", { time: { created: 10, updated: 200 } })
  assert.equal(activityTime(a), 10)
  assert.deepEqual([b, a].sort(compareSessions).map((s) => s.id), ["a", "b"])
})
