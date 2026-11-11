import assert from "node:assert/strict"
import test from "node:test"
import { waitingFor } from "../src/requests.ts"

function fixture() {
  const permissions: Record<string, unknown[] | undefined> = {}
  const forms: Record<string, { metadata?: { kind: string } }[] | undefined> = {}
  const families: Record<string, string[]> = {}
  return {
    permissions, forms, families,
    data: {
      family: (id: string) => families[id] ?? [],
      permission: { list: (id: string) => permissions[id] },
      form: { list: (id: string) => forms[id] },
    },
  }
}

test("unloaded or empty native request stores do not imply waiting", () => {
  const f = fixture()
  assert.equal(waitingFor(f.data, "chat"), undefined)
  f.permissions.chat = []; f.forms.chat = []
  assert.equal(waitingFor(f.data, "chat"), undefined)
})

test("pending permissions are distinct from questions and remain until the last request is answered", () => {
  const f = fixture()
  f.permissions.chat = [{ id: "one" }, { id: "two" }]
  assert.equal(waitingFor(f.data, "chat"), "approval")
  f.permissions.chat.shift()
  assert.equal(waitingFor(f.data, "chat"), "approval")
  f.permissions.chat = []
  assert.equal(waitingFor(f.data, "chat"), undefined)
})

test("only native user-facing question/elicitation/provider forms require an answer", () => {
  const f = fixture()
  for (const kind of ["question", "mcp-elicitation", "websearch.provider"]) {
    f.forms.chat = [{ metadata: { kind } }]
    assert.equal(waitingFor(f.data, "chat"), "input")
  }
  f.forms.chat = [{}, { metadata: { kind: "some-unrelated-form" } }]
  assert.equal(waitingFor(f.data, "chat"), undefined)
})

test("permission takes precedence over questions; resolving it exposes the remaining question", () => {
  const f = fixture()
  f.permissions.chat = [{}]; f.forms.chat = [{ metadata: { kind: "question" } }]
  assert.equal(waitingFor(f.data, "chat"), "approval")
  f.permissions.chat = []
  assert.equal(waitingFor(f.data, "chat"), "input")
  f.forms.chat = []
  assert.equal(waitingFor(f.data, "chat"), undefined)
})

test("hidden subagents propagate waiting to their native family root", () => {
  const f = fixture()
  f.families.chat = ["chat", "agent", "grandchild", "agent"]
  f.permissions.grandchild = [{}]
  assert.equal(waitingFor(f.data, "chat"), "approval")
  f.permissions.grandchild = []; f.forms.agent = [{ metadata: { kind: "question" } }]
  assert.equal(waitingFor(f.data, "chat"), "input")
})

test("independent forks and other server stores do not share waiting markers", () => {
  const f = fixture(), otherServer = fixture()
  f.permissions.fork = [{}]
  assert.equal(waitingFor(f.data, "fork"), "approval")
  assert.equal(waitingFor(f.data, "source"), undefined)
  assert.equal(waitingFor(otherServer.data, "fork"), undefined)
  f.forms.global = [{ metadata: { kind: "question" } }]
  assert.equal(waitingFor(f.data, "source"), undefined)
})
