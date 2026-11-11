import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  return css.slice(start + selector.length + 2, css.indexOf("}", start))
}
const button = '[data-projects-sidebar-root] button.psb-project-new'
const visible = '[data-projects-sidebar-root] button.psb-project-new:focus-visible'

test("project plus stays transparent and non-clickable outside its group without collapsing its layout", () => {
  const style = rule(button)
  assert.match(style, /opacity: 0;/)
  assert.match(style, /pointer-events: none;/)
  assert.match(style, /width: 22px;/)
  assert.doesNotMatch(style, /display: none|visibility: hidden/)
})

test("hovering the whole project or focusing the plus itself reveals it, not retained focus on chats", () => {
  assert.match(rule(visible), /opacity: 1;/)
  assert.match(rule(visible), /pointer-events: auto;/)
  assert.match(rule(`${visible}:disabled`), /opacity: 0\.55;/)
  assert.ok(css.includes('[data-projects-sidebar-root] details:hover > summary > button.psb-project-new,'))
  assert.doesNotMatch(css, /details[^\{]*:has\(:focus-visible\)[^\{]*psb-project-new/)
})

test("touch devices keep the plus accessible without hover, including its disabled styling", () => {
  const touch = css.slice(css.indexOf("@media (hover: none)"), css.indexOf('\n}', css.indexOf("@media (hover: none)")))
  assert.ok(touch.includes(`${button} { opacity: 1; pointer-events: auto; }`))
  assert.ok(touch.includes(`${button}:disabled { opacity: 0.55; }`))
})

test("collapsed project plus uses the same reveal rules, without persistent mouse-focus visibility", () => {
  assert.doesNotMatch(css, /details:not\(\[open\]\) > summary > button\.psb-project-new/)
  assert.doesNotMatch(css, /:focus-within[^\{]*psb-project-new/)
  assert.doesNotMatch(visible, /\[open\]/)
})
