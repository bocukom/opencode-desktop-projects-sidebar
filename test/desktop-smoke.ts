/** Self-contained: the diagnostic entry serializes this function into the app window. */
export async function runDesktopSmoke() {
  const results: string[] = []
  const check = (value: unknown, name: string) => {
    if (!value) throw new Error(name)
    results.push(name)
    document.documentElement.setAttribute("data-psb-smoke-progress", JSON.stringify(results))
  }
  const wait = (predicate: () => boolean) => new Promise<void>((resolve, reject) => {
    if (predicate()) { resolve(); return }
    const observer = new MutationObserver(() => {
      if (predicate()) { observer.disconnect(); clearTimeout(timeout); resolve() }
    })
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("Desktop DOM wait timed out")) }, 15000)
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  })
  const native = (value: string) => document.querySelector<HTMLInputElement>(`fieldset[data-action="settings-tab-layout"] input[value="${value}"]`)!
  const card = () => document.querySelector<HTMLInputElement>("[data-projects-sidebar-card] input")!
  const root = () => document.querySelector<HTMLElement>("[data-projects-sidebar-root]")
  const inbox = () => document.querySelector<HTMLElement>('#vertical-tabs-sidebar [data-slot="sidebar-inbox"]')

  await wait(() => !!card() && document.documentElement.hasAttribute("data-psb-smoke-ready"))
  await wait(() => !root())
  const initial = ["top", "side", "inbox"].find((value) => native(value).parentElement!.hasAttribute("data-checked"))!
  document.documentElement.setAttribute("data-projects-sidebar-smoke-initial", initial)
  check(!card().disabled, "Card is compatible with installed desktop")
  check(!root(), "Plugin starts inactive")
  check(["top", "side", "inbox"].every((mode) => !!native(mode)), "All three original modes remain")
  native("inbox").click()
  await wait(() => !!inbox() && !root())
  const mount = () => document.querySelector<HTMLElement>('#vertical-tabs-sidebar [data-slot="vertical-tabs-mount"]')!
  const padding = () => {
    const style = getComputedStyle(mount())
    return [style.paddingInlineStart, style.paddingInlineEnd, style.paddingTop, style.paddingBottom]
  }
  const originalPadding = padding()
  const originalWidth = mount().getBoundingClientRect().width
  const sidebar = () => document.querySelector<HTMLElement>('#vertical-tabs-sidebar')!
  const originalSidebarWidth = sidebar().getBoundingClientRect().width
  const originalResize = sidebar().querySelector<HTMLElement>(':scope > [data-component="resize-handle"]')!
  const originalResizeRect = originalResize.getBoundingClientRect()
  const originalPanelContain = getComputedStyle(sidebar().querySelector('[data-slot="vertical-tabs-panel"]')!).contain
  const originalMountContain = getComputedStyle(mount()).contain
  const controls = () => [...mount().querySelectorAll<HTMLElement>('[data-slot="sidebar-header"] button, [data-slot="sidebar-header"] + div button')].map((button) => getComputedStyle(button).padding)
  const originalControls = controls()
  card().click()
  await wait(() => !!root()?.querySelector("[data-psb-session]") && !root()?.querySelector("[data-psb-loading]") && card().checked)
  const compactPadding = padding()
  check(compactPadding[0] === "9px" && compactPadding[1] === "11px", "Open docked sidebar keeps the 9px start gutter and compensates the 6px extension with an 11px end inset")
  check(compactPadding.slice(2).join() === originalPadding.slice(2).join() && sidebar().getBoundingClientRect().width === originalSidebarWidth && mount().getBoundingClientRect().width === originalWidth + 6, "Only the history paint area expands by 6px; native sidebar layout width and vertical padding remain unchanged")
  check(originalControls.length >= 3 && controls().join() === originalControls.join(), "Home, Search and New session keep their internal button padding")
  const mountRect = mount().getBoundingClientRect()
  const rootRect = root()!.getBoundingClientRect()
  check(Math.abs(rootRect.left - mountRect.left - 9) <= 0.5 && Math.abs(mountRect.right - rootRect.right) <= 0.5, "Projects root reaches the sidebar end without crossing its divider")
  check(getComputedStyle(inbox()!).display === "none", "Native Inbox is hidden only after mounting")
  check(getComputedStyle(root()!).display !== "none", "Projects list is visible in actual desktop")
  check(root()!.getBoundingClientRect().width > 100, "Projects list has a usable sidebar width")
  check(!root()!.querySelector(".psb-heading, :scope > small"), "Sidebar has no Projects / Experimental header or badge")
  const history = root()!.querySelector<HTMLElement>("[data-psb-history]")!
  check(root()!.firstElementChild === history && Math.abs(history.getBoundingClientRect().top - root()!.getBoundingClientRect().top) <= 0.5, "History starts at the sidebar top without reserved header space")
  const historyRect = history.getBoundingClientRect()
  const footer = root()!.querySelector<HTMLElement>(".psb-footer")!
  const footerRect = footer.getBoundingClientRect()
  check(Math.abs(historyRect.right - mountRect.right) <= 0.5 && Math.abs(sidebar().getBoundingClientRect().right - footerRect.right - 5) <= 0.5, "Scrollbar extends into the native inter-panel strip while the footer retains its original 5px gutter")
  check(Math.abs(historyRect.right - sidebar().getBoundingClientRect().right - 6) <= 0.5, "Scrollbar reaches 6px beyond the sidebar box, leaving 2px to the visible chat frame")
  const thumbStyle = getComputedStyle(history, "::-webkit-scrollbar-thumb")
  check(thumbStyle.borderInlineEndWidth === "0px" && getComputedStyle(history, "::-webkit-scrollbar").width === "8px", "Visible scrollbar thumb reaches the divider with no end-side gap and keeps its native 8px target")
  const titleWidth = () => root()!.querySelector<HTMLElement>("details[open] .psb-session-title")!.getBoundingClientRect().width
  const edgeTitleWidth = titleWidth()
  let oldHistoryWidth = 0
  try {
    mount().style.setProperty("--psb-history-edge", "0px")
    oldHistoryWidth = history.getBoundingClientRect().width
    check(Math.abs(edgeTitleWidth - titleWidth() - 11) <= 0.5, "History reclaims the original 5px gutter plus 6px of inter-panel space for titles")
    check(Math.abs(footer.getBoundingClientRect().right - footerRect.right) <= 0.5, "Extending history does not move footer controls")
  } finally { mount().style.removeProperty("--psb-history-edge") }
  check(Math.abs(historyRect.width - oldHistoryWidth - 11) <= 0.5 && history.scrollWidth === history.clientWidth, "History expands by 11px beyond its inset content box without horizontal scrolling")
  const resize = document.querySelector<HTMLElement>('#vertical-tabs-sidebar > [data-component="resize-handle"]')!
  const resizeRect = resize.getBoundingClientRect()
  check(!!resize && resizeRect.left >= historyRect.right && resize.contains(document.elementFromPoint(resizeRect.left + resizeRect.width / 2, historyRect.top + 20)), "Native resize handle remains hittable outside the scrollbar and is not covered by history")
  check(resizeRect.width === originalResizeRect.width && resizeRect.left === originalResizeRect.left + 6, "Resize handle keeps its native target size and moves 6px alongside the extended scrollbar")
  const panel = sidebar().querySelector<HTMLElement>('[data-slot="vertical-tabs-panel"]')!
  check(getComputedStyle(panel).overflow === "hidden" && getComputedStyle(panel).contain === originalPanelContain && getComputedStyle(mount()).contain === originalMountContain, "Native paint containment and sidebar clipping are preserved")
  try {
    sidebar().setAttribute("data-peek", "")
    check(mount().getBoundingClientRect().width === originalWidth && padding()[1] === "5px" && resize.getBoundingClientRect().left === originalResizeRect.left, "Peek mode uses native panel width and resize placement without the inter-panel extension")
  } finally { sidebar().removeAttribute("data-peek") }
  const overflowProbe = document.createElement("div")
  overflowProbe.style.height = `${history.clientHeight + 100}px`
  const oldScroll = history.scrollTop
  try {
    history.append(overflowProbe)
    const widthBeforeScroll = titleWidth()
    history.scrollTop = 32
    check(history.scrollTop === 32 && history.scrollHeight > history.clientHeight, "Edge-aligned history retains native vertical scrolling")
    check(titleWidth() === widthBeforeScroll && history.scrollWidth === history.clientWidth, "Scrollbar overflow does not resize titles or introduce horizontal overflow")
  } finally { overflowProbe.remove(); history.scrollTop = oldScroll }
  const groupCount = root()!.querySelectorAll("[data-psb-group]").length
  const sessionCount = root()!.querySelectorAll("[data-psb-session]").length
  check(groupCount > 0 && sessionCount > 0, "Real projects and session history rendered")
  check(!root()!.textContent!.includes("Example project"), "Demo content is not used")
  const identities = [...root()!.querySelectorAll<HTMLElement>("[data-psb-session]")].map((row) => JSON.stringify([row.dataset.psbServer, row.dataset.psbSession]))
  check(new Set(identities).size === sessionCount, "No duplicated sessions across project groups")
  check(!root()!.querySelector(".psb-project-path"), "Project folder paths are not displayed as extra rows")
  check([...root()!.querySelectorAll("summary")].every((summary) => !!summary.getAttribute("title")), "Project paths remain available in hover tooltips")
  check(root()!.querySelectorAll("summary > svg.psb-disclosure").length === groupCount, "Each project has a custom SVG disclosure triangle")
  check(!root()!.querySelector("summary .psb-count"), "Project headers have no numeric counters")
  check(getComputedStyle(root()!.querySelector("summary")!).display === "flex" && getComputedStyle(root()!.querySelector("summary")!).listStyleType === "none", "Custom disclosure layout suppresses the browser marker")
  check(document.querySelectorAll('fieldset[data-action="settings-tab-layout"] input:checked').length === 1, "Exactly one interface radio selected")
  const group = root()!.querySelector("details")!
  const groupKey = group.getAttribute("data-psb-group")!
  const originallyClosed = !group.open
  if (originallyClosed) { group.querySelector("summary")!.click(); await wait(() => !group.hasAttribute("data-psb-collapsed")) }
  check(group.querySelector<HTMLElement>("[data-psb-session]")!.getBoundingClientRect().height >= 28, "Session rows retain a compact, usable height")
  const rootListStyle = getComputedStyle(group.querySelector("ul")!)
  check(rootListStyle.marginInlineStart === "6px" && rootListStyle.paddingInlineStart === "0px", "Root task-list inset is reduced from 14px to 6px without changing project headers")
  group.querySelector("summary")!.click()
  await wait(() => group.hasAttribute("data-psb-collapsed"))
  check(!group.open, "Project group collapses and updates saved state")
  const originalInbox = inbox()
  root()!.querySelector<HTMLButtonElement>("[data-psb-restore]")!.click()
  await wait(() => !root())
  check(inbox() === originalInbox && getComputedStyle(inbox()!).display !== "none", "Restore Inbox reveals the same native element")
  check(padding().join() === originalPadding.join(), "Restoring Inbox restores the original external gutters")
  card().click()
  const savedGroup = () => [...(root()?.querySelectorAll<HTMLDetailsElement>("[data-psb-group]") ?? [])].find((item) => item.getAttribute("data-psb-group") === groupKey)
  await wait(() => !!savedGroup())
  check(!savedGroup()!.open && savedGroup()!.hasAttribute("data-psb-collapsed"), "Collapsed group survives sidebar unmount and remount")
  if (!originallyClosed) {
    savedGroup()!.querySelector("summary")!.click()
    await wait(() => !savedGroup()!.hasAttribute("data-psb-collapsed"))
    check(savedGroup()!.open, "Project group expands")
  }
  native("inbox").click()
  await wait(() => !root())

  for (const mode of ["top", "side", "inbox"]) {
    card().click()
    await wait(() => !!root())
    native(mode).click()
    await wait(() => !root() && native(mode).checked)
    check(!root(), `Projects → ${mode} works`)
    check(!mount() || padding().join() === originalPadding.join(), `Projects → ${mode} restores native sidebar spacing`)
  }
  card().click()
  await wait(() => !!root()?.querySelector("[data-psb-session]") && card().checked)
  check(document.querySelectorAll("[data-projects-sidebar-card]").length === 1 && document.querySelectorAll("[data-projects-sidebar-root]").length === 1, "No duplicate DOM after mode switches")
  check(padding().join() === compactPadding.join(), "Remounting Projects reapplies compact gutters without accumulation")
  const row = root()!.querySelector<HTMLButtonElement>("[data-psb-session]:not(:disabled)")!
  const rowID = row.dataset.psbSession!
  const rowServer = row.dataset.psbServer!
  const rowGroup = row.closest("details")!
  if (!rowGroup.open) { rowGroup.querySelector("summary")!.click(); await wait(() => rowGroup.open) }
  document.documentElement.setAttribute("data-psb-smoke-target", JSON.stringify([rowServer, rowID]))
  row.click()
  await wait(() => [...(root()?.querySelectorAll<HTMLElement>('[data-psb-session][aria-current="page"]') ?? [])].some((item) => item.dataset.psbSession === rowID && item.dataset.psbServer === rowServer))
  check(true, "Clicking a real session opens and highlights that session")
  const actionsRow = row.closest<HTMLElement>(".psb-session-row")!
  check(getComputedStyle(row).backgroundColor === "rgba(0, 0, 0, 0)" && getComputedStyle(actionsRow).backgroundColor !== "rgba(0, 0, 0, 0)", "Selected session uses one shared row background including the activity gutter")
  const menuTrigger = actionsRow.querySelector<HTMLButtonElement>(".psb-actions button")!
  check(!!menuTrigger && !row.contains(menuTrigger), "Session action trigger is a separate accessible button")
  const middle = (element: Element) => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2 }
  check(Math.abs(middle(menuTrigger) - middle(actionsRow)) <= 0.5, "Session action button is vertically centered in its row")
  check(Math.abs(middle(menuTrigger.querySelector("svg")!) - middle(menuTrigger)) <= 0.5, "Menu dots are vertically centered inside the action button")
  const beforeMenu = row.querySelector(".psb-session-title")!.getBoundingClientRect()
  menuTrigger.focus()
  check(getComputedStyle(actionsRow.querySelector(".psb-actions")!).opacity === "1", "Session actions are visible for keyboard focus")
  check(matchMedia("(forced-colors: active)").matches ? getComputedStyle(row).clipPath !== "none" : getComputedStyle(row).maskImage.includes("linear-gradient"), "Keyboard menu reveal fades only the title behind the menu, with a high-contrast clipping fallback")
  const afterMenu = row.querySelector(".psb-session-title")!.getBoundingClientRect()
  check(beforeMenu.left === afterMenu.left && beforeMenu.width === afterMenu.width, "Revealing the overlaid menu does not shift or resize the title")
  check(getComputedStyle(menuTrigger).maskImage === "none" && getComputedStyle(actionsRow.querySelector(".psb-actions")!).zIndex === "1", "Overlaid menu stays unmasked and stacked above the faded title")
  menuTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  const menu = () => [...document.querySelectorAll<HTMLElement>('[role="menu"]')].find((item) => item.getBoundingClientRect().height > 0)
  await wait(() => !!menu())
  check(matchMedia("(forced-colors: active)").matches ? getComputedStyle(row).clipPath !== "none" : getComputedStyle(row).maskImage.includes("linear-gradient"), "Title remains faded while the native menu is open outside the row")
  const menuItems = () => [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  check(JSON.stringify(menuItems().map((item) => item.textContent?.trim())) === JSON.stringify(["Rename", "Fork", "Close", "Delete"]), "Session menu contains Rename, Fork, Close and Delete")
  menuItems()[0].focus()
  menuItems()[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  const editor = () => actionsRow.querySelector<HTMLInputElement>(".psb-rename")
  await wait(() => !!editor())
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  check(document.activeElement === editor(), "Rename starts an inline editor with focus")
  check(editor()!.selectionStart === 0 && editor()!.selectionEnd === 0 && editor()!.scrollLeft === 0, "Native menu Rename starts at the beginning of the title")
  const rowRect = actionsRow.getBoundingClientRect()
  const editorRect = editor()!.getBoundingClientRect()
  check(Math.abs(editorRect.left - rowRect.left) <= 0.5 && Math.abs(editorRect.right - rowRect.right) <= 0.5, "Rename field spans the whole highlighted row from left to right")
  check(getComputedStyle(actionsRow.querySelector(".psb-activity")!).display === "none", "Activity dot is hidden while renaming")
  editor()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  await wait(() => !editor())
  check(true, "Escape cancels inline rename without writing session data")
  check(getComputedStyle(actionsRow).paddingInlineStart === "0px", "Cancelling Rename restores the row without an activity gutter")
  const restoredButton = () => actionsRow.querySelector<HTMLButtonElement>(".psb-session")!
  check(document.activeElement === restoredButton() && getComputedStyle(restoredButton()).outlineStyle === "none", "Cancelling Rename restores keyboard position without a lingering focus ring")
  check(getComputedStyle(actionsRow).outlineStyle === "none", "Cancelling Rename leaves no lingering full-row outline")
  actionsRow.querySelector(".psb-session-title")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  await wait(() => !!editor())
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  check(true, "Double-clicking a session title also starts Rename")
  check(editor()!.selectionStart === 0 && editor()!.selectionEnd === 0 && editor()!.scrollLeft === 0, "Double-click Rename also starts at the beginning of the title")
  editor()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
  await wait(() => !editor())
  actionsRow.querySelector(".psb-session-title")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  await wait(() => !!editor())
  await new Promise<void>((resolve) => queueMicrotask(resolve))
  editor()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  await wait(() => !editor())
  check(document.activeElement === restoredButton() && getComputedStyle(restoredButton()).outlineStyle === "none", "Completing Rename restores keyboard position without a lingering focus ring")
  check(getComputedStyle(actionsRow).outlineStyle === "none", "Completing Rename leaves no lingering full-row outline")
  document.dispatchEvent(new Event("projects-sidebar-smoke-rename"))
  await wait(() => document.documentElement.hasAttribute("data-psb-rename-result"))
  const renameResult = JSON.parse(document.documentElement.getAttribute("data-psb-rename-result")!)
  document.documentElement.removeAttribute("data-psb-rename-result")
  check(renameResult.ok, renameResult.error ?? "Inline rename blur checks passed")
  results.push(...renameResult.results)
  document.dispatchEvent(new Event("projects-sidebar-smoke-activity"))
  await wait(() => document.documentElement.hasAttribute("data-psb-activity-result"))
  const activityResult = JSON.parse(document.documentElement.getAttribute("data-psb-activity-result")!)
  document.documentElement.removeAttribute("data-psb-activity-result")
  check(activityResult.ok, activityResult.error ?? "Session activity checks passed")
  results.push(...activityResult.results)
  document.dispatchEvent(new Event("projects-sidebar-smoke-title-fade"))
  await wait(() => document.documentElement.hasAttribute("data-psb-title-fade-result"))
  const titleFadeResult = JSON.parse(document.documentElement.getAttribute("data-psb-title-fade-result")!)
  document.documentElement.removeAttribute("data-psb-title-fade-result")
  check(titleFadeResult.ok, titleFadeResult.error ?? "Title overflow fade checks passed")
  results.push(...titleFadeResult.results)
  document.dispatchEvent(new Event("projects-sidebar-smoke-removal"))
  await wait(() => document.documentElement.hasAttribute("data-psb-removal-result"))
  const removalResult = JSON.parse(document.documentElement.getAttribute("data-psb-removal-result")!)
  document.documentElement.removeAttribute("data-psb-removal-result")
  check(removalResult.ok, removalResult.error ?? "Removal navigation checks passed")
  results.push(...removalResult.results)
  document.dispatchEvent(new Event("projects-sidebar-smoke-forks"))
  await wait(() => document.documentElement.hasAttribute("data-psb-forks-result"))
  const forksResult = JSON.parse(document.documentElement.getAttribute("data-psb-forks-result")!)
  document.documentElement.removeAttribute("data-psb-forks-result")
  check(forksResult.ok, forksResult.error ?? "Nested fork checks passed")
  results.push(...forksResult.results)
  const deleteTrigger = actionsRow.querySelector<HTMLButtonElement>(".psb-actions button")!
  const previouslyFocused = document.activeElement
  let blurred = false
  const onBlur = () => { blurred = true }
  previouslyFocused?.addEventListener("blur", onBlur)
  deleteTrigger.focus()
  previouslyFocused?.removeEventListener("blur", onBlur)
  // Background Chromium windows may update activeElement without firing native blur.
  if (!blurred && previouslyFocused && previouslyFocused !== deleteTrigger && document.activeElement === deleteTrigger) previouslyFocused.dispatchEvent(new FocusEvent("blur", { relatedTarget: deleteTrigger }))
  check(!restoredButton().hasAttribute("data-psb-quiet-focus"), "Leaving the renamed row restores its normal keyboard focus styling")
  deleteTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
  await wait(() => !!menu())
  const deleteItem = menuItems().find((item) => item.textContent?.trim() === "Delete")!
  deleteItem.focus()
  deleteItem.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
  const confirmation = () => [...document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"]')].find((item) => item.textContent?.includes("Delete session?") && item.getBoundingClientRect().height > 0)
  await wait(() => !!confirmation())
  check(confirmation()!.textContent!.includes(row.title.split("\n")[0]), "Delete confirmation identifies the targeted session")
  const cancel = [...confirmation()!.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Cancel")!
  cancel.click()
  await wait(() => !confirmation() && actionsRow.getAttribute("aria-busy") === "false")
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  check(actionsRow.isConnected && root()!.querySelectorAll("[data-psb-session]").length === sessionCount, "Cancelling Delete preserves the session and its history row")
  const order = () => JSON.stringify([...root()!.querySelectorAll<HTMLElement>("[data-psb-group]")].map((group) => [
    group.getAttribute("data-psb-group"),
    [...group.querySelectorAll<HTMLElement>("[data-psb-session]")].map((item) => item.dataset.psbSession),
  ]))
  const projectOrder = () => JSON.stringify([...root()!.querySelectorAll<HTMLElement>("[data-psb-group]")].map((group) => group.getAttribute("data-psb-group")))
  const initialProjects = projectOrder()
  const timestamps = () => JSON.stringify([...root()!.querySelectorAll<HTMLElement>("[data-psb-session]")].map((item) => [item.dataset.psbServer, item.dataset.psbSession, item.dataset.psbUpdated]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const newestFirst = () => [...root()!.querySelectorAll<HTMLElement>("[data-psb-group]")].every((group) => {
    return [...group.querySelectorAll("ul")].every((list) => {
      const times = [...list.querySelectorAll<HTMLElement>(":scope > li > .psb-session-row > [data-psb-session]")].map((item) => Number(item.dataset.psbUpdated))
      return times.every((time, index) => index === 0 || times[index - 1] >= time)
    })
  })
  check(newestFirst(), "Root chats and sibling forks within every project are newest first")
  const projectNames = [...root()!.querySelectorAll<HTMLElement>(".psb-project-name")].map((item) => item.textContent!)
  const alphabet = new Intl.Collator(["ru", "en"], { numeric: true, sensitivity: "base" })
  check(JSON.stringify(projectNames) === JSON.stringify([...projectNames].sort(alphabet.compare)), "Projects are in alphabetical order")
  const groupRows = [...root()!.querySelectorAll<HTMLElement>("[data-psb-group]")]
    .map((group) => [...group.querySelectorAll<HTMLElement>("[data-psb-session]")].slice(0, 2))
  const targets = groupRows.flat().slice(0, 6).map((item) => [item.dataset.psbServer!, item.dataset.psbSession!])
  document.documentElement.setAttribute("data-psb-smoke-targets", JSON.stringify(targets))
  for (const [server, id] of targets) {
    const beforeNavigation = order()
    const beforeTimestamps = timestamps()
    const button = () => [...(root()?.querySelectorAll<HTMLButtonElement>("[data-psb-session]") ?? [])].find((item) => item.dataset.psbServer === server && item.dataset.psbSession === id)
    const parent = button()!.closest("details")!
    if (!parent.open) { parent.querySelector("summary")!.click(); await wait(() => parent.open) }
    button()!.click()
    await wait(() => button()?.getAttribute("aria-current") === "page" && !root()?.querySelector("[data-psb-loading]"))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    check(projectOrder() === initialProjects, "Projects stay alphabetical during navigation and chat updates")
    check(newestFirst(), "Chat recency ordering is retained after navigation")
    if (timestamps() === beforeTimestamps) check(order() === beforeNavigation, "Selecting a chat without an update does not shuffle rows")
  }
  document.dispatchEvent(new Event("projects-sidebar-smoke-drafts"))
  await wait(() => document.documentElement.hasAttribute("data-psb-drafts-result"))
  const draftsResult = JSON.parse(document.documentElement.getAttribute("data-psb-drafts-result")!)
  document.documentElement.removeAttribute("data-psb-drafts-result")
  check(draftsResult.ok, draftsResult.error ?? "Native project draft checks passed")
  results.push(...draftsResult.results)
  document.dispatchEvent(new Event("projects-sidebar-smoke-settings"))
  await wait(() => !!card() && card().getBoundingClientRect().width > 0)
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await Promise.allSettled([...document.querySelector('fieldset[data-action="settings-tab-layout"]')!.getAnimations({ subtree: true })].map((animation) => animation.finished))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  check(!!root() && root()!.getBoundingClientRect().height > 100, "Projects remains mounted after browser paint")
  check(card().getBoundingClientRect().width > 0, "Projects card is in the visible Preferences surface")
  check(card().checked && card().parentElement!.hasAttribute("data-checked"), "Projects stays selected after transitions")
  return {
    results, initial, groupCount, sessionCount, viewport: { width: innerWidth, height: innerHeight },
    gutters: { original: originalPadding, compact: compactPadding },
    radios: [...document.querySelectorAll<HTMLInputElement>('fieldset[data-action="settings-tab-layout"] input')].map((input) => ({ value: input.value, checked: input.checked, marked: input.parentElement!.hasAttribute("data-checked") })),
  }
}

export async function finishDesktopSmoke(initial: string) {
  document.dispatchEvent(new Event("projects-sidebar-smoke-settings"))
  const selector = `fieldset[data-action="settings-tab-layout"] input[value="${initial}"]`
  if (!document.querySelector(selector)) await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return
      observer.disconnect(); clearTimeout(timeout); resolve()
    })
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("Settings cleanup timed out")) }, 15000)
    observer.observe(document.documentElement, { childList: true, subtree: true })
  })
  const root = document.querySelector<HTMLElement>("[data-projects-sidebar-root]")
  root?.querySelector<HTMLButtonElement>("[data-psb-restore]")?.click()
  await Promise.resolve()
  document.dispatchEvent(new Event("projects-sidebar-smoke-dispose"))
  const native = document.querySelector<HTMLInputElement>(selector)!
  native.click()
  await Promise.resolve()
  document.documentElement.removeAttribute("data-projects-sidebar-smoke-initial")
  document.documentElement.removeAttribute("data-psb-smoke-progress")
  document.documentElement.removeAttribute("data-psb-layout-inspect")
  document.querySelector("[data-psb-overlay-probe]")?.removeAttribute("data-psb-overlay-probe")
  const result = {
    pluginRootRemoved: !document.querySelector("[data-projects-sidebar-root]"),
    cardRemoved: !document.querySelector("[data-projects-sidebar-card]"),
    markersRemoved: !document.querySelector("[data-projects-sidebar-covered], [data-projects-sidebar-selected]"),
    nativeRadioRestored: native.checked,
    nativeInboxVisible: initial !== "inbox" || getComputedStyle(document.querySelector('[data-slot="sidebar-inbox"]')!).display !== "none",
    nativeGuttersRestored: !document.querySelector('#vertical-tabs-sidebar [data-slot="vertical-tabs-mount"]') || (() => {
      const style = getComputedStyle(document.querySelector('#vertical-tabs-sidebar [data-slot="vertical-tabs-mount"]')!)
      return style.paddingInlineStart === "18px" && style.paddingInlineEnd === "10px"
    })(),
    nativePanelGeometryRestored: !document.querySelector('#vertical-tabs-sidebar [data-slot="vertical-tabs-panel"]') || (() => {
      const panel = document.querySelector('#vertical-tabs-sidebar [data-slot="vertical-tabs-panel"]')!
      const handle = document.querySelector('#vertical-tabs-sidebar > [data-component="resize-handle"]')
      return getComputedStyle(panel).insetInlineEnd === "0px" && (!handle || getComputedStyle(handle).insetInlineEnd === "-4px")
    })(),
  }
  document.dispatchEvent(new Event("projects-sidebar-smoke-restore"))
  return result
}
