import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { render } from "solid-js/web"
import type { Context } from "@opencode/plugin/gui"
import { createSessionActivity } from "../src/activity-source.ts"
import { SessionRow } from "../src/session-row.tsx"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"
import { ProjectActivity } from "../src/project-activity.tsx"

/** Real adapter and row with fake server events. Never prompts or writes a user's session. */
export async function runActivitySmoke(ctx: Pick<Context, "ui">) {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
  const host = document.createElement("div")
  host.setAttribute("data-projects-sidebar-root", "")
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:240px"
  const content = document.createElement("div")
  const project = document.createElement("div")
  host.append(project, content); document.body.append(host)
  const previous = document.activeElement as HTMLElement | null
  const listeners = new Map<string, Set<(event: { created: number; data: { sessionID: string; idle?: number } }) => void>>()
  const emit = (type: string, created: number, idle?: number) => listeners.get(type)?.forEach((fn) => fn({ created, data: { sessionID: "mock", idle } }))
  const info = session("mock", "/mock", { title: "Activity example" })
  const [selected, select] = createSignal(false)
  const [connected, connect] = createSignal(true)
  const [collapsed, collapse] = createSignal(true)
  const [otherReady, setOtherReady] = createSignal(false)
  const [requests, setRequests] = createStore<{
    permissions: Record<string, string[]>
    forms: Record<string, { metadata: { kind: string } }[]>
  }>({ permissions: {}, forms: {} })
  const server = {
    id: "mock-server", compatible: true, get connected() { return connected() }, client: {},
    data: {
      session: {
        get: () => info, status: () => "idle", family: () => ["mock", "subagent"],
        permission: { list: (id: string) => requests.permissions[id] },
        form: { list: (id: string) => requests.forms[id] },
      },
      on(type: string, fn: (event: { created: number; data: { sessionID: string; idle?: number } }) => void) {
        const set = listeners.get(type) ?? new Set(); set.add(fn); listeners.set(type, set)
        return () => { set.delete(fn) }
      },
    },
  }
  const source = {
    servers: { list: () => [server.id], get: () => server },
    sessions: { current: () => selected() ? { id: info.id, server } : undefined },
  } as unknown as Pick<Context, "servers" | "sessions">
  let stop!: () => void
  let activity!: ReturnType<typeof createSessionActivity>
  let unmount: (() => void) | undefined
  let unmountProject!: () => void
  const unmountRow = () => { unmount?.(); unmount = undefined }
  let mount!: () => void
  createRoot((dispose) => {
    stop = dispose
    activity = createSessionActivity(source)
    const waiting = () => {
      const value = activity.status(server.id, info, selected())
      return value === 'approval' || value === 'input' ? value : undefined
    }
    unmountProject = render(() => <summary><span class="psb-project-name">Project example</span><ProjectActivity collapsed={collapsed()} waiting={waiting()}
      ready={otherReady() || activity.summaryStatus(server.id, info, selected()) === "ready"} label={waiting() ? copy('en')[waiting()!] : copy("en").ready} /></summary>, project)
    mount = () => {
      unmount = render(() => <SessionRow ctx={{ ui: ctx.ui, tabs: { list: () => [], open: () => select(true), close() {}, move() {}, focus() {} } }}
        server={server.id} session={info} selected={selected()} connected={connected()} text={copy("en")}
        activity={activity.status(server.id, info, selected())}
        actions={{ rename: async () => false, fork: async () => false, close: async () => false, remove: async () => false, dispose() {} }} />, content)
    }
    mount()
  })
  const row = () => content.querySelector<HTMLElement>(".psb-session-row")!
  const dot = () => row().querySelector<HTMLElement>(".psb-activity")
  const grid = () => row().querySelector<SVGSVGElement>(".psb-working-indicator")
  const neutral = () => !row().dataset.psbActivity && !!dot() && !grid() && getComputedStyle(dot()!).display === "none"
  const title = () => row().querySelector<HTMLElement>(".psb-session-title")!
  try {
    await settle()
    check(neutral(), "Idle history has no visible dot")
    check(!project.querySelector('.psb-project-activity'), "Collapsed idle project has no activity marker")
    check(dot()!.getAttribute("aria-hidden") === "true" && !dot()!.hasAttribute("aria-label"), "Neutral dots are decorative, not unread or success announcements")
    const idleTitleRect = title().getBoundingClientRect()
    check(idleTitleRect.left - row().getBoundingClientRect().left === 8, "Idle title has a compact inset without an activity gutter")
    emit("session.execution.started", 10); await settle()
    check(row().dataset.psbActivity === "running" && !!grid(), "Execution start immediately shows the Soft Radar working grid")
    check(grid()!.getAttribute("viewBox") === "0 0 16 16" && grid()!.querySelectorAll("rect").length === 25, "Working indicator uses the native 5×5 dot geometry")
    check(getComputedStyle(dot()!).backgroundColor === "rgba(0, 0, 0, 0)", "Working grid has no colored background")
    check(dot()!.getBoundingClientRect().right <= row().getBoundingClientRect().right, "Working indicator overlays the trailing edge")
    const rowRect = row().getBoundingClientRect()
    const dotRect = dot()!.getBoundingClientRect()
    check(dotRect.width === 16 && dotRect.height === 16 && Math.abs(dotRect.top + 8 - rowRect.top - 14) <= 0.5, "Working grid is 16px and keeps the original marker's vertical center")
    const muted = document.createElement("span")
    muted.style.color = "var(--v2-text-text-muted)"; host.append(muted)
    check(getComputedStyle(dot()!).color === getComputedStyle(muted).color, "Working grid uses the native muted text color instead of blue")
    muted.remove()
    const menuRect = row().querySelector(".psb-actions button")!.getBoundingClientRect()
    const titleRect = title().getBoundingClientRect()
    check(rowRect.right - dotRect.right === 4, "Working grid is centered in the overlaid menu target")
    check(titleRect.left === idleTitleRect.left && titleRect.width === idleTitleRect.width, "Changing dot to working grid never shifts or resizes the title")
    check(titleRect.left - rowRect.left === 8 && rowRect.right - titleRect.right === 2, "Title keeps a compact inset without an activity gutter")
    check(menuRect.width === 24 && menuRect.height === 24 && rowRect.right === menuRect.right && titleRect.right - menuRect.left === 22, "Menu keeps its 24px target over the title instead of beside it")
    check(dot()!.getAttribute("aria-label") === "In progress", "Working state has an accessible text label")
    check(grid()!.getAttribute("aria-hidden") === "true" && grid()!.getAttribute("tabindex") === "-1", "Grid is decorative inside the labeled marker and adds no keyboard stop")
    host.dir = "rtl"
    const rtlRow = row().getBoundingClientRect(), rtlGrid = grid()!.getBoundingClientRect()
    check(Math.abs(rtlGrid.left - rtlRow.left - 4) <= 0.5, "Working grid moves to the trailing left edge in RTL")
    const menuButton = row().querySelector<HTMLButtonElement>(".psb-actions button")!
    menuButton.focus()
    check(matchMedia("(forced-colors: active)").matches
      ? getComputedStyle(title().closest("button")!).clipPath === "inset(0px 0px 0px 24px)"
      : getComputedStyle(title().closest("button")!).maskImage.includes("to left"), "Keyboard overlay fade mirrors to the trailing edge in RTL")
    check(matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)").matches
      ? getComputedStyle(title()).animationName === "none"
      : getComputedStyle(title()).animationName === "psb-working-wave", "Overlaid menu fade preserves the working title's independent wave")
    menuButton.blur()
    host.removeAttribute("dir")
    const previousMotion = document.documentElement.getAttribute("data-motion")
    try {
      document.documentElement.setAttribute("data-motion", "reduce")
      check([...grid()!.querySelectorAll("rect")].every((rect) => getComputedStyle(rect).animationName === "none" && Number(getComputedStyle(rect).opacity) >= 0.2), "Reduced-motion preference freezes a readable radar, not an empty grid")
    } finally {
      if (previousMotion === null) document.documentElement.removeAttribute("data-motion")
      else document.documentElement.setAttribute("data-motion", previousMotion)
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce), (forced-colors: active)").matches
    const gridReduced = reduced || document.documentElement.getAttribute("data-motion") === "reduce"
    const rects = [...grid()!.querySelectorAll("rect")]
    check(rects.filter((rect) => getComputedStyle(rect).animationName !== "none").length === (gridReduced ? 0 : 24), "Radar animates exactly 24 dots and keeps its center steady, respecting accessibility modes")
    if (!gridReduced) {
      const animated = rects.find((rect) => rect.getAnimations().length)!
      const animation = animated.getAnimations()[0]!
      check(animation.effect?.getTiming().duration === 1800, "Radar uses the host's 1.8-second loop")
      animation.pause(); animation.currentTime = 0
      const start = getComputedStyle(animated).opacity
      animation.currentTime = 900
      check(start !== getComputedStyle(animated).opacity, "Radar dots change opacity over the native sweep")
      animation.play()
    }
    check(reduced ? getComputedStyle(title()).animationName === "none" : getComputedStyle(title()).animationName === "psb-working-wave", "Working title uses the soft wave and respects reduced motion")
    check(getComputedStyle(title()).backgroundImage === "none" && getComputedStyle(title()).color === getComputedStyle(title().parentElement!).color,
      "Working title retains its normal text color without a colored background")
    check(reduced ? getComputedStyle(title()).maskImage === "none" : getComputedStyle(title()).maskImage.includes("0.6"),
      "Opacity wave stays readable and accessibility modes remove the mask")
    if (!reduced) {
      const animation = title().getAnimations()[0]!
      animation.pause(); animation.currentTime = 0
      const start = getComputedStyle(title()).maskPosition
      animation.currentTime = 1400
      check(start !== getComputedStyle(title()).maskPosition, "Opacity highlight travels across the text instead of blinking the whole title")
      animation.play()
    }
    const height = row().getBoundingClientRect().height
    setRequests("permissions", "mock", ["permission-1", "permission-2"]); await settle()
    check(row().dataset.psbActivity === "approval" && !grid() && getComputedStyle(dot()!).backgroundColor === "rgb(239, 100, 100)", "Pending permission replaces the working grid with the unchanged red dot")
    check(activity.summaryStatus(server.id, info, false) === "running", "Footer still counts a running session while its row shows a permission warning")
    check(project.querySelector<HTMLElement>('.psb-project-activity')?.dataset.psbWaiting === 'approval' && getComputedStyle(project.querySelector('.psb-project-activity')!).backgroundColor === 'rgb(239, 100, 100)', "Pending approval marks a collapsed project red, not ready-yellow")
    check(project.querySelector('.psb-project-activity')?.getAttribute('aria-label') === copy('en').approval, "Project marker explains that permission approval is required")
    setOtherReady(true); await settle()
    check(getComputedStyle(project.querySelector('.psb-project-activity')!).backgroundColor === 'rgb(239, 100, 100)', "Pending approval takes red priority over another unread completion in the project")
    collapse(false); await settle()
    check(!project.querySelector('.psb-project-activity'), "Expanded projects do not duplicate pending-request markers in their headings")
    collapse(true); setOtherReady(false); await settle()
    check(dot()!.getAttribute("aria-label") === "Waiting for permission approval" && row().querySelector(".psb-session")!.getAttribute("title")!.includes("Waiting for permission approval"), "Approval has a distinct accessible label and hover explanation")
    check(getComputedStyle(title()).animationName === "none" && getComputedStyle(title()).maskImage === "none", "Waiting for approval stops the working-title wave")
    row().querySelector<HTMLButtonElement>(".psb-session")!.click(); await settle()
    check(row().dataset.psbActivity === "approval", "Opening a chat does not clear its pending permission")
    setRequests("permissions", "mock", ["permission-2"]); await settle()
    check(row().dataset.psbActivity === "approval", "Answering one of multiple permissions keeps red until all are resolved")
    setRequests("forms", "mock", [{ metadata: { kind: "question" } }]); setRequests("permissions", "mock", []); await settle()
    check(row().dataset.psbActivity === "input" && dot()!.getAttribute("aria-label") === "Waiting for your answer" && getComputedStyle(dot()!).backgroundColor === "rgb(239, 100, 100)", "A pending question stays red but has a different explanation from permission approval")
    check(project.querySelector('.psb-project-activity')?.getAttribute('aria-label') === copy('en').input, "Project marker distinguishes a pending answer from permission approval")
    setRequests("forms", "mock", []); await settle()
    check(row().dataset.psbActivity === "running" && !!grid(), "Answering the last question restores the grid while execution is still running")
    select(false)
    setRequests("permissions", "subagent", ["child-permission"]); await settle()
    check(row().dataset.psbActivity === "approval", "A hidden subagent's pending approval marks its visible root red")
    setRequests("permissions", "subagent", []); await settle()
    check(row().getBoundingClientRect().height === height, "Red waiting states preserve compact row geometry")
    emit("session.execution.succeeded", 20); await settle()
    check(row().dataset.psbActivity === "ready" && !grid() && getComputedStyle(dot()!).backgroundColor === "rgb(245, 186, 68)" && dot()!.getBoundingClientRect().width === 6, "Successful unseen completion replaces the grid with the unchanged 6px yellow dot")
    check(activity.summaryStatus(server.id, info, false) === "ready", "Unread completion is included in the footer")
    const projectDot = project.querySelector<HTMLElement>('.psb-project-activity')!
    check(!!projectDot && projectDot.getAttribute('aria-label') === copy('en').ready && projectDot.title === copy('en').ready && !projectDot.hasAttribute('tabindex'), "Collapsed project exposes unread completion with a labeled nonfocusable marker")
    check(getComputedStyle(projectDot).width === '6px' && getComputedStyle(projectDot).height === '6px' && getComputedStyle(projectDot).backgroundColor === 'rgb(245, 186, 68)', "Project readiness uses the same compact yellow dot as unread sessions")
    collapse(false); await settle()
    check(!project.querySelector('.psb-project-activity') && row().dataset.psbActivity === 'ready', "Expanding a project hides only its summary marker, not the unread session state")
    collapse(true); await settle()
    check(!!project.querySelector('.psb-project-activity'), "Collapsing a project restores its unread summary marker")
    check(getComputedStyle(title()).animationName === "none", "Completed title stops animating")
    row().querySelector<HTMLButtonElement>(".psb-session")!.click(); await settle()
    check(neutral(), "Opening the completed chat replaces yellow with a gray dot")
    check(activity.summaryStatus(server.id, info, true) === undefined, "Opening a completed session removes it from the footer count")
    check(!project.querySelector('.psb-project-activity'), "Reading the completion clears the collapsed project's marker")
    check(getComputedStyle(title()).maskImage === "none", "Viewed idle titles have no opacity mask")
    select(false); await settle()
    check(neutral(), "Gray dot stays gray after navigating away with stale cached metadata")
    emit("session.execution.started", 30); await settle()
    check(row().getBoundingClientRect().height === height, "Activity changes do not change compact row height")
    connect(false); await settle()
    check(neutral() && [...listeners.values()].every((set) => set.size === 0), "Disconnect removes the working grid, restores gray and detaches event listeners")
    check(!project.querySelector('.psb-project-activity'), "Disconnected project does not advertise readiness")
    connect(true); await settle()
    check([...listeners.values()].every((set) => set.size === 1), "Reconnect attaches exactly one listener per event")
    emit("session.execution.failed", 40); await settle()
    check(neutral(), "Failed execution remains neutral and is not mislabeled as ready")
    emit("session.execution.started", 50); emit("session.execution.interrupted", 60); await settle()
    check(neutral(), "Interrupted execution remains neutral and is not mislabeled as ready")
    unmountRow()
    emit("session.execution.started", 70); emit("session.execution.succeeded", 80); await settle()
    mount(); await settle()
    check(row().dataset.psbActivity === "ready", "Completion is tracked while the sidebar is unmounted")
    emit("session.viewed", 90, 80); await settle()
    check(neutral(), "Native viewed event replaces yellow with gray for a completion read elsewhere")
    select(true); emit("session.execution.started", 100); await settle()
    check(row().dataset.psbActivity === "running", "The active chat still shows that it is working")
    emit("session.execution.succeeded", 110); await settle(); select(false); await settle()
    check(neutral(), "Completion while viewing the chat leaves a gray dot, not an unread mark")
    setRequests("forms", "mock", [{ metadata: { kind: "mcp-elicitation" } }]); await settle()
    check(row().dataset.psbActivity === "input", "A native MCP elicitation also requires the user's answer")
    check(activity.summaryStatus(server.id, info, false) === "running", "Pending answer stays in In progress even after execution has ended")
    connect(false); await settle()
    check(neutral(), "Disconnect suppresses a cached red waiting marker")
    check(activity.summaryStatus(server.id, info, false) === undefined, "Disconnected cached requests do not create activity counts")
    connect(true); await settle()
    check(row().dataset.psbActivity === "input", "Reconnect reads already-pending native requests without waiting for a new event")
    unmountRow(); mount(); await settle()
    check(row().dataset.psbActivity === "input", "Pending request stays red across sidebar unmount and remount")
    setRequests("forms", "mock", []); await settle()
    check(neutral(), "Cancelling the final native form clears red without inventing a completion")
    setRequests("permissions", "subagent", ["idle-approval"]); await settle()
    check(activity.summaryStatus(server.id, info, false) === "running", "A hidden subagent's approval belongs to In progress even while its visible root is idle")
    check(project.querySelector<HTMLElement>('.psb-project-activity')?.dataset.psbWaiting === 'approval', "Collapsed project exposes a hidden subagent's pending approval")
    setRequests("permissions", "subagent", []); await settle()
    check(activity.summaryStatus(server.id, info, false) === undefined, "Resolving the last idle approval removes its activity entry")
    stop()
    check([...listeners.values()].every((set) => set.size === 0), "Activity source releases all subscriptions on cleanup")
    return results
  } finally { unmount?.(); unmountProject(); stop(); host.remove(); previous?.focus({ preventScroll: true }) }
}
