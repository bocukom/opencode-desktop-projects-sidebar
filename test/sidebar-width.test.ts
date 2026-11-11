import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { installSidebarWidth, readSidebarWidth, restoreSidebarWidth, validSidebarWidth } from "../src/sidebar-width.ts"

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

function fixture(saved?: number, native = true) {
  const dom = new JSDOM('<!doctype html><body><aside id="vertical-tabs-sidebar" data-state="open" style="--sidebar-peek-width:240px"><section data-ready="true"></section><div data-component="resize-handle" data-direction="horizontal" data-edge="end"></div></aside></body>')
  const view = dom.window
  // jsdom has no PointerEvent. Keep the gesture fields the native reducer consumes.
  class PointerEvent extends view.MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 0 }
  }
  Object.defineProperty(view, 'PointerEvent', { value: PointerEvent, configurable: true })
  const sidebar = view.document.querySelector<HTMLElement>('aside')!
  const root = sidebar.querySelector<HTMLElement>('section')!
  const handle = sidebar.querySelector<HTMLElement>('div')!
  let active: { id: number; start: number; width: number; moved: boolean } | undefined
  let starts = 0
  let ends = 0
  if (native) handle.addEventListener('pointerdown', ((event: PointerEvent) => {
    starts++
    active = { id: event.pointerId, start: event.clientX, width: readSidebarWidth(sidebar)!, moved: false }
    sidebar.dataset.locked = 'true'
  }) as EventListener)
  view.addEventListener('pointermove', ((event: PointerEvent) => {
    if (!active || active.id !== event.pointerId) return
    if (!active.moved) { active.moved = true; handle.dataset.dragging = ''; return }
    const direction = handle.style.direction === 'rtl' ? -1 : 1
    sidebar.style.setProperty('--sidebar-peek-width', `${Math.min(640, Math.max(136, active.width + (event.clientX - active.start) * direction))}px`)
  }) as EventListener)
  view.addEventListener('pointerup', ((event: PointerEvent) => {
    if (!active || active.id !== event.pointerId) return
    ends++; active = undefined; delete handle.dataset.dragging; delete sidebar.dataset.locked
  }) as EventListener)
  const writes: number[] = []
  const preference = { get: () => saved, set: (width: number) => { saved = width; writes.push(width) } }
  let dispose = () => {}
  return { dom, view, sidebar, root, handle, preference, writes, starts: () => starts, ends: () => ends,
    install: () => { dispose = installSidebarWidth(root, preference) },
    dispose: () => dispose(), close: () => { dispose(); view.close() } }
}

test('width validation rejects invalid, nonfinite and out-of-range preferences', () => {
  for (const value of [undefined, null, '240', NaN, Infinity, 0, 135.9, 640.1]) assert.equal(validSidebarWidth(value), false)
  for (const value of [136, 240, 377.25, 640]) assert.equal(validSidebarWidth(value), true)
})

test('reads full host width rather than collapsed geometry; rejects malformed CSS', () => {
  const f = fixture()
  try {
    for (const value of ['auto', '240', '50%', '900px', '-240px', 'calc(240px)']) {
      f.sidebar.style.setProperty('--sidebar-peek-width', value)
      assert.equal(readSidebarWidth(f.sidebar), undefined)
    }
    f.sidebar.style.setProperty('--sidebar-peek-width', '377.25px')
    assert.equal(readSidebarWidth(f.sidebar), 377.25)
  } finally { f.close() }
})

for (const rtl of [false, true]) test(`restores native state synchronously, releases gesture and preserves next resize; RTL=${rtl}`, async () => {
  const f = fixture(370)
  try {
    f.handle.style.direction = rtl ? 'rtl' : 'ltr'
    f.install()
    assert.equal(readSidebarWidth(f.sidebar), 370)
    assert.equal(f.starts(), 1)
    assert.equal(f.ends(), 1)
    assert.equal(f.sidebar.dataset.locked, undefined)
    assert.equal(f.handle.hasAttribute('data-dragging'), false)
    assert.deepEqual(f.writes, [])
    assert.equal(restoreSidebarWidth(f.sidebar, 385), true)
    await settle()
    assert.equal(f.preference.get(), 385)
    assert.deepEqual(f.writes, [385])
  } finally { f.close() }
})

for (const state of ['closed', 'peek', 'dragging']) test(`defers restoration while ${state}, preserving stored width`, async () => {
  const f = fixture(410)
  try {
    if (state === 'closed') f.sidebar.dataset.state = 'closed'
    if (state === 'peek') f.sidebar.dataset.peek = ''
    if (state === 'dragging') f.handle.dataset.dragging = ''
    f.install()
    assert.equal(readSidebarWidth(f.sidebar), 240)
    assert.deepEqual(f.writes, [])
    f.sidebar.dataset.state = 'open'; delete f.sidebar.dataset.peek; delete f.handle.dataset.dragging
    await settle()
    assert.equal(readSidebarWidth(f.sidebar), 410)
    assert.equal(f.preference.get(), 410)
  } finally { f.close() }
})

test('captures initial width, persists resize, ignores closure geometry and stops after disposal', async () => {
  const f = fixture()
  try {
    f.install()
    assert.deepEqual(f.writes, [240])
    f.sidebar.style.setProperty('--sidebar-peek-width', '325px')
    await settle()
    assert.deepEqual(f.writes, [240, 325])
    f.sidebar.dataset.state = 'closed'; f.sidebar.style.width = '0px'
    await settle()
    assert.deepEqual(f.writes, [240, 325])
    f.dispose()
    f.sidebar.style.setProperty('--sidebar-peek-width', '450px')
    await settle()
    assert.equal(f.preference.get(), 325)
  } finally { f.close() }
})

test('unsupported native host preserves saved preference and never retries or locks the body', async () => {
  const f = fixture(400, false)
  try {
    f.install()
    f.sidebar.style.setProperty('--sidebar-peek-width', '250px')
    await settle()
    assert.equal(f.preference.get(), 400)
    assert.deepEqual(f.writes, [])
    assert.equal(f.sidebar.dataset.locked, undefined)
  } finally { f.close() }
})

test('missing pointer support or resize handle fails without changing saved width', () => {
  const f = fixture(400)
  try {
    Object.defineProperty(f.view, 'PointerEvent', { value: undefined })
    assert.equal(restoreSidebarWidth(f.sidebar, 400), false)
    f.handle.remove()
    f.install()
    assert.equal(f.preference.get(), 400)
    assert.deepEqual(f.writes, [])
  } finally { f.close() }
})
