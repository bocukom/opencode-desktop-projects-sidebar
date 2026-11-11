/** Temporary overflow makes the real native thumb visible even when all loaded rows fit. */
export function prepareScrollbarProbe() {
  const history = document.querySelector<HTMLElement>("[data-psb-history]")!
  const spacer = document.createElement("div")
  spacer.setAttribute("data-psb-scrollbar-probe", String(history.scrollTop))
  spacer.style.height = `${history.clientHeight * 2}px`
  history.append(spacer)
  history.scrollTop = 0
  const rect = history.getBoundingClientRect()
  const sidebar = document.querySelector("#vertical-tabs-sidebar")!.getBoundingClientRect()
  const thumb = getComputedStyle(history, "::-webkit-scrollbar-thumb")
  return {
    x: Math.floor(rect.right - 3), y: Math.ceil(rect.top + 30),
    rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    sidebarRight: sidebar.right, dpr: devicePixelRatio,
    scrollbar: { width: getComputedStyle(history, "::-webkit-scrollbar").width, borderLeft: thumb.borderLeftWidth,
      borderRight: thumb.borderRightWidth, borderRadius: thumb.borderRadius, clip: thumb.backgroundClip },
  }
}

export function finishScrollbarProbe() {
  const spacer = document.querySelector<HTMLElement>("[data-psb-scrollbar-probe]")
  if (!spacer) return
  const history = spacer.parentElement!
  const scroll = Number(spacer.getAttribute("data-psb-scrollbar-probe"))
  spacer.remove()
  history.scrollTop = scroll
}

export function readResizeProbe() {
  const sidebar = document.querySelector<HTMLElement>("#vertical-tabs-sidebar")!
  const handle = sidebar.querySelector<HTMLElement>(':scope > [data-component="resize-handle"]')!
  const rect = handle.getBoundingClientRect()
  const history = sidebar.querySelector<HTMLElement>("[data-psb-history]")!.getBoundingClientRect()
  const x = rect.left + rect.width / 2, y = history.top + 40
  if (!handle.contains(document.elementFromPoint(x, y))) throw new Error("Native resize target is obscured")
  return { x, y, width: sidebar.getBoundingClientRect().width }
}
