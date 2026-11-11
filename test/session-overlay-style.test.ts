import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  return css.slice(start + selector.length + 2, css.indexOf("}", start))
}
const root = "[data-projects-sidebar-root]"
const reveal = `${root} .psb-session-row:is([data-psb-activity], :hover, :has(:focus-visible), :has(.psb-actions [aria-expanded="true"])) > .psb-session`

test("overlay menu reclaims title width without hover-driven padding or reduced hit targets", () => {
  assert.match(rule(`${root} button.psb-session`), /padding: 5px 2px;/)
  assert.doesNotMatch(css, /padding-inline-end: (26|28)px/)
  assert.match(rule(`${root} .psb-actions`), /position: absolute; z-index: 1; inset-inline-end: 0;/)
  assert.match(rule(`${root} .psb-actions button`), /width: 24px; height: 24px;/)
  assert.doesNotMatch(rule(reveal), /padding|width|margin|transition/)
})

test("hover, keyboard focus and an open menu fade the parent independently of the working wave", () => {
  assert.match(rule(reveal), /mask-image: var\(--psb-menu-fade\); clip-path: var\(--psb-menu-clip\);/)
  assert.match(rule(`${root} [data-psb-activity="running"] .psb-session-title`), /animation: psb-working-wave/)
  assert.doesNotMatch(rule(`${root} .psb-actions`), /mask-image|clip-path/)
  assert.match(css, /\.psb-session-row:dir\(rtl\) \{ --psb-menu-fade: linear-gradient\(to left,/)
})

test("mouse focus alone does not keep the menu or hide the activity marker", () => {
  assert.ok(css.includes('.psb-session-row:is(:hover, :has(:focus-visible)) .psb-actions,'))
  assert.ok(css.includes('.psb-session-row:is(:hover, :has(:focus-visible), :has(.psb-actions [aria-expanded="true"])) > .psb-activity'))
  assert.doesNotMatch(css, /\.psb-session-row:is\([^\n]*:focus-within/)
})

test("touch always pairs the visible overlay menu with its text fade", () => {
  const touch = css.slice(css.indexOf("@media (hover: none)"), css.indexOf("\n}", css.indexOf("@media (hover: none)")))
  assert.ok(touch.includes(`${root} .psb-actions { opacity: 1; pointer-events: auto; }`))
  assert.ok(touch.includes(`${root} .psb-session-row > .psb-session { mask-image: var(--psb-menu-fade); clip-path: var(--psb-menu-clip); }`))
})

test("forced colors replace the fade with directional clipping, leaving the row outline intact", () => {
  const contrast = css.slice(css.indexOf("@media (forced-colors: active)"))
  assert.ok(contrast.includes("--psb-menu-fade: none; --psb-menu-clip: inset(0 24px 0 0);"))
  assert.ok(contrast.includes("--psb-menu-fade: none; --psb-menu-clip: inset(0 0 0 24px);"))
  assert.doesNotMatch(rule(reveal), /outline/)
})
