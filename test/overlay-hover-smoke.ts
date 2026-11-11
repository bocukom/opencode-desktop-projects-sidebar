/** Serialized into the Desktop window; trusted mouse events come from the diagnostic main process. */
export async function probeOverlayHover(phase: "prepare" | "hover" | "rest", baseline?: { left: number; width: number }) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); return label }
  const candidates = [...document.querySelectorAll<HTMLElement>("[data-projects-sidebar-root] .psb-session-row:not([data-editing])")]
  const row = phase === "prepare" ? candidates.find((item) => {
    const rect = item.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    return rect.width > 80 && y > 0 && y < innerHeight && !item.matches(':focus-within, :has([aria-expanded="true"])') && item.contains(document.elementFromPoint(x, y))
  }) : document.querySelector<HTMLElement>("[data-psb-overlay-probe]")
  if (!row) throw new Error("No unobscured sidebar row for the native hover probe")
  const button = row.querySelector<HTMLElement>(".psb-session")!
  const title = row.querySelector<HTMLElement>(".psb-session-title")!
  const actions = row.querySelector<HTMLElement>(".psb-actions")!
  const trigger = actions.querySelector<HTMLButtonElement>("button")!
  const rect = title.getBoundingClientRect()
  const contrast = matchMedia("(forced-colors: active)").matches
  const touch = matchMedia("(hover: none)").matches
  const faded = contrast ? getComputedStyle(button).clipPath !== "none" : getComputedStyle(button).maskImage !== "none"
  const viewport = row.querySelector<HTMLElement>(".psb-title-viewport")!
  const overflowFadeCorrect = contrast || (getComputedStyle(viewport).maskImage !== "none") === viewport.hasAttribute("data-overflow")
  const results: string[] = []
  if (phase === "prepare") {
    row.setAttribute("data-psb-overlay-probe", "")
    results.push(check(touch || !faded, "Without hover the title has no menu fade and uses the reclaimed right-hand space"))
    results.push(check(overflowFadeCorrect, "Resting title keeps its overflow fade independently of the hidden menu"))
    const box = trigger.getBoundingClientRect()
    return { left: rect.left, width: rect.width, x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2), results }
  }
  results.push(check(rect.left === baseline?.left && rect.width === baseline.width, "Trusted pointer hover never changes title position or width"))
  if (phase === "hover") {
    results.push(check(row.matches(":hover") && getComputedStyle(actions).opacity === "1" && faded, "Trusted pointer hover reveals the overlaid menu and fades the title underneath"))
    results.push(check(overflowFadeCorrect, "Trusted hover preserves the independent overflow fade beneath the menu mask"))
    const box = trigger.getBoundingClientRect()
    results.push(check(trigger.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), "Pointer hits the menu above the title, not the underlying session button"))
  } else {
    row.removeAttribute("data-psb-overlay-probe")
    results.push(check(touch || (!row.matches(":hover") && getComputedStyle(actions).opacity === "0" && !faded), "Moving the pointer away restores the full title and hides the overlay without reflow"))
  }
  return { left: rect.left, width: rect.width, x: 0, y: 0, results }
}
