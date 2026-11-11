import { installPrototype, selectors } from "../src/adapter.ts"
import { copy } from "../src/copy.ts"
import { mountFixture } from "./fixture-markup.ts"
import fixtureCss from "./fixture.css?inline"

/** Exercise the current Desktop's real interface-card CSS against an isolated host. */
export async function runSettingsSmoke(css: string) {
  const native: string[] = []
  const collect = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (rule.cssText.includes('interface-mode')) native.push(rule.cssText)
      } else if ('cssRules' in rule) collect((rule as CSSGroupingRule).cssRules)
    }
  }
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
    try { collect(sheet.cssRules) } catch { /* Ignore unrelated cross-origin stylesheets. */ }
  }
  // Desktop 2.2.7 loads the Preferences stylesheet on demand, so an app window
  // that never opened Preferences has no interface-card rules to compare against.
  for (let attempt = 0; attempt < 30 && !native.some((rule) => rule.includes('interface-mode-sketch')); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
    native.length = 0
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) {
      try { collect(sheet.cssRules) } catch { /* Ignore unrelated cross-origin stylesheets. */ }
    }
  }
  const installed = native.some((rule) => rule.includes('interface-mode-sketch'))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:700px;height:500px'
  document.body.append(frame)
  const doc = frame.contentDocument!
  mountFixture(doc)
  const style = doc.createElement('style')
  const rules = (installed ? native.join('\n') : fixtureCss) + '\n' + css
  style.textContent = rules
  doc.head.append(style)
  const computed = getComputedStyle(document.body)
  for (const name of new Set([...rules.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]))) {
    doc.documentElement.style.setProperty(name, computed.getPropertyValue(name))
  }
  doc.body.style.fontFamily = computed.fontFamily
  doc.querySelector('legend')!.setAttribute('hidden', '')
  let enabled = false
  let locale = 'en'
  const adapter = installPrototype({ document: doc, enabled: () => enabled, setEnabled: (value) => { enabled = value }, copy: () => copy(locale),
    mountList: (container) => { container.textContent = 'Mock history'; return () => {} } })
  // Native cards animate border-color for 120ms; compare the settled selected state.
  const paint = () => new Promise<void>((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())), 160))
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  results.push(installed ? 'Settings card compared with the installed Desktop stylesheet' : 'Settings card compared with the bundled native fixture because the host stylesheet is loaded on demand')
  const input = (mode: string) => doc.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!
  const card = () => doc.querySelector<HTMLElement>(selectors.card)!
  const border = (element: Element) => doc.defaultView!.getComputedStyle(element).borderColor
  const inset = (element: Element) => doc.defaultView!.getComputedStyle(element, '::after').boxShadow
  try {
    await paint()
    const inbox = input('inbox').parentElement!
    const top = input('top').parentElement!
    const compact = () => {
      const nativeRect = inbox.getBoundingClientRect()
      const rect = card().getBoundingClientRect()
      return Math.abs(rect.height - nativeRect.height) < 1 && Math.abs(rect.width - nativeRect.width) < 1 && rect.height < 120 &&
        Math.abs(card().querySelector('[data-slot="interface-mode-sketch"]')!.getBoundingClientRect().height - inbox.querySelector('[data-slot="interface-mode-sketch"]')!.getBoundingClientRect().height) < 1
    }
    check(compact(), 'Projects settings card matches native card width, compact height and preview height')
    check(card().querySelector('[data-slot="interface-mode-name"]')!.textContent === 'Projects' && card().title.includes('Experimental') && card().title.includes(copy('en').description), 'Projects has a native one-line title and keeps its experimental description in the tooltip')
    check(border(inbox) !== border(top) && inset(inbox) !== 'none', 'Native Inbox selection is visible before enabling Projects')
    card().querySelector<HTMLInputElement>('input')!.click()
    await paint()
    check(border(inbox) === border(top) && inset(inbox) === 'none' && border(card()) !== border(inbox) && inset(card()) !== 'none', 'Only Projects has a selected border and inset; underlying native Inbox is visually neutral: ' + JSON.stringify({ inbox: border(inbox), top: border(top), projects: border(card()), inboxInset: inset(inbox), projectsInset: inset(card()) }))
    check(doc.querySelectorAll('input:checked').length === 1 && card().querySelector('input')!.checked && inbox.hasAttribute('data-checked'), 'Exactly one radio is checked without removing native selection metadata')
    input('inbox').click()
    await paint()
    check(!enabled && input('inbox').checked && border(inbox) !== border(top) && inset(inbox) !== 'none' && !card().hasAttribute('data-checked'), 'Clicking the underlying Inbox still disables Projects and restores native selected styling')
    card().querySelector<HTMLInputElement>('input')!.click()
    await paint()
    locale = 'ru'; adapter.refresh()
    await paint()
    check(compact() && card().querySelector('[data-slot="interface-mode-name"]')!.textContent === 'Проекты' && card().title.includes('Эксперимент'), 'Localized Projects card remains compact after remount')
    doc.documentElement.dir = 'rtl'
    await paint()
    check(compact(), 'Settings card preserves native sizing in RTL')
    adapter.fail()
    await paint()
    check(input('inbox').checked && border(inbox) !== border(top) && inset(inbox) !== 'none', 'Failure fallback restores native Inbox selected styling')
    adapter.dispose()
    check(!doc.querySelector(selectors.card) && !doc.querySelector('[data-projects-sidebar-selected]') && input('inbox').checked, 'Unloading removes custom selection styling and leaves native radios intact')
  } finally { adapter.dispose(); frame.remove() }
  return results
}
