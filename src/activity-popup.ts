/** Keep native menu behavior, but align its presentation to the whole segmented panel.
 * Ui.Menu anchors to a single button and exposes neither an anchor nor a gap prop. */
export function alignActivityPopup(panel: HTMLElement, menu: HTMLElement) {
  const positioner = menu.parentElement
  const set = (name: string, value: string) => {
    if (menu.style.getPropertyValue(name) !== value) menu.style.setProperty(name, value)
  }
  const align = () => {
    if (!panel.isConnected || !menu.isConnected) return
    const anchor = panel.getBoundingClientRect()
    set("--psb-menu-width", `${anchor.width}px`)
    // A future host may use different positioning markup. In that case retain its
    // native placement rather than guessing or changing a host-owned wrapper.
    if (!positioner?.hasAttribute("data-popper-positioner")) return
    const origin = positioner.getBoundingClientRect()
    const height = menu.getBoundingClientRect().height
    const above = origin.top + origin.height / 2 < anchor.top + anchor.height / 2
    const top = above ? anchor.top - 8 - height : anchor.bottom + 8
    const left = Math.max(8, Math.min(anchor.left, innerWidth - anchor.width - 8))
    const safeTop = Math.max(8, Math.min(top, innerHeight - height - 8))
    set("translate", `${left - origin.left}px ${safeTop - origin.top}px`)
  }
  const resize = new ResizeObserver(align)
  resize.observe(panel)
  resize.observe(menu)
  const placement = new MutationObserver(align)
  if (positioner?.hasAttribute("data-popper-positioner")) placement.observe(positioner, { attributes: true, attributeFilter: ["style"] })
  window.addEventListener("resize", align)
  window.addEventListener("scroll", align, true)
  align()
  return () => {
    resize.disconnect()
    placement.disconnect()
    window.removeEventListener("resize", align)
    window.removeEventListener("scroll", align, true)
    menu.style.removeProperty("--psb-menu-width")
    menu.style.removeProperty("translate")
  }
}
