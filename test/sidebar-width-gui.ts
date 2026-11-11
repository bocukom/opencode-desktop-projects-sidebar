import { installSidebarWidth, readSidebarWidth, restoreSidebarWidth } from "../src/sidebar-width.ts"

/** Geometry-only native probe; never opens chats or changes session history. */
export async function runNativeWidthSmoke(preference: { get(): number | undefined; set(width: number): void }) {
  const root = document.querySelector<HTMLElement>('[data-projects-sidebar-root][data-ready="true"]')!
  const sidebar = root?.closest<HTMLElement>('#vertical-tabs-sidebar')
  if (!sidebar || sidebar.dataset.state !== 'open') throw new Error('Width probe needs a mounted, open Projects sidebar')
  const original = readSidebarWidth(sidebar)!
  const bodyStyle = document.body.style.cssText
  const target = original < 580 ? original + 37 : original - 37
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  let dispose = () => {}
  try {
    check(restoreSidebarWidth(sidebar, target), 'Native resize restores requested width synchronously')
    await paint()
    check(preference.get() === target, 'Native width changes persist in plugin Store.global preferences')
    check(restoreSidebarWidth(sidebar, original), 'Native resize remains usable after restoration without a width jump')
    await paint()
    let saved = target
    dispose = installSidebarWidth(root, { get: () => saved, set: (width) => { saved = width } })
    check(readSidebarWidth(sidebar) === target, 'Fresh width controller restores a saved width into existing native state')
    await paint()
    check(saved === target, 'Restoration does not overwrite the saved width with the native default')
    check(!sidebar.querySelector('[data-component="resize-handle"][data-dragging]') && document.body.style.cssText === bodyStyle, 'Native gesture releases handles and restores body styles')
  } finally {
    dispose()
    if (!restoreSidebarWidth(sidebar, original)) throw new Error('Could not restore original sidebar width')
    await paint()
    preference.set(original)
  }
  check(readSidebarWidth(sidebar) === original && preference.get() === original, 'Probe restores original native geometry and persisted width')
  return { ok: true, results }
}
