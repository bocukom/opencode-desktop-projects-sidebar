import { test } from "node:test"
import assert from "node:assert/strict"
import { JSDOM } from "jsdom"
import { revealSession } from "../src/reveal-session.ts"

function fixture() {
  const dom = new JSDOM(`<div id="history"><details data-psb-group="other"></details><details data-psb-group="project"><ul><li data-psb-tree-node="source"><ul class="psb-fork-children" hidden><li data-psb-tree-node="fork"><ul class="psb-fork-children" hidden><li data-psb-tree-node="target"><button data-psb-session="target" data-psb-server="server"></button></li></ul></li></ul></li></ul></details></div>`, { pretendToBeVisual: true })
  const history = dom.window.document.getElementById("history")!
  const row = history.querySelector<HTMLElement>('[data-psb-session]')!
  let frame: FrameRequestCallback | undefined
  dom.window.requestAnimationFrame = (callback) => { frame = callback; return 1 }
  dom.window.cancelAnimationFrame = () => { frame = undefined }
  history.getBoundingClientRect = () => ({ top: 100, bottom: 300 }) as DOMRect
  row.getBoundingClientRect = () => ({ top: 400, bottom: 430, height: 30 }) as DOMRect
  const groups: string[] = [], forks: string[] = []
  const reveal = (server = "server") => revealSession(history, { server, id: "target" }, (key, closed) => {
    assert.equal(closed, false); groups.push(key)
    history.querySelector<HTMLDetailsElement>(`[data-psb-group="${key}"]`)!.open = true
  }, (key, closed) => { assert.equal(closed, false); forks.push(key) })
  return { dom, history, row, groups, forks, reveal, paint: () => frame?.(0) }
}

test("popup navigation reveals the project and all source branches, not unrelated projects or target children", () => {
  const f = fixture()
  f.reveal()
  assert.deepEqual(f.groups, ["project"])
  assert.deepEqual(f.forks, ['["server","fork"]', '["server","source"]'])
  assert.equal(f.history.querySelector<HTMLDetailsElement>('[data-psb-group="other"]')!.open, false)
  assert.equal(f.history.scrollTop, 0)
  f.paint()
  assert.equal(f.history.scrollTop, 130)
  f.dom.window.close()
})

test("visible rows do not scroll; rows above scroll only history", () => {
  const f = fixture()
  f.row.getBoundingClientRect = () => ({ top: 150, bottom: 180, height: 30 }) as DOMRect
  f.reveal(); f.paint()
  assert.equal(f.history.scrollTop, 0)
  f.history.scrollTop = 100
  f.row.getBoundingClientRect = () => ({ top: 80, bottom: 110, height: 30 }) as DOMRect
  f.reveal(); f.paint()
  assert.equal(f.history.scrollTop, 80)
  f.dom.window.close()
})

test("server identity, cancellation and removed rows prevent incorrect reveal/scroll", () => {
  const f = fixture()
  f.reveal("other-server"); f.paint()
  assert.deepEqual(f.groups, [])
  const cancel = f.reveal(); cancel(); f.paint()
  assert.equal(f.history.scrollTop, 0)
  f.reveal(); f.row.remove(); f.paint()
  assert.equal(f.history.scrollTop, 0)
  f.dom.window.close()
})
