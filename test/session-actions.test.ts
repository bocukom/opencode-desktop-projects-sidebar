import assert from "node:assert/strict"
import test from "node:test"
import { createSessionActions, type ActionContext } from "../src/session-actions.ts"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"

function fixture() {
  const calls: Array<[string, unknown]> = []
  let confirm = true
  let fail = false
  let connected = true
  let wait: Promise<void> = Promise.resolve()
  const client = { session: {
    update: async (input: unknown) => { calls.push(["update", input]); await wait; if (fail) throw new Error("secret request details") },
    fork: async (input: unknown) => { calls.push(["fork", input]); await wait; if (fail) throw new Error("failed"); return session("forked") },
    remove: async (input: unknown) => { calls.push(["remove", input]); if (fail) throw new Error("failed") },
  } }
  const server = { client, get connected() { return connected }, compatible: true }
  const ctx = {
    servers: { get: (id: string) => id === "remote" ? server : undefined },
    tabs: {
      list: () => [
        { key: "target", session: { server: { id: "remote" }, id: "one" } },
        { key: "other-server", session: { server: { id: "local" }, id: "one" } },
        { key: "other-session", session: { server: { id: "remote" }, id: "two" } },
        { key: "draft" },
      ],
      open: (input: unknown) => calls.push(["open", input]),
      close: (key: string) => calls.push(["close", key]),
    },
    dialogs: { confirm: async (input: unknown) => { calls.push(["confirm", input]); await wait; return confirm } },
    toast: { show: (input: unknown) => calls.push(["toast", input]) },
  } as unknown as ActionContext
  const actions = createSessionActions(ctx, () => copy("en"), {
    groups: () => [],
    renamed: (server, id, title) => calls.push(["renamed", [server, id, title]]),
    removed: (server, id) => calls.push(["removed", [server, id]]),
    added: (server, session) => calls.push(["added", [server, session.id]]),
    refresh: (server) => calls.push(["refresh", server]),
  })
  return { actions, calls, confirm: (value: boolean) => { confirm = value }, fail: () => { fail = true }, offline: () => { connected = false }, wait: (value: Promise<void>) => { wait = value } }
}

test("rename trims the title, targets the row's server and refreshes only after success", async () => {
  const f = fixture()
  assert.equal(await f.actions.rename("remote", "one", "  New name  "), true)
  assert.deepEqual(f.calls, [
    ["update", { sessionID: "one", title: "New name" }],
    ["renamed", ["remote", "one", "New name"]], ["refresh", "remote"],
  ])
})

test("blank rename never sends a mutation", async () => {
  const f = fixture()
  assert.equal(await f.actions.rename("remote", "one", "   "), false)
  assert.deepEqual(f.calls, [])
})

test("fork copies the whole session and opens the returned independent session", async () => {
  const f = fixture()
  assert.equal(await f.actions.fork("remote", "one"), true)
  assert.deepEqual(f.calls, [["fork", { sessionID: "one" }], ["added", ["remote", "forked"]], ["open", { server: "remote", id: "forked" }], ["refresh", "remote"]])
})

test("Close archives, does not delete, and closes only tabs matching both server and session", async () => {
  const f = fixture()
  await f.actions.close("remote", "one")
  assert.deepEqual(f.calls, [["update", { sessionID: "one", archived: true }], ["removed", ["remote", "one"]], ["close", "target"], ["refresh", "remote"]])
})

test("Delete requires an explicit dangerous confirmation naming the selected session", async () => {
  const f = fixture()
  await f.actions.remove("remote", "one", "Session One")
  const prompt = f.calls[0][1] as { danger: boolean; description: string }
  assert.equal(prompt.danger, true)
  assert.ok(prompt.description.includes("Session One"))
  assert.deepEqual(f.calls.slice(1), [["remove", { sessionID: "one" }], ["removed", ["remote", "one"]], ["close", "target"], ["refresh", "remote"]])
})

test("cancelling Delete leaves sessions and tabs untouched", async () => {
  const f = fixture(); f.confirm(false)
  await f.actions.remove("remote", "one", "Session One")
  assert.deepEqual(f.calls.map(([name]) => name), ["confirm"])
})

test("failed archive keeps the row and tabs and does not expose request details", async () => {
  const f = fixture(); f.fail()
  assert.equal(await f.actions.close("remote", "one"), false)
  assert.deepEqual(f.calls.map(([name]) => name), ["update", "toast"])
  assert.equal(JSON.stringify(f.calls).includes("secret"), false)
})

test("offline or missing servers cannot mutate a session", async () => {
  const f = fixture(); f.offline()
  assert.equal(await f.actions.fork("remote", "one"), false)
  assert.equal(await f.actions.rename("missing", "one", "Name"), false)
  assert.deepEqual(f.calls.map(([name]) => name), ["toast", "toast"])
})

test("duplicate clicks and competing mutations on the same session are ignored", async () => {
  const f = fixture()
  let release!: () => void
  f.wait(new Promise<void>((resolve) => { release = resolve }))
  const first = f.actions.fork("remote", "one")
  assert.equal(await f.actions.fork("remote", "one"), false)
  assert.equal(await f.actions.close("remote", "one"), false)
  release(); await first
  assert.equal(f.calls.filter(([name]) => name === "fork").length, 1)
})

test("server connectivity is rechecked after Delete confirmation", async () => {
  const f = fixture()
  let release!: () => void
  f.wait(new Promise<void>((resolve) => { release = resolve }))
  const result = f.actions.remove("remote", "one", "Name")
  f.offline(); release()
  assert.equal(await result, false)
  assert.deepEqual(f.calls.map(([name]) => name), ["confirm", "toast"])
})

test("unloading while Delete confirmation is open cannot delete anything", async () => {
  const f = fixture()
  let release!: () => void
  f.wait(new Promise<void>((resolve) => { release = resolve }))
  const result = f.actions.remove("remote", "one", "Name")
  f.actions.dispose(); release(); await result
  await f.actions.fork("remote", "one")
  assert.deepEqual(f.calls.map(([name]) => name), ["confirm"])
})

test("unloading during a fork does not open tabs after disposal", async () => {
  const f = fixture()
  let release!: () => void
  f.wait(new Promise<void>((resolve) => { release = resolve }))
  const result = f.actions.fork("remote", "one")
  f.actions.dispose(); release(); await result
  assert.deepEqual(f.calls.map(([name]) => name), ["fork"])
})
