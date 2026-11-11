import { mkdir, writeFile } from "node:fs/promises"
import { Plugin, Style } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HistoryFooter, type ActivityEntry } from "../src/history-footer.tsx"
import { copy } from "../src/copy.ts"
import css from "../src/style.css?inline"
import { radarKeyframes } from "../src/spinner-radar.ts"
import { runActivitySmoke } from "./activity-smoke.tsx"
import { runForksSmoke } from "./forks-smoke.tsx"
import { Disclosure } from "../src/disclosure.tsx"
import { runFallbackSmoke } from "./fallback-smoke.tsx"
import { revealSession } from "../src/reveal-session.ts"
import { runListSmoke } from "./list-smoke.tsx"
import { runHistoryLoadingSmoke } from "./history-loading-smoke.tsx"
import { runSettingsSmoke } from "./settings-smoke.ts"

/** Isolated real native menus; all navigation and data are mocked. No user sessions are opened. */
export default Plugin.define({
  setup(ctx) {
    ctx.add(Style, css + radarKeyframes("psb-spinner-radar"))
    const host = document.createElement("div")
    host.setAttribute("data-projects-sidebar-root", "")
    host.style.cssText = "position:fixed;inset:100px auto auto 40px;width:340px;height:auto;padding:18px;background:var(--v2-background-bg-layer-01);z-index:10;border-radius:12px"
    document.body.append(host)
    const entry = (id: string): ActivityEntry => ({ server: "mock", id, title: `Example session ${id}` })
    const [lists, setLists] = createSignal({ running: [entry("run")], ready: [entry("ready-1"), entry("ready-2")] })
    const [locale, setLocale] = createSignal("en")
    const opens: string[] = []
    const reveals: string[] = []
    let settingsOpened = 0
    let revealTarget = (_item: ActivityEntry) => {}
    let unmountPreview: (() => void) | undefined
    const unmount = render(() => <HistoryFooter ctx={{ ui: ctx.ui, tabs: { list: () => [], open: (target) => { opens.push(target.id); setLists((value) => ({ ...value, ready: value.ready.filter((item) => item.id !== target.id) })) }, close() {}, move() {}, focus() {} } }}
      lists={lists()} text={copy(locale())} settings={() => settingsOpened++} reveal={(item) => { reveals.push(item.id); revealTarget(item) }} />, host)
    const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const results: string[] = []
    const check = (ok: unknown, message: string) => { if (!ok) throw new Error(message); results.push(message) }
    const checkAligned = (message: string) => {
      const panel = host.querySelector('.psb-footer-activity')!.getBoundingClientRect()
      const popup = document.querySelector('.psb-activity-menu')!.getBoundingClientRect()
      const gap = popup.bottom <= panel.top ? panel.top - popup.bottom : popup.top - panel.bottom
      check(Math.abs(popup.left - panel.left) < 0.75 && Math.abs(popup.right - panel.right) < 0.75 && Math.abs(gap - 8) < 0.75,
        `${message}: popup shares both panel edges and an 8px gap (${JSON.stringify({ panel: panel.toJSON(), popup: popup.toJSON(), gap })})`)
    }
    const trigger = (kind: string) => host.querySelector<HTMLButtonElement>(`[data-psb-counter="${kind}"] button`)!
    const openMenu = async (kind: string, mouse = false) => {
      trigger(kind).focus()
      trigger(kind).dispatchEvent(mouse
        ? new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse", isPrimary: true })
        : new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      await paint()
    }
    const choose = async (item: HTMLElement, mouse = false) => {
      item.focus()
      item.dispatchEvent(mouse
        ? new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse", isPrimary: true })
        : new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      await paint()
    }
    const test = async () => {
      results.push(...await runFallbackSmoke(css))
      results.push(...await runActivitySmoke(ctx))
      results.push(...await runListSmoke())
      results.push(...await runHistoryLoadingSmoke())
      results.push(...await runSettingsSmoke(css))
      await paint()
      const settings = host.querySelector<HTMLButtonElement>('.psb-footer-settings')!
      const settingsRect = settings.getBoundingClientRect()
      const activityRect = host.querySelector('.psb-footer-activity')!.getBoundingClientRect()
      check(settingsRect.left > activityRect.right && Math.abs(settingsRect.top + settingsRect.height / 2 - activityRect.top - activityRect.height / 2) < 1, 'Settings sits to the right of the activity panel in the same footer row')
      settings.click()
      check(settingsOpened === 1 && settings.title === 'Settings' && settings.getAttribute('aria-label') === 'Settings', 'Footer settings invokes its action once and has an accessible tooltip')
      const footerRect = host.querySelector('.psb-footer')!.getBoundingClientRect()
      check(Math.abs(activityRect.left - footerRect.left - 8) < 0.75, 'Activity panel starts at the footer start edge instead of being centered')
      check(settings.querySelector('svg')!.getBoundingClientRect().width === 20, 'Settings gear is enlarged to 20px without changing footer height')
      check(!host.querySelector('.psb-loaded') && !host.textContent?.includes('28'), 'Footer shows no loaded-chat counter')
      const revealHistory = document.createElement('div')
      revealHistory.style.cssText = 'position:fixed;right:20px;top:150px;width:260px;height:100px;overflow:auto'
      revealHistory.innerHTML = '<details data-psb-group="popup-project"><summary>Popup project</summary><ul><li data-psb-tree-node="source"><ul class="psb-fork-children" hidden><li><div style="height:240px"></div><button data-psb-session="ready-1" data-psb-server="mock">Target</button></li></ul></li></ul></details>'
      document.body.append(revealHistory)
      revealTarget = (item) => { revealSession(revealHistory, item, () => { revealHistory.querySelector('details')!.open = true }, () => { revealHistory.querySelector<HTMLUListElement>('ul.psb-fork-children')!.hidden = false }) }
      await paint()
      check(trigger("ready").textContent?.includes("2") && !trigger("ready").disabled, "Unread trigger has a labeled count")
      for (const id of ["ready-1", "ready-2"]) {
        const mouse = id === "ready-1"
        await openMenu("ready", mouse)
        checkAligned("Unread popup")
        const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes(`Example session ${id}`))
        check(!!item, `Native popup lists the unread session with ${mouse ? "pointer" : "keyboard"} input`)
        const rect = item!.getBoundingClientRect()
        check(item!.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)), "Popup item is visible and unobstructed")
        await choose(item!, mouse)
        if (id === 'ready-1') {
          const row = revealHistory.querySelector<HTMLElement>('[data-psb-session]')!.getBoundingClientRect()
          const viewport = revealHistory.getBoundingClientRect()
          check(revealHistory.querySelector('details')!.open && !revealHistory.querySelector<HTMLUListElement>('ul.psb-fork-children')!.hidden, 'Selecting an unread popup entry reveals its collapsed project and source branch')
          check(row.top >= viewport.top && row.bottom <= viewport.bottom && revealHistory.scrollTop > 0, 'Popup target scrolls into the history viewport without scrolling the document')
        }
        if (mouse) check(trigger("ready").textContent?.includes("1") && !trigger("ready").disabled, "Reading one completion decrements the count and keeps the other selectable")
      }
      check(opens.join() === "ready-1,ready-2" && trigger("ready").disabled && trigger("ready").textContent?.includes("0"), "Reading sessions updates the count and disables the empty trigger")
      await openMenu("running")
      const running = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes("Example session run"))
      check(!!running, "Running popup lists the active session")
      check(running!.closest('[role="menu"]')!.classList.contains("psb-activity-menu"), "Only the popup linked to the footer trigger receives activity styling")
      check(running!.closest('[role="menu"]')!.textContent?.includes("In Progress · 1"), "Popup has a heading with its category and count")
      const groupLabel = running!.closest('[role="menu"]')!.querySelector<HTMLElement>('[data-slot="menu-v2-group-label"]')!
      check(groupLabel.dataset.psbHeading === "In Progress" && groupLabel.dataset.psbCount === "1", "Popup heading has a separate accent count badge")
      checkAligned("In Progress popup")
      await choose(running!)
      check(opens.at(-1) === "run", "Running popup navigates through the supplied tabs adapter")
      check(reveals.join() === 'ready-1,ready-2,run', 'Both popup categories request sidebar reveal while preserving native navigation')
      revealHistory.remove()
      revealTarget = () => {}
      setLists({ running: [], ready: [] }); await paint()
      check(trigger("running").disabled, "Finishing all work disables the running trigger")
      for (const kind of ["running", "ready"] as const) {
        setLists({ running: [], ready: [], [kind]: [entry(`${kind}-first`), entry(`${kind}-last`)] }); await paint()
        const originalTrigger = trigger(kind)
        await openMenu(kind, kind === "running")
        const first = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent?.includes(`Example session ${kind}-first`))
        const popup = first?.closest('[role="menu"]')
        check(!!popup, `${kind} popup is open before background activity changes`)
        setLists((value) => ({ ...value, [kind]: [entry(`${kind}-last`)] })); await paint()
        check(trigger(kind) === originalTrigger && !!popup?.isConnected && [...popup.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent?.includes(`Example session ${kind}-last`)), `${kind} popup stays open with the same trigger while entries remain`)
        const navigationCount = opens.length
        setLists((value) => ({ ...value, [kind]: [] })); await paint()
        check(!popup?.isConnected && !document.querySelector('[role="menu"]') && trigger(kind).disabled && trigger(kind).textContent?.includes("0"), `${kind} popup closes automatically when the final entry disappears in the background`)
        check(opens.length === navigationCount, `${kind} automatic close does not navigate to a session`)
        setLists((value) => ({ ...value, [kind]: [entry(`${kind}-new`)] })); await paint()
        check(!trigger(kind).disabled && !document.querySelector('[role="menu"]'), `${kind} new activity re-enables the trigger without reopening a stale popup`)
        await openMenu(kind, kind === "running")
        check([...document.querySelectorAll('[role="menuitem"]')].some((item) => item.textContent?.includes(`Example session ${kind}-new`)), `${kind} popup can be opened again with fresh activity`)
        setLists({ running: [], ready: [] }); await paint()
      }
      check(!host.querySelector("[data-psb-restore], .psb-restore") && !host.textContent?.includes("Inbox"), "Footer has no Inbox button")
      const longTitle = 'A very long session title <not HTML> & "quoted" '.repeat(12)
      const longEntry = { ...entry("long"), title: longTitle, waiting: "approval" as const }
      setLists({ running: [longEntry], ready: [] }); await paint()
      await openMenu("running")
      const longRow = document.querySelector<HTMLElement>('.psb-activity-menu [role="menuitem"]')!
      const longMenu = longRow.closest<HTMLElement>('[role="menu"]')!
      const longLabel = longRow.querySelector<HTMLElement>('[data-slot="menu-v2-item-content"] > span')!
      const description = longRow.querySelector<HTMLElement>('[data-psb-description]')!
      check(longLabel.textContent === longTitle && longRow.title.startsWith(longTitle) && longRow.getAttribute("aria-label")?.includes(longTitle), "Long titles remain complete, literal and available in title and accessible name")
      check(getComputedStyle(longLabel).textOverflow === "ellipsis" && getComputedStyle(longLabel).whiteSpace === "nowrap" && longLabel.scrollWidth > longLabel.clientWidth && longMenu.scrollWidth === longMenu.clientWidth, "Long session names truncate to one line without widening or horizontally scrolling the popup")
      check(description.dataset.psbDescription === copy("en").approvalShort && getComputedStyle(description, "::after").textOverflow === "ellipsis", "Pending approval has a compact inline badge with the full explanation in title")
      check(longRow.getBoundingClientRect().height === 32 && description.getBoundingClientRect().height <= 20 && getComputedStyle(description).display === "flex", "Popup title and optional approval badge share one compact line")
      check(longRow.dataset.psbWaiting === "approval" && !longMenu.querySelector('button, svg, [aria-haspopup]'), "Popup has no three-dot actions or decorative status dots")
      check(getComputedStyle(longMenu).borderRadius === "12px" && getComputedStyle(trigger("running")).borderRadius === "11px" && getComputedStyle(host.querySelector('.psb-footer-activity')!).borderRadius === "14px", "Popup has a smaller 12px radius while the continuous panel retains its 14px radius")
      check(getComputedStyle(longMenu).padding === "4px", "Popup has reduced 4px padding")
      host.style.width = "300px"; await paint()
      checkAligned("Popup after narrowing the sidebar while open")
      host.style.width = "380px"; await paint()
      checkAligned("Popup after widening the sidebar while open")
      setLists({ running: [{ ...longEntry, waiting: "input" }], ready: [] }); await paint()
      const question = document.querySelector<HTMLElement>('.psb-activity-menu [role="menuitem"]')!
      check(longMenu.isConnected && question.title.includes(copy("en").input) && question.dataset.psbWaiting === "input", "Open popup updates permission status to answer-required without closing")
      setLists({ running: [{ ...longEntry, waiting: undefined }], ready: [] }); await paint()
      check(longMenu.isConnected && !document.querySelector<HTMLElement>('.psb-activity-menu [role="menuitem"]')!.dataset.psbWaiting, "Answering the request removes the waiting label while keeping running work selectable")
      longMenu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await paint()
      check(!document.querySelector('[role="menu"]'), "Escape still dismisses the native activity popup")
      setLists({ running: Array.from({ length: 80 }, (_, index) => entry(`many-${index}`)), ready: [] }); await paint()
      await openMenu("running")
      const scrollingMenu = document.querySelector<HTMLElement>('.psb-activity-menu')!
      const scrollingRect = scrollingMenu.getBoundingClientRect()
      check(scrollingMenu.scrollHeight > scrollingMenu.clientHeight && scrollingRect.height <= 420 && scrollingRect.top >= 0 && scrollingRect.bottom <= innerHeight, "Large activity lists scroll within the viewport instead of growing offscreen")
      const last = scrollingMenu.querySelector<HTMLElement>('[role="menuitem"]:last-child')!
      last.scrollIntoView({ block: "nearest" }); await paint()
      check(last.getBoundingClientRect().bottom <= scrollingMenu.getBoundingClientRect().bottom, "The final entry in a long activity list remains reachable")
      setLists({ running: [], ready: [] }); await paint()
      for (const lang of ["en", "ru"]) for (const width of [220, 340]) {
        setLocale(lang); host.style.width = `${width}px`
        setLists({ running: [entry("run")], ready: [entry("ready-1"), entry("ready-2")] }); await paint()
        check(host.scrollWidth === host.clientWidth && [...host.querySelectorAll<HTMLElement>(".psb-counter-face")].every((face) => face.scrollWidth <= face.clientWidth), `${lang} footer fits at ${width}px without clipped labels`)
        check(host.querySelector('[data-psb-counter="ready"] .psb-counter-badge')!.textContent === "2", `${lang} count has a separate visible badge at ${width}px`)
        const run = trigger("running").getBoundingClientRect(), ready = trigger("ready").getBoundingClientRect()
        check(run.top === ready.top && run.height === ready.height, `${lang} controls remain in one row at ${width}px`)
        const panel = host.querySelector('.psb-footer-activity')!.getBoundingClientRect()
        const footer = host.querySelector('.psb-footer')!.getBoundingClientRect()
        check(panel.height === 30, `${lang} activity panel keeps its 30px height at ${width}px`)
        check(Math.abs(panel.left - footer.left - 8) < 0.75, `${lang} activity panel stays at the footer start at ${width}px`)
        check(Math.abs((panel.top - footer.top) - (footer.bottom - panel.bottom)) < 0.5, `${lang} panel has equal top and bottom footer spacing at ${width}px`)
        await openMenu("ready")
        checkAligned(`${lang} Unread at ${width}px`)
        setLists({ running: [], ready: [] }); await paint()
      }
      setLists({ running: [entry("run")], ready: [entry("ready-1"), entry("ready-2")] }); await paint()
      const runFace = host.querySelector<HTMLElement>('[data-psb-counter="running"] .psb-counter-face')!
      const readyFace = host.querySelector<HTMLElement>('[data-psb-counter="ready"] .psb-counter-face')!
      check(getComputedStyle(runFace).color !== getComputedStyle(readyFace).color, "Nonempty In progress and Unread have distinct blue and yellow accents")
      const separator = getComputedStyle(host.querySelector('.psb-footer')!, '::before')
      check(separator.height === "1px" && separator.backgroundImage.includes("linear-gradient") && separator.backgroundImage.includes("0)"), "Footer divider is a fine gradient that fades to transparency at both ends")
      const buttonSeparator = getComputedStyle(host.querySelector('[data-psb-counter="ready"]')!, '::before')
      check(buttonSeparator.width === "1px" && buttonSeparator.height === "14px" && buttonSeparator.content !== "none", "A fine vertical divider separates the two buttons")
      check(runFace.querySelector('svg')!.getBoundingClientRect().width === 16 && runFace.querySelector('.psb-counter-label')!.textContent === "В процессе", "Button icons grow to 16px without increasing panel height")
      await openMenu("running")
      check(getComputedStyle(trigger("running")).backgroundColor !== "rgba(0, 0, 0, 0)" && getComputedStyle(trigger("ready")).backgroundColor === "rgba(0, 0, 0, 0)", "Only the opened segment is selected within the shared panel")
      const plainRow = document.querySelector<HTMLElement>('.psb-activity-menu [role="menuitem"]')!
      check(plainRow.title === "Example session run" && plainRow.querySelector<HTMLElement>('[data-psb-description]')!.dataset.psbDescription === "", "Ordinary popup entries show only a session title, with no project or second line")
      setLists({ running: [], ready: [] }); await paint()
      check(getComputedStyle(runFace).color === getComputedStyle(readyFace).color && trigger("running").disabled && trigger("ready").disabled, "Empty controls return to the same neutral disabled appearance")
      setLists({ running: [entry("run")], ready: [entry("ready-1")] }); await paint()
      host.dir = "rtl"; await paint()
      const runningRect = trigger("running").getBoundingClientRect()
      const readyRect = trigger("ready").getBoundingClientRect()
      check(runningRect.left > readyRect.left, "Activity pills mirror in RTL")
      await openMenu("running")
      check(getComputedStyle(document.querySelector('.psb-activity-menu')!).direction === "rtl", "Portaled activity popup inherits the footer's RTL direction")
      checkAligned("RTL popup")
      const panelRect = host.querySelector('.psb-footer-activity')!.getBoundingClientRect()
      const rtlFooterRect = host.querySelector('.psb-footer')!.getBoundingClientRect()
      const rtlSettingsRect = host.querySelector('.psb-footer-settings')!.getBoundingClientRect()
      check(panelRect.left > rtlSettingsRect.right && Math.abs(rtlFooterRect.right - panelRect.right - 8) < 0.75, "Activity panel mirrors to the logical start in RTL")
      setLists({ running: [], ready: [] }); await paint()
      host.removeAttribute("dir"); setLocale("en"); await paint()
      host.querySelectorAll<HTMLElement>("button").forEach((button) => button.blur())
      const preview = document.createElement("div")
      preview.inert = true
      host.append(preview)
      unmountPreview = render(() => <details open><summary><Disclosure expanded />Example project</summary></details>, preview)
      const project = preview.querySelector("details")!
      results.push(...await runForksSmoke(ctx, project))
      check(getComputedStyle(project.querySelector("summary")!).gap === "3px" && project.querySelector("summary svg")!.getBoundingClientRect().width === 10, "Project uses the same compact chevron with a reduced 3px title gap")
      check(project.querySelector("summary path")!.getAttribute("d") === project.querySelector(".psb-fork-toggle path")!.getAttribute("d"), "Projects and fork sources use the identical rounded chevron")
      const plus = document.createElement('button')
      plus.className = 'psb-project-new'
      plus.textContent = '+'
      project.querySelector('summary')!.append(plus)
      preview.inert = false
      plus.focus(); await paint()
      check(getComputedStyle(plus).display !== 'none' && document.activeElement === plus, 'Expanded project plus remains keyboard-focusable')
      project.open = false; await paint()
      check(getComputedStyle(plus).display !== 'none', 'Collapsed project keeps its plus available to hover and keyboard focus')
      project.open = true; await paint()
      check(getComputedStyle(plus).display !== 'none', 'Reopening the project restores its plus without remounting')
      plus.remove(); preview.inert = true
      await paint()
      host.prepend(preview)
      host.style.inset = "auto auto 70px 40px"
      host.style.width = "380px"
      setLists({ running: [{ ...entry("approval"), waiting: "approval" }, { ...entry("long"), title: longTitle }], ready: [entry("ready-1"), entry("ready-2")] }); await paint()
      await openMenu("running")
      checkAligned("Final bottom-docked popup")
      check(host.querySelector('.psb-footer-activity')!.getBoundingClientRect().width < host.querySelector('.psb-footer')!.getBoundingClientRect().width - 50, "Panel uses a compact content width instead of stretching across the footer")
      document.documentElement.setAttribute("data-psb-footer-result", JSON.stringify({ ok: true, results }))
    }
    void test().catch((error: unknown) => document.documentElement.setAttribute("data-psb-footer-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), results })))
    return () => { unmountPreview?.(); unmount(); host.remove(); document.documentElement.removeAttribute("data-psb-footer-result") }
  },
  main(ctx) {
    const run = async () => {
      const windows = ctx.windows.list()
      if (windows.length !== 1) throw new Error("Footer test requires exactly one window")
      const contents = windows[0].webContents
      const result = await contents.executeJavaScript(`new Promise((resolve, reject) => {
        const read = () => { const value = document.documentElement.getAttribute('data-psb-footer-result'); if (!value) return; observer.disconnect(); clearTimeout(timer); resolve(JSON.parse(value)); };
        const observer = new MutationObserver(read); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-psb-footer-result'] });
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Footer tests timed out')); }, 15000); read();
      })`)
      await mkdir("/tmp/opencode/psb-footer", { recursive: true })
      const bounds = await contents.executeJavaScript(`(() => {
        const nodes=[document.querySelector('[data-projects-sidebar-root]'),document.querySelector('.psb-activity-menu')].filter(Boolean);
        const rects=nodes.map(n=>n.getBoundingClientRect());
        const x=Math.floor(Math.min(...rects.map(r=>r.left))), y=Math.floor(Math.min(...rects.map(r=>r.top)));
        return {x,y,width:Math.ceil(Math.max(...rects.map(r=>r.right))-x),height:Math.ceil(Math.max(...rects.map(r=>r.bottom))-y)};
      })()`)
      await writeFile("/tmp/opencode/psb-footer/footer-detail.png", (await contents.capturePage(bounds, { stayAwake: true })).toPNG())
      await writeFile("/tmp/opencode/psb-footer/footer.png", (await contents.capturePage(undefined, { stayAwake: true })).toPNG())
      if (result.ok) {
        await contents.executeJavaScript(`(() => {
          const host = document.createElement('div');
          host.setAttribute('data-projects-sidebar-root', ''); host.setAttribute('data-psb-plus-fixture', '');
          host.style.cssText = 'position:fixed;top:160px;right:30px;width:260px;background:#333;z-index:99999';
          host.innerHTML = '<details open><summary>Hover project<button class="psb-project-new">+</button></summary><button class="fixture-chat" style="height:40px;width:100%">Selected chat</button></details>';
          const project = host.querySelector('details');
          host.querySelector('.psb-project-new').addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); project.open = true; host.dataset.drafts = String(Number(host.dataset.drafts || 0) + 1); });
          document.body.append(host);
        })()`)
        const inspect = () => contents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
          const host = document.querySelector('[data-psb-plus-fixture]'), plus = host.querySelector('.psb-project-new');
          resolve({ opacity: getComputedStyle(plus).opacity, open: host.querySelector('details').open, drafts: host.dataset.drafts, chatFocused: document.activeElement === host.querySelector('.fixture-chat') });
        })))`)
        const point = (selector: string) => contents.executeJavaScript(`(() => { const r = document.querySelector('[data-psb-plus-fixture] ${selector}').getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`)
        const move = (point: { x: number; y: number }) => contents.sendInputEvent({ type: 'mouseMove', ...point })
        const click = (point: { x: number; y: number }) => {
          move(point)
          contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
          contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
        }
        const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); result.results.push(label) }
        try {
          // Chromium suppresses :focus-visible while the webContents is unfocused.
          // Native keyboard assertions require a focused test window, not just activeElement.
          windows[0].focus()
          contents.focus()
          move(await point('.fixture-chat'))
          check((await inspect()).opacity === '1', 'Hovering a chat reveals its project plus')
          click(await point('.fixture-chat')); await inspect()
          move({ x: 1, y: 1 })
          const away = await inspect()
          check(away.chatFocused && away.opacity === '0', 'Selected chat retains focus but does not keep plus visible after pointer leaves')
          await contents.executeJavaScript(`document.querySelector('[data-psb-plus-fixture] details').open = false`)
          move(await point('summary'))
          check((await inspect()).opacity === '1', 'Hovering a collapsed project reveals its plus')
          click(await point('.psb-project-new'))
          const opened = await inspect()
          check(opened.open && opened.drafts === '1', 'Plus on collapsed heading expands project and invokes exactly one mocked draft action')
          move({ x: 1, y: 1 })
          check((await inspect()).opacity === '0', 'Clicking plus does not leave it visible after mouse leaves')
           await contents.executeJavaScript(`document.querySelector('[data-psb-plus-fixture] summary').focus()`)
          contents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
           contents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
           await inspect()
           const keyboard = await contents.executeJavaScript(`(() => { const plus = document.querySelector('[data-psb-plus-fixture] .psb-project-new'); return { focused: document.activeElement === plus, opacity: getComputedStyle(plus).opacity, focusVisible: plus.matches(':focus-visible'), documentFocused: document.hasFocus(), active: document.activeElement?.outerHTML.slice(0, 250) }; })()`)
           check(keyboard.opacity === '1' && keyboard.focused, 'Direct Tab focus reveals plus without retaining visibility for focused chats: ' + JSON.stringify(keyboard))
        } finally {
          await contents.executeJavaScript(`document.querySelector('[data-psb-plus-fixture]')?.remove()`)
        }
      }
      await writeFile("/tmp/opencode/psb-footer/result.json", JSON.stringify(result, null, 2))
    }
    void run().catch(async (error: unknown) => {
      await mkdir("/tmp/opencode/psb-footer", { recursive: true })
      await writeFile("/tmp/opencode/psb-footer/result.json", JSON.stringify({ ok: false, error: String(error) }))
    })
  },
})
