import assert from "node:assert/strict"
import test from "node:test"
import { groupSessions, mergeSessions, pathKey } from "../src/groups.ts"
import { project, session } from "./data-fixtures.ts"

const server = (sessions: ReturnType<typeof session>[], projects = [project()], id = "local") => ({ id, name: id, projects, sessions })

test("groups by real project root and sorts groups and sessions by activity", () => {
  const items = [session("old"), session("new", "/work/app", { time: { created: 1, idle: 30 , updated: 30 } }), session("other", "/work/other", { projectID: "other", time: { created: 1, idle: 50 , updated: 50 } })]
  const groups = groupSessions([server(items, [project(), project("/work/other", { id: "other" })])])
  assert.deepEqual(groups.map((group) => group.name), ["other", "app"])
  assert.deepEqual(groups[1].sessions.map((session) => session.id), ["new", "old"])
})

test("same-basename directories and identical paths on different servers stay distinct", () => {
  const groups = groupSessions([
    server([session("one"), session("two", "/elsewhere/app", { projectID: "clone" })]),
    server([session("one")], [project()], "remote"),
  ])
  assert.equal(groups.length, 3)
  assert.equal(new Set(groups.map((group) => group.key)).size, 3)
})

test("worktrees and subdirectories group under their parent project", () => {
  const groups = groupSessions([server([session("root"), session("sub", "/work/app/packages/ui"), session("branch", "/trees/feature")], [project("/work/app", { sandboxes: ["/trees/feature"] })])])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].sessions.length, 3)
})

test("unrelated clones sharing project identity do not collapse into a canonical checkout", () => {
  const groups = groupSessions([server([session("one"), session("two", "/work/app-copy")])])
  assert.equal(groups.length, 2)
})

test("global or unknown project metadata does not merge unrelated directories", () => {
  const groups = groupSessions([server([session("a", "/a", { projectID: "global" }), session("b", "/b", { projectID: "global" })], [project("/", { id: "global" })])])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((group) => group.name), ["a", "b"])
  assert.equal(groupSessions([server([session("unknown")], [])])[0].name, "app")
})

test("forks remain independent index sessions, while archived and subagent sessions are excluded", () => {
  const fork = session("fork", "/work/app", { fork: { sessionID: "parent", boundary: { type: "through", messageID: "message" } } })
  const items = [session("parent"), fork, session("subagent", "/work/app", { parentID: "parent" }), session("archived", "/work/app", { time: { created: 1, idle: 2, updated: 2, archived: 3 } })]
  assert.deepEqual(mergeSessions([], items).map((session) => session.id), ["parent", "fork"])
})

test("deduplicates pages, applies renamed metadata and excludes deleted entries", () => {
  const merged = mergeSessions([session("one"), session("gone")], [session("one", "/work/app", { title: "Renamed" })], new Set(["gone"]))
  assert.equal(merged.length, 1)
  assert.equal(merged[0].title, "Renamed")
})

test("Windows and UNC identity is case-insensitive, but Linux paths remain case-sensitive", () => {
  assert.equal(pathKey("C:\\Work\\App\\"), pathKey("c:/work/app"))
  assert.equal(pathKey("C:\\"), pathKey("c:/"))
  assert.equal(pathKey("\\\\HOST\\Share\\App"), pathKey("//host/share/app"))
  assert.notEqual(pathKey("/work/App"), pathKey("/work/app"))
  const groups = groupSessions([server([session("win", "c:\\work\\app\\src")], [project("C:/Work/App", { name: "Named project" })])])
  assert.equal(groups[0].directory, "C:/Work/App")
  assert.equal(groups[0].name, "Named project")
})

test("subpath recovers a noncanonical checkout root without prefix collisions", () => {
  const groups = groupSessions([server([session("a", "/clone/app/src", { subpath: "src" }), session("b", "/clone/app")])])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].directory, "/clone/app")
})

test("session titles remain data and grouping does not mutate source records", () => {
  const item = session("a", "/work/app", { title: '<img src=x onerror="alert(1)">' })
  const before = JSON.stringify(item)
  assert.equal(groupSessions([server([item])])[0].sessions[0].title, item.title)
  assert.equal(JSON.stringify(item), before)
})
