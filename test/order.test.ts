import assert from "node:assert/strict"
import test from "node:test"
import { groupSessions } from "../src/groups.ts"
import { sortGroups } from "../src/order.ts"
import { project, session } from "./data-fixtures.ts"

function groups(times = [30, 20, 10]) {
  return groupSessions([{
    id: "local", name: "local", projects: [project(), project("/other", { id: "other" })],
    sessions: [
      session("one", "/work/app", { time: { created: 1, idle: times[0] , updated: times[0] } }),
      session("two", "/work/app", { time: { created: 1, idle: times[1] , updated: times[1] } }),
      session("three", "/other", { projectID: "other", time: { created: 1, idle: times[2] , updated: times[2] } }),
    ],
  }])
}

const ids = (items: ReturnType<typeof groups>) => items.map((group) => [group.key, group.sessions.map((session) => session.id)])

test("project names are alphabetical and chats start newest first", () => {
  const input = groups()
  assert.deepEqual(ids(sortGroups(input)), ids(input))
})

test("an actual chat update promotes it within its project", () => {
  assert.deepEqual(sortGroups(groups())[0].sessions.map((session) => session.id), ["one", "two"])
  assert.deepEqual(sortGroups(groups([1, 90, 10]))[0].sessions.map((session) => session.id), ["two", "one"])
  assert.deepEqual(sortGroups(groups([200, 2, 10]))[0].sessions.map((session) => session.id), ["one", "two"])
})

test("cross-project navigation and activity cannot change alphabetical project order", () => {
  const next = sortGroups(groups([1, 2, 5000]))
  assert.equal(next[0].name, "app")
  assert.equal(next[1].name, "other")
})

test("API response order does not affect project or chat sorting", () => {
  const input = groups([1, 2, 1000]).reverse().map((group) => ({ ...group, sessions: [...group.sessions].reverse() }))
  assert.deepEqual(ids(sortGroups(input)), ids(sortGroups(groups([1, 2, 1000]))))
})

test("new chats appear above older paginated history", () => {
  const incoming = groups()
  incoming[0].sessions.unshift(session("new", "/work/app", { time: { created: 1, idle: 9000 , updated: 9000 } }))
  incoming[0].sessions.push(session("older"))
  assert.deepEqual(sortGroups(incoming)[0].sessions.map((session) => session.id), ["new", "one", "two", "older"])
})

test("new projects enter alphabetical order regardless of activity", () => {
  const initial = groups()
  const newGroup = { ...initial[0], key: "new-project", name: "New project", sessions: [session("new")] }
  assert.deepEqual(sortGroups([newGroup, ...groups([1, 2, 900])]).map((group) => group.name), ["app", "New project", "other"])
})

test("project sorting ignores case and compares embedded numbers naturally", () => {
  const base = groups()[0]
  const incoming = ["Zoo", "project 10", "Alpha", "project 2"].map((name) => ({ ...base, key: name, name }))
  assert.deepEqual(sortGroups(incoming).map((group) => group.name), ["Alpha", "project 2", "project 10", "Zoo"])
})

test("sorting does not mutate source sessions or groups", () => {
  const input = groups([1, 2, 900])
  const before = JSON.stringify(input)
  sortGroups(input)
  assert.equal(JSON.stringify(input), before)
})

test("equal update times have a deterministic tie-break without selection state", () => {
  const input = groups([5, 5, 5])
  input[0].sessions.reverse()
  assert.deepEqual(sortGroups(input)[0].sessions.map((session) => session.id), ["one", "two"])
})
