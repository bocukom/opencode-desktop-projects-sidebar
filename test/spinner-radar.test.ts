import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import test from "node:test"
import { radarDots, radarKeyframes, radarLoop } from "../src/spinner-radar.ts"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")

test("radar geometry and animation exactly match installed Desktop 2.2.5 Soft Radar", () => {
  // Computed from the installed app's unmodified spinner-radar.ts, not from our compatibility copy.
  assert.equal(hash(JSON.stringify(radarDots())), "a111df8c97c8afeef8791f37630d365908b5089745d825f3cfa6fa19ac1ead60")
  assert.equal(hash(radarKeyframes("psb-spinner-radar")), "2b88cf343b9e87b48a9aed24ca74d576da07e233559b8d2fd6bf22e34d24d10d")
  assert.equal(radarLoop, 1.8)
})

test("radar has 25 distinct rounded-dot positions inside the native 16px viewBox", () => {
  const dots = radarDots()
  assert.equal(dots.length, 25)
  assert.equal(new Set(dots.map((dot) => `${dot.x},${dot.y}`)).size, 25)
  for (const dot of dots) {
    assert.equal(dot.size, 2)
    assert.ok(dot.x >= 1 && dot.x + dot.size <= 15)
    assert.ok(dot.y >= 1 && dot.y + dot.size <= 15)
    assert.ok(dot.at >= 0 && dot.at < 1)
    assert.ok(dot.still >= 0.2 && dot.still <= 1)
  }
})

test("only the center stays steady and each other dot references an available keyframe shape", () => {
  const dots = radarDots(), css = radarKeyframes("psb-spinner-radar")
  assert.deepEqual(dots.filter((dot) => dot.steady), [{ x: 7, y: 7, size: 2, at: 0.5, steady: true, still: 0.64, shape: 0 }])
  for (const dot of dots.filter((dot) => !dot.steady)) assert.ok(css.includes(`@keyframes psb-spinner-radar-${dot.shape}{`))
  assert.doesNotMatch(css, /@keyframes spinner-radar-/)
})

test("radar accessibility and hidden-state overrides stay scoped to plugin indicators", () => {
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8")
  assert.match(css, /:root\[data-motion="reduce"\] \[data-projects-sidebar-root\] \.psb-working-indicator rect \{ animation: none !important; \}/)
  for (const mode of ["prefers-reduced-motion: reduce", "forced-colors: active"]) {
    const section = css.slice(css.indexOf(`@media (${mode})`))
    assert.match(section, /\[data-projects-sidebar-root\] \.psb-working-indicator rect \{ animation: none !important; \}/)
  }
  assert.match(css, /\.psb-working-indicator\[data-offscreen\] rect \{ animation-play-state: paused !important; \}/)
})
