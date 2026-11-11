import { For, onCleanup } from "solid-js"
import { radarDots, radarLoop } from "./spinner-radar.ts"

const dots = radarDots()

/** Same Soft Radar as the host AI Spinner; no unsupported @opencode/ui runtime import. */
export function WorkingIndicator() {
  const sync = (el: SVGSVGElement) => {
    const pin = () => {
      if (el.hasAttribute("data-offscreen")) return
      // The host also pins infinite loops to the document origin, keeping all radar instances in phase.
      for (const animation of el.getAnimations({ subtree: true })) {
        if (animation.effect?.getTiming().iterations === Infinity && animation.startTime !== 0) animation.startTime = 0
      }
    }
    const resize = new ResizeObserver(pin)
    const visibility = new IntersectionObserver(([entry]) => {
      el.toggleAttribute("data-offscreen", !entry?.isIntersecting)
      pin()
    })
    resize.observe(el)
    visibility.observe(el)
    el.addEventListener("animationstart", pin)
    onCleanup(() => {
      resize.disconnect()
      visibility.disconnect()
      el.removeEventListener("animationstart", pin)
    })
  }
  return <svg ref={sync} class="psb-working-indicator" viewBox="0 0 16 16" width="16" height="16"
    fill="currentColor" aria-hidden="true" tabindex="-1">
    <For each={dots}>{(dot) => <rect x={dot.x} y={dot.y} width={dot.size} height={dot.size} rx={dot.size * 0.24}
      style={{ "--still": dot.still, animation: dot.steady ? undefined
        : `psb-spinner-radar-${dot.shape} ${radarLoop}s linear ${-radarLoop * (1 - dot.at)}s infinite` }} />}</For>
  </svg>
}
