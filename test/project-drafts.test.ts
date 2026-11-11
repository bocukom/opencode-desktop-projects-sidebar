import assert from "node:assert/strict"
import test from "node:test"
import type { Context, ShellTab } from "@opencode/plugin/gui"
import { createProjectDrafts, type DraftLinks } from "../src/project-drafts.ts"

const app = { server: "local", directory: "/work/app" }
function fixture(initial: DraftLinks = {}) {
  let links = initial, busy = false, errors = 0, connected = true, compatible = true, fail = false
  let tabs: ShellTab[] = [{ key: "chat", active: true, session: {} as ShellTab["session"] }]
  const drafts: { server: string; directory: string; prompt: string }[] = []
  const texts = new Map<string, string>() // Host-owned text, inaccessible to the controller.
  const focused: string[] = []
  const ctx = {
    servers: { get: () => ({ connected, compatible }) },
    tabs: { list: () => tabs, focus: (key: string) => { focused.push(key); select(key) } },
    layout: { draft: (input: typeof app & { prompt: string }) => { if (fail) throw new Error("failed"); drafts.push(input) } },
  } as unknown as Pick<Context, "tabs" | "layout" | "servers">
  const controller = () => createProjectDrafts(ctx, {
    links: () => links, save: (next) => { links = next }, changed: (value) => { busy = value }, error: () => { errors++ },
  })
  let d = controller()
  const select = (key: string) => { tabs = tabs.map((tab) => ({ ...tab, active: tab.key === key })); d.observe(tabs) }
  return {
    get d() { return d }, drafts, texts, focused,
    get links() { return links }, get busy() { return busy }, get errors() { return errors },
    add(key = `draft:${drafts.length}`) { tabs = [...tabs, { key, active: false, session: undefined }]; d.observe(tabs); select(key); return key },
    select,
    close(key: string) { tabs = tabs.filter((tab) => tab.key !== key); d.observe(tabs) },
    sent(key: string) { tabs = tabs.map((tab) => tab.key === key ? { ...tab, session: {} as ShellTab["session"] } : tab); d.observe(tabs) },
    remount() { d.observe(tabs) },
    reload() { d.dispose(); d = controller(); d.observe(tabs) },
    offline() { connected = false }, incompatible() { compatible = false },
    fail() { fail = true },
    ambiguous() { tabs = [...tabs, ...["draft:x", "draft:y"].map((key) => ({ key, active: false, session: undefined }))]; d.observe(tabs) },
  }
}

test("plus opens an empty native draft in the exact server and project, with no group metadata", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open({ ...app, extra: "not persisted" } as typeof app)
  assert.deepEqual(f.drafts, [{ ...app, prompt: "" }])
  assert.equal(f.busy, true)
  const key = f.add()
  assert.deepEqual(f.links, { [key]: app })
  assert.equal(f.busy, false)
})

for (const text of ["", "An unsent message\nwith a second line"]) test(`returning via plus reuses the ${text ? "populated" : "empty"} native draft`, (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); const key = f.add(); f.texts.set(key, text)
  f.select("chat"); f.d.open(app); f.d.open(app)
  assert.deepEqual(f.focused, [key, key]); assert.equal(f.drafts.length, 1)
  assert.equal(f.texts.get(key), text)
})

test("rapid plus clicks, including another project, cannot create duplicates while creation is pending", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); f.d.open(app); f.d.open({ ...app, directory: "/elsewhere" })
  assert.equal(f.drafts.length, 1); f.add()
})

test("different directories and servers have independent drafts", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  const targets = [app, { ...app, directory: "/other/app" }, { ...app, server: "remote" }]
  const keys = targets.map((target) => { f.d.open(target); return f.add() })
  for (const target of targets) f.d.open(target)
  assert.equal(f.drafts.length, 3); assert.deepEqual(f.focused, keys)
})

test("sidebar remount and plugin reload resume the same persisted tab link without copying text", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); const key = f.add(); f.texts.set(key, "keep me")
  f.select("chat"); f.remount(); f.d.open(app); f.reload(); f.d.open(app)
  assert.equal(f.drafts.length, 1); assert.deepEqual(f.focused, [key, key])
  assert.deepEqual(f.links, { [key]: app }); assert.equal(f.texts.get(key), "keep me")
})

for (const operation of ["close", "sent"] as const) test(`${operation} invalidates the draft link; next plus starts a fresh draft`, (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); const key = f.add(); f[operation](key)
  assert.deepEqual(f.links, {}); f.d.open(app); f.add()
  assert.equal(f.drafts.length, 2); assert.deepEqual(f.focused, [])
})

test("foreign-window links and unrelated pre-existing drafts are not adopted or removed", (t) => {
  const f = fixture({ "draft:foreign": app }); t.after(() => f.d.dispose())
  f.add("draft:unrelated"); f.d.open(app); const key = f.add()
  assert.equal(f.drafts.length, 1); assert.deepEqual(f.links, { "draft:foreign": app, [key]: app })
})

test("Windows path aliases reuse the draft but case-sensitive Unix projects remain separate", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open({ ...app, directory: "C:\\Work\\App\\" }); const key = f.add()
  f.d.open({ ...app, directory: "c:/work/app" }); assert.deepEqual(f.focused, [key])
  f.d.open(app); f.add(); f.d.open({ ...app, directory: "/work/App" }); f.add()
  assert.equal(f.drafts.length, 3)
})

for (const state of ["offline", "incompatible"] as const) test(`${state} server cannot open a draft`, (t) => {
  const f = fixture(); t.after(() => f.d.dispose()); f[state](); f.d.open(app)
  assert.equal(f.drafts.length, 0); assert.equal(f.busy, false)
})

test("unresolved session tabs are not mistaken for drafts", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); f.add("session-loading"); assert.equal(f.busy, true)
  const key = f.add(); assert.deepEqual(f.links, { [key]: app })
})

test("ambiguous concurrent drafts are never assigned to the wrong project", (t) => {
  const f = fixture(); t.after(() => f.d.dispose())
  f.d.open(app); f.ambiguous()
  assert.deepEqual(f.links, {}); assert.equal(f.errors, 1); assert.equal(f.busy, false)
})

test("cleanup cancels pending tracking, late tabs cannot change storage or focus", () => {
  const f = fixture(); f.d.open(app); f.d.dispose(); f.add(); f.d.open(app)
  assert.deepEqual(f.links, {}); assert.equal(f.drafts.length, 1); assert.equal(f.errors, 0)
})

test("a native draft failure releases pending state and reports a generic error", (t) => {
  const f = fixture(); t.after(() => f.d.dispose()); f.fail(); f.d.open(app)
  assert.equal(f.busy, false); assert.equal(f.errors, 1); assert.deepEqual(f.links, {})
})

test("an unfulfilled native draft request times out without claiming unrelated late tabs", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const f = fixture(); t.after(() => f.d.dispose()); f.d.open(app)
  t.mock.timers.tick(15000)
  assert.equal(f.busy, false); assert.equal(f.errors, 1)
  f.add("draft:late"); assert.deepEqual(f.links, {})
})
