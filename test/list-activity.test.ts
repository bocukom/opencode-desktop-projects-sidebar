import assert from "node:assert/strict"
import test from "node:test"
import { listActivity } from "../src/list-activity.ts"
import type { Activity } from "../src/activity.ts"
import { session } from "./data-fixtures.ts"

test("hidden-list marker aggregates descendants with waiting before working before unread", () => {
  const nodes = [{ session: session("root", "/mock"), children: [{ session: session("fork", "/mock"), children: [] }] }]
  const states = new Map<string, Activity>()
  const status = (info: { id: string }) => states.get(info.id)
  assert.equal(listActivity(nodes, status), undefined)
  states.set("fork", "ready")
  assert.equal(listActivity(nodes, status), "ready")
  states.set("root", "running")
  assert.equal(listActivity(nodes, status), "running")
  states.set("fork", "input")
  assert.equal(listActivity(nodes, status), "input")
  states.set("root", "approval")
  assert.equal(listActivity(nodes, status), "approval")
  assert.equal(listActivity([], status), undefined)
})
