import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { installFooterUpdate } from '../src/footer-update.ts'

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))
function fixture() {
  const dom = new JSDOM(`<div data-slot="vertical-tabs-mount"><section data-projects-sidebar-root><div class="psb-footer"><div class="psb-footer-actions"><button class="psb-footer-settings"></button><span class="psb-footer-update-slot"></span></div></div></section><div data-slot="vertical-tabs-footer"><div data-slot="titlebar-update"><button aria-label="Download update"><span><svg><path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128"></path></svg></span><span data-slot="titlebar-update-label">Update</span></button></div></div></div>`)
  let disconnected = false
  Object.assign(dom.window, { ResizeObserver: class { observe() {} disconnect() { disconnected = true } } })
  const doc = dom.window.document
  const root = doc.querySelector<HTMLElement>('section')!
  const control = doc.querySelector<HTMLElement>('[data-slot="titlebar-update"]')!
  const parent = control.parentElement!
  const button = control.querySelector('button')!
  let clicks = 0
  button.onclick = () => { clicks++ }
  return { dom, doc, root, control, parent, button, clicks: () => clicks, disconnected: () => disconnected }
}

test('native update is placed beside settings without replacing its node or handler', async () => {
  const f = fixture()
  const dispose = installFooterUpdate(f.root)
  try {
    assert.ok(f.root.hasAttribute('data-psb-has-update'))
    assert.equal(f.control.parentElement, f.parent)
    assert.equal(f.control.title, 'Download update')
    assert.equal(f.control.style.getPropertyValue('--psb-update-x'), '0px')
    f.button.click()
    assert.equal(f.clicks(), 1)
    f.button.setAttribute('aria-label', 'Installing update')
    f.button.disabled = true
    f.control.querySelector('svg')!.remove()
    await settle()
    assert.equal(f.control.title, 'Installing update')
    assert.ok(f.control.hasAttribute('data-psb-update'))
    assert.ok(f.button.disabled)
    f.control.remove()
    await settle()
    assert.equal(f.root.hasAttribute('data-psb-has-update'), false)
    f.parent.append(f.control)
  } finally {
    dispose()
    assert.ok(f.disconnected())
    assert.equal(f.control.hasAttribute('data-psb-update'), false)
    assert.equal(f.control.hasAttribute('title'), false)
    assert.equal(f.parent.hasAttribute('data-psb-update-footer'), false)
    assert.equal(f.control.style.length, 0)
    f.dom.window.close()
  }
})

test('late updater appearance is detected and unrelated footer controls are left alone', async () => {
  const f = fixture()
  f.control.remove()
  const dispose = installFooterUpdate(f.root)
  try {
    assert.equal(f.root.hasAttribute('data-psb-has-update'), false)
    f.parent.append(f.control)
    await settle()
    assert.ok(f.root.hasAttribute('data-psb-has-update'))
    f.parent.append(f.doc.createElement('button'))
    await settle()
    assert.equal(f.root.hasAttribute('data-psb-has-update'), false)
    assert.equal(f.parent.hasAttribute('data-psb-update-footer'), false)
  } finally { dispose(); f.dom.window.close() }
})

test('unknown native icon is not treated as an updater', () => {
  const f = fixture()
  f.control.querySelector('path')!.setAttribute('d', 'M0 0')
  const dispose = installFooterUpdate(f.root)
  try { assert.equal(f.root.hasAttribute('data-psb-has-update'), false) }
  finally { dispose(); f.dom.window.close() }
})
