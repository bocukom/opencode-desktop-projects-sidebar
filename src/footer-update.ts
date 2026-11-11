/** Position the existing host control without reparenting it or replacing its handler. */
export function installFooterUpdate(root: HTMLElement) {
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const mount = root.closest<HTMLElement>('[data-slot="vertical-tabs-mount"]')
  const slot = root.querySelector<HTMLElement>('.psb-footer-update-slot')
  if (!mount || !slot || !win.ResizeObserver) return () => {}
  let control: HTMLElement | undefined
  let parent: HTMLElement | undefined
  let originalTitle: string | null = null
  const clear = () => {
    if (control) {
      control.removeAttribute('data-psb-update')
      control.style.removeProperty('--psb-update-x')
      control.style.removeProperty('--psb-update-y')
      if (originalTitle === null) control.removeAttribute('title')
      else control.setAttribute('title', originalTitle)
    }
    parent?.removeAttribute('data-psb-update-footer')
    root.removeAttribute('data-psb-has-update')
    control = undefined
    parent = undefined
  }
  const place = () => {
    if (!control) return
    const target = slot.getBoundingClientRect()
    const bounds = mount.getBoundingClientRect()
    for (const [key, value] of [['--psb-update-x', `${target.left - bounds.left}px`], ['--psb-update-y', `${target.top - bounds.top}px`]]) {
      if (control.style.getPropertyValue(key) !== value) control.style.setProperty(key, value)
    }
    const title = control.querySelector('button')?.getAttribute('aria-label')
    if (title && control.title !== title) control.title = title
  }
  const refresh = () => {
    if (control && (!control.isConnected || control.parentElement !== parent)) clear()
    if (!control) {
      // This host slot is shared with other extensions. Recognize only the native
      // updater's arrow, and leave unfamiliar or multi-control footers untouched.
      const footer = mount.querySelector<HTMLElement>('[data-slot="vertical-tabs-footer"]')
      const candidate = footer?.querySelector<HTMLElement>(':scope > [data-slot="titlebar-update"]')
      const arrow = candidate?.querySelector('svg path')?.getAttribute('d')
      if (!footer || footer.children.length !== 1 || !candidate || arrow !== 'M7 11V3M3.5 7.63128L7 11L10.5 7.63128') return
      control = candidate
      parent = footer
      originalTitle = control.getAttribute('title')
      root.setAttribute('data-psb-has-update', '')
      parent.setAttribute('data-psb-update-footer', '')
      control.setAttribute('data-psb-update', '')
    }
    if (parent && parent.children.length !== 1) { clear(); return }
    place()
  }
  const observer = new win.MutationObserver(refresh)
  observer.observe(mount, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-busy'] })
  const resize = new win.ResizeObserver(place)
  resize.observe(slot)
  resize.observe(mount)
  const footer = root.querySelector('.psb-footer')
  if (footer) resize.observe(footer)
  refresh()
  return () => { observer.disconnect(); resize.disconnect(); clear() }
}
