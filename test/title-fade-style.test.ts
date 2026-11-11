import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
const row = readFileSync(new URL("../src/session-row.tsx", import.meta.url), "utf8")
const rule = (selector: string) => {
  const start = css.indexOf(`${selector} {`)
  assert.notEqual(start, -1, selector)
  return css.slice(start + selector.length + 2, css.indexOf("}", start))
}

test("only overflowing titles get a directional 20px fade, without an ellipsis or a background approximation", () => {
  assert.match(rule("[data-projects-sidebar-root] .psb-title-viewport"), /linear-gradient\(to right, #000 calc\(100% - 20px\), transparent\)/)
  assert.match(rule("[data-projects-sidebar-root] .psb-title-viewport:dir(rtl)"), /linear-gradient\(to left,/)
  assert.match(rule("[data-projects-sidebar-root] .psb-title-viewport[data-overflow]"), /mask-image: var\(--psb-title-fade\);/)
  assert.match(rule("[data-projects-sidebar-root] .psb-session-title"), /text-overflow: clip;/)
  assert.doesNotMatch(rule("[data-projects-sidebar-root] .psb-title-viewport"), /background|mask-image/)
})

test("overflow and working-wave masks use different nested elements without a trailing fork badge", () => {
  assert.match(row, /<span ref=\{trackOverflow\} class="psb-title-viewport"[^\n]*\n\s*<span class="psb-session-title">\{title\(\)\}<\/span>\s*<\/span>\s*<\/button>/)
  assert.doesNotMatch(row, /psb-fork(?!-toggle)|⑂/)
  assert.match(rule('[data-projects-sidebar-root] [data-psb-activity="running"] .psb-session-title'), /animation: psb-working-wave/)
  assert.doesNotMatch(rule('[data-projects-sidebar-root] [data-psb-activity="running"] .psb-session-title'), /--psb-title-fade/)
})

test("overflow remeasures title updates and width changes, and releases observers on unmount or rename", () => {
  assert.match(row, /new ResizeObserver\(measure\)/)
  assert.match(row, /createEffect\(\(\) => \{ title\(\); queueMicrotask\(measure\) \}\)/)
  assert.match(row, /text.clientWidth > 0 && text.scrollWidth > text.clientWidth/)
  assert.match(row, /onCleanup\(\(\) => \{ active = false; observer.disconnect\(\) \}\)/)
})

test("forced colors use readable ellipsis instead of a transparency mask", () => {
  const contrast = css.slice(css.indexOf("@media (forced-colors: active)"))
  assert.ok(contrast.includes(".psb-title-viewport[data-overflow] { mask-image: none; }"))
  assert.ok(contrast.includes(".psb-session-title { text-overflow: ellipsis; }"))
})
