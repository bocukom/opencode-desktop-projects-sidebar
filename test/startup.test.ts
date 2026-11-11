import assert from "node:assert/strict"
import test from "node:test"
import { JSDOM } from "jsdom"
import { installPrototype, selectors } from "../src/adapter.ts"
import { copy } from "../src/copy.ts"
import { mountFixture } from "./fixture-markup.ts"

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

function fixture(saved = true, hydrated = true, broken = false) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  const doc = dom.window.document
  let ready = hydrated
  let enabled = saved
  let writes = 0
  const adapter = installPrototype({
    document: doc, ready: () => ready, enabled: () => enabled,
    setEnabled: (value) => { writes++; enabled = value }, copy: () => copy('en'),
    mountList: (container) => { if (broken) throw new Error('Mock render error'); container.textContent = 'Mock history'; return () => {} },
  })
  return { dom, doc, adapter, writes: () => writes,
    hydrate: (value: boolean) => { enabled = value; ready = true; adapter.refresh() },
    curtain: () => doc.querySelector('[data-projects-sidebar-startup]'),
    close: () => { adapter.dispose(); dom.window.close() },
  }
}

test('saved Projects suppresses Inbox synchronously, including delayed host DOM, until the ready mount', async () => {
  const f = fixture()
  try {
    assert.ok(f.curtain())
    await settle()
    assert.ok(f.curtain())
    mountFixture(f.doc)
    const inbox = f.doc.querySelector(selectors.inbox)!
    assert.equal(f.dom.window.getComputedStyle(inbox).visibility, 'hidden')
    await settle()
    assert.equal(f.doc.querySelector(selectors.root)?.getAttribute('data-ready'), 'true')
    assert.equal(f.curtain(), null)
    assert.equal(f.writes(), 0)
  } finally { f.close() }
})

for (const enabled of [false, true]) test(`delayed preferences do not mount or overwrite defaults; hydrated enabled=${enabled} wins`, async () => {
  const f = fixture(false, false)
  try {
    mountFixture(f.doc)
    await settle()
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.curtain(), null)
    assert.equal(f.writes(), 0)
    f.hydrate(enabled)
    await settle()
    assert.equal(!!f.doc.querySelector(selectors.root), enabled)
    assert.equal(f.writes(), 0)
  } finally { f.close() }
})

test('mount failure immediately removes startup hiding and preserves the saved preference', async () => {
  const f = fixture(true, true, true)
  try {
    mountFixture(f.doc)
    await settle()
    assert.equal(f.curtain(), null)
    assert.equal(f.doc.querySelector(selectors.root), null)
    assert.equal(f.dom.window.getComputedStyle(f.doc.querySelector(selectors.inbox)!).visibility, 'visible')
    assert.equal(f.writes(), 0)
  } finally { f.close() }
})

test('disposal removes the startup curtain even before the host mounts', () => {
  const f = fixture()
  try { f.adapter.dispose(); assert.equal(f.curtain(), null) } finally { f.close() }
})

test('missing or incompatible host cannot leave Inbox hidden beyond two seconds', async () => {
  const f = fixture()
  try {
    assert.ok(f.curtain())
    await new Promise((resolve) => setTimeout(resolve, 2100))
    assert.equal(f.curtain(), null)
    mountFixture(f.doc)
    await settle()
    assert.equal(f.doc.querySelector(selectors.root)?.getAttribute('data-ready'), 'true')
  } finally { f.close() }
})
