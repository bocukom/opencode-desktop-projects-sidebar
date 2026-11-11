import assert from "node:assert/strict"
import test from "node:test"
import { groupSessions, mergeSessions } from "../src/groups.ts"
import { sessionTree, sessionTreeOrder, type SessionBranch } from "../src/session-tree.ts"
import { removalNeighbors } from "../src/removal-navigation.ts"
import { project, session } from "./data-fixtures.ts"

const item = (id: string, updated: number, parent?: string) => session(id, "/work/app", {
  time: { created: 1, updated, idle: updated },
  ...(parent ? { fork: { sessionID: parent, boundary: { type: "through" as const, messageID: "message" } } } : {}),
})
const shape = (nodes: SessionBranch[]): unknown[] => nodes.map((node) => [node.session.id, shape(node.children)])

test("forks stay immediately below their native source, with roots and siblings newest first", () => {
  const items = [item("old-root", 10), item("old-fork", 100, "old-root"), item("new-root", 20), item("new-fork", 200, "old-root"), item("deep", 300, "old-fork")]
  const before = JSON.stringify(items)
  assert.deepEqual(shape(sessionTree(items)), [["new-root", []], ["old-root", [["new-fork", []], ["old-fork", [["deep", []]]]]]])
  assert.deepEqual(sessionTreeOrder(items).map((s) => s.id), ["new-root", "old-root", "new-fork", "old-fork", "deep"])
  assert.equal(JSON.stringify(items), before)
})

test("sorting equal timestamps uses native ID, independently of API page order", () => {
  const items = [item("b", 1), item("a", 1), item("d", 5, "a"), item("c", 5, "a")]
  assert.deepEqual(shape(sessionTree(items)), [["a", [["c", []], ["d", []]]], ["b", []]])
  assert.deepEqual(shape(sessionTree(items.reverse())), [["a", [["c", []], ["d", []]]], ["b", []]])
})

test("missing, archived, deleted or not-yet-loaded parents leave forks visible at the root", () => {
  const fork = item("fork", 10, "parent")
  const items = [fork, item("deep", 20, "fork")]
  assert.deepEqual(shape(sessionTree(items)), [["fork", [["deep", []]]]])
  assert.deepEqual(shape(sessionTree([...items, item("parent", 1)])), [["parent", [["fork", [["deep", []]]]]]])
  assert.deepEqual(shape(sessionTree(mergeSessions([], [...items, { ...item("parent", 1), time: { created: 1, updated: 1, archived: 2 } }]))), [["fork", [["deep", []]]]])
  assert.deepEqual(shape(sessionTree(mergeSessions([], [...items, item("parent", 1)], new Set(["parent"])))), [["fork", [["deep", []]]]])
})

test("titles and subagent parentID are never used to infer fork relations", () => {
  const items = mergeSessions([], [item("parent", 1), { ...item("lookalike", 3), title: "parent (fork)" }, { ...item("subagent", 9), parentID: "parent" }])
  assert.deepEqual(shape(sessionTree(items)), [["lookalike", []], ["parent", []]])
})

test("fork links cannot escape their project/checkout/server group", () => {
  const groups = groupSessions([
    { id: "one", name: "one", projects: [project()], sessions: [item("parent", 1), { ...item("fork", 2, "parent"), location: { directory: "/elsewhere" } }] },
    { id: "two", name: "two", projects: [project()], sessions: [item("remote-fork", 3, "parent")] },
  ])
  assert.equal(groups.length, 3)
  assert.ok(groups.every((group) => sessionTree(group.sessions).length === 1 && !sessionTree(group.sessions)[0].children.length))
})

test("invalid self-links and cycles keep every chat visible once and terminate", () => {
  const items = [item("a", 4, "b"), item("b", 3, "c"), item("c", 2, "a"), item("self", 1, "self"), item("child", 5, "b")]
  const order = sessionTreeOrder(items).map((s) => s.id)
  assert.equal(order.length, items.length)
  assert.equal(new Set(order).size, items.length)
  assert.deepEqual(shape(sessionTree(items)), shape(sessionTree([...items].reverse())))
})

test("deep fork chains can be flattened without recursive traversal", () => {
  const items = Array.from({ length: 5000 }, (_, i) => item(String(i), i, i ? String(i - 1) : undefined))
  const order = sessionTreeOrder(items)
  assert.equal(order.length, 5000)
  assert.equal(order[0].id, "0")
  assert.equal(order.at(-1)!.id, "4999")
})

test("removal neighbors follow the displayed tree rather than the flat timestamp index", () => {
  const sessions = [item("parent", 1), item("fork", 100, "parent"), item("other", 2), item("older-fork", 50, "parent")]
  const groups = groupSessions([{ id: "local", name: "local", projects: [project()], sessions }])
  assert.deepEqual(removalNeighbors(groups, "local", "fork")!.candidates, ["parent", "other", "older-fork"])
  assert.deepEqual(removalNeighbors(groups, "local", "parent")!.candidates, ["other", "fork", "older-fork"])
})
