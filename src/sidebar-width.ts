const minimum = 136
const maximum = 640

export function validSidebarWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

/** Read the host's full width, not its animated/closed/peek bounding box. */
export function readSidebarWidth(sidebar: HTMLElement): number | undefined {
  const value = sidebar.style.getPropertyValue("--sidebar-peek-width").trim()
  if (!/^\d+(?:\.\d+)?px$/.test(value)) return
  const width = Number.parseFloat(value)
  return validSidebarWidth(width) ? width : undefined
}

/** Update the native resize state as well as its DOM. No CSS overrides or pointer movement.
 * Desktop 2.2.6 accepts synthetic pointer events and captures only trusted pointers.
 * Keep the entire gesture synchronous, always release it, and verify the result. */
export function restoreSidebarWidth(sidebar: HTMLElement, width: number): boolean {
  const current = readSidebarWidth(sidebar)
  if (!validSidebarWidth(width) || current === undefined) return false
  if (Math.abs(current - width) < 0.5) return true
  const doc = sidebar.ownerDocument
  const view = doc.defaultView!
  const handle = sidebar.querySelector<HTMLElement>(':scope > [data-component="resize-handle"][data-direction="horizontal"][data-edge="end"]')
  if (!handle || sidebar.dataset.state !== "open" || sidebar.hasAttribute("data-peek") ||
    doc.querySelector('[data-component="resize-handle"][data-dragging]') || !view.PointerEvent) return false
  const pointerId = 2147483646
  const delta = (width - current) * (view.getComputedStyle(handle).direction === "rtl" ? -1 : 1)
  const event = (type: string, clientX: number, buttons: number) => new view.PointerEvent(type, {
    bubbles: true, pointerId, pointerType: "mouse", isPrimary: true, button: 0, buttons, detail: 1, clientX,
  })
  try {
    handle.dispatchEvent(event("pointerdown", 0, 1))
    view.dispatchEvent(event("pointermove", delta, 1))
    view.dispatchEvent(event("pointermove", delta, 1))
  } catch {
    return false
  } finally {
    view.dispatchEvent(event("pointerup", delta, 0))
  }
  return Math.abs((readSidebarWidth(sidebar) ?? 0) - width) < 0.5
}

/** Lifetime is exactly one ready Projects mount; fallback/unload stops observing. */
export function installSidebarWidth(root: HTMLElement, preference: { get(): number | undefined; set(width: number): void }) {
  const sidebar = root.closest<HTMLElement>("#vertical-tabs-sidebar")
  if (!sidebar) return () => {}
  let initialized = false
  let stopped = false
  const sync = () => {
    if (stopped || root.dataset.ready !== "true" || !root.isConnected) return
    const current = readSidebarWidth(sidebar)
    if (current === undefined) return
    if (!initialized) {
      const saved = preference.get()
      if (validSidebarWidth(saved) && Math.abs(saved - current) >= 0.5) {
        // A closed sidebar has no handle. Wait for the native open, without recording 0/default.
        if (sidebar.dataset.state !== "open" || sidebar.hasAttribute("data-peek") ||
          sidebar.ownerDocument.querySelector('[data-component="resize-handle"][data-dragging]')) return
        initialized = true
        if (!restoreSidebarWidth(sidebar, saved)) {
          // Unknown host behavior: don't fight it or overwrite the last known good preference.
          stopped = true
          return
        }
      }
      initialized = true
    }
    const width = readSidebarWidth(sidebar)
    if (width !== undefined && preference.get() !== width) preference.set(width)
  }
  const observer = new sidebar.ownerDocument.defaultView!.MutationObserver(sync)
  observer.observe(sidebar, { attributes: true, childList: true, subtree: true, attributeFilter: ["style", "data-state", "data-peek", "data-dragging"] })
  sync()
  return () => { stopped = true; observer.disconnect() }
}
