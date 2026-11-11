import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  return css.slice(start + selector.length + 2, css.indexOf("}", start))
}

test("history alone extends into the scoped end gutter, with an inset footer and logical RTL geometry", () => {
  const root = rule("[data-projects-sidebar-root]")
  const history = rule("[data-projects-sidebar-root] .psb-history")
  assert.match(root, /margin-inline-end: calc\(-1 \* var\(--psb-history-edge, 0px\)\);/)
  assert.match(root, /padding-inline-end: var\(--psb-history-edge, 0px\);/)
  assert.match(root, /overflow: hidden;/)
  assert.match(history, /margin-inline-end: calc\(-1 \* var\(--psb-history-edge, 0px\)\);/)
  assert.doesNotMatch(root + history, /margin-right|padding-right|width:/)
})

test("edge alignment preserves the native stable scrollbar instead of drawing over titles or resize controls", () => {
  const history = rule("[data-projects-sidebar-root] .psb-history")
  assert.match(history, /overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable;/)
  assert.doesNotMatch(history, /position: absolute|scrollbar-width: none|z-index/)
  assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{/)
})

test("inter-panel extension is limited to the ready, open, non-peeking Projects sidebar", () => {
  const guarded = '#vertical-tabs-sidebar[data-state="open"]:not([data-peek]):has([data-slot="sidebar-inbox"][data-projects-sidebar-covered] + [data-projects-sidebar-root][data-ready="true"])'
  assert.match(rule(`${guarded} > [data-slot="vertical-tabs-panel"]`), /inset-inline-end: -6px;/)
  const mount = rule('#vertical-tabs-sidebar[data-state="open"]:not([data-peek]) [data-slot="vertical-tabs-mount"]:has([data-slot="sidebar-inbox"][data-projects-sidebar-covered] + [data-projects-sidebar-root][data-ready="true"])')
  assert.match(mount, /width: 100% !important;/)
  assert.match(mount, /padding-inline-end: 11px;/)
  assert.match(mount, /--psb-history-edge: 11px;/)
  const handle = rule(`${guarded} > [data-component="resize-handle"][data-direction="horizontal"]`)
  assert.match(handle, /inset-inline-end: -10px;/)
  assert.doesNotMatch(handle, /pointer-events|width|display|z-index/)
})

test("only the history thumb loses its trailing transparent border; native target and colors remain unchanged", () => {
  assert.match(rule("[data-projects-sidebar-root] .psb-history::-webkit-scrollbar-thumb"), /border-inline-end-width: 0;/)
  assert.doesNotMatch(rule("[data-projects-sidebar-root] .psb-history::-webkit-scrollbar-thumb"), /background|width: [1-9]|height|position/)
})
