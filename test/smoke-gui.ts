import { mkdir, writeFile } from "node:fs/promises"
import { Plugin } from "@opencode/plugin/gui"
import { createEffect } from "solid-js"
import base from "../src/gui.tsx"
import { finishDesktopSmoke, runDesktopSmoke } from "./desktop-smoke.ts"
import { runRenameSmoke } from "./rename-smoke.tsx"
import { runActivitySmoke } from "./activity-smoke.tsx"
import { runRemovalSmoke } from "./removal-smoke.ts"
import { runDraftsSmoke } from "./drafts-smoke.ts"
import { runForksSmoke } from "./forks-smoke.tsx"
import { probeOverlayHover } from "./overlay-hover-smoke.ts"
import { runTitleFadeSmoke } from "./title-fade-smoke.tsx"
import { prepareScrollbarProbe, finishScrollbarProbe, readResizeProbe } from "./scrollbar-edge-smoke.ts"

/** Diagnostic-only entry. Never used by a normal `npm run build`. No debug port or server. */
export default Plugin.define({
  ...base,
  setup(ctx) {
    const cleanup = base.setup?.(ctx)
    const dispose = () => { void cleanup?.() }
    let snapshot: { enabled: boolean; collapsed: string[]; active?: string; tabs: string[] } | undefined
    createEffect(() => {
      if (snapshot || !ctx.stores.preferences.ready()) return
      snapshot = {
        enabled: ctx.stores.preferences.value.enabled,
        collapsed: [...(ctx.stores.preferences.value.collapsed ?? [])],
        active: ctx.tabs.list().find((tab) => tab.active)?.key,
        tabs: ctx.tabs.list().map((tab) => tab.key),
      }
      ctx.stores.preferences.update((draft) => { draft.enabled = false })
      document.documentElement.setAttribute("data-psb-smoke-ready", "")
      ctx.layout.settings("general")
    })
    const settings = () => ctx.layout.settings("general")
    const rename = () => { void runRenameSmoke(ctx).then(
      (results) => document.documentElement.setAttribute("data-psb-rename-result", JSON.stringify({ ok: true, results })),
      (error: unknown) => document.documentElement.setAttribute("data-psb-rename-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Rename check failed" })),
    ) }
    const activity = () => { void runActivitySmoke(ctx).then(
      (results) => document.documentElement.setAttribute("data-psb-activity-result", JSON.stringify({ ok: true, results })),
      (error: unknown) => document.documentElement.setAttribute("data-psb-activity-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Activity check failed" })),
    ) }
    const titleFade = () => { void runTitleFadeSmoke(ctx).then(
      (results) => document.documentElement.setAttribute("data-psb-title-fade-result", JSON.stringify({ ok: true, results })),
      (error: unknown) => document.documentElement.setAttribute("data-psb-title-fade-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Title fade check failed" })),
    ) }
    const removal = () => {
      try { document.documentElement.setAttribute("data-psb-removal-result", JSON.stringify({ ok: true, results: runRemovalSmoke() })) }
      catch (error) { document.documentElement.setAttribute("data-psb-removal-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Removal navigation check failed" })) }
    }
    const drafts = () => { void runDraftsSmoke(ctx, () => ctx.stores.drafts.value.links).then(
      (results) => document.documentElement.setAttribute("data-psb-drafts-result", JSON.stringify({ ok: true, results })),
      (error: unknown) => document.documentElement.setAttribute("data-psb-drafts-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Native draft check failed" })),
    ) }
    const forks = () => { void runForksSmoke(ctx).then(
      (results) => document.documentElement.setAttribute("data-psb-forks-result", JSON.stringify({ ok: true, results })),
      (error: unknown) => document.documentElement.setAttribute("data-psb-forks-result", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Fork tree check failed" })),
    ) }
    const restore = () => {
      if (!snapshot) return
      const target = document.documentElement.getAttribute("data-psb-smoke-target")
      const targets: string[][] = JSON.parse(document.documentElement.getAttribute("data-psb-smoke-targets") ?? "[]")
      for (const tab of ctx.tabs.list()) {
        if (!tab.session || snapshot.tabs.includes(tab.key)) continue
        const identity = JSON.stringify([tab.session.server.id, tab.session.id])
        if (identity === target || targets.some((item) => JSON.stringify(item) === identity)) ctx.tabs.close(tab.key)
      }
      if (snapshot.active) ctx.tabs.focus(snapshot.active)
      ctx.stores.preferences.set({ enabled: snapshot.enabled, collapsed: snapshot.collapsed })
      document.documentElement.removeAttribute("data-psb-smoke-ready")
      document.documentElement.removeAttribute("data-psb-smoke-target")
      document.documentElement.removeAttribute("data-psb-smoke-targets")
    }
    document.addEventListener("projects-sidebar-smoke-dispose", dispose, { once: true })
    document.addEventListener("projects-sidebar-smoke-settings", settings)
    document.addEventListener("projects-sidebar-smoke-rename", rename)
    document.addEventListener("projects-sidebar-smoke-activity", activity)
    document.addEventListener("projects-sidebar-smoke-title-fade", titleFade)
    document.addEventListener("projects-sidebar-smoke-removal", removal)
    document.addEventListener("projects-sidebar-smoke-drafts", drafts)
    document.addEventListener("projects-sidebar-smoke-forks", forks)
    document.addEventListener("projects-sidebar-smoke-restore", restore, { once: true })
    return () => {
      document.removeEventListener("projects-sidebar-smoke-dispose", dispose)
      document.removeEventListener("projects-sidebar-smoke-settings", settings)
      document.removeEventListener("projects-sidebar-smoke-rename", rename)
      document.removeEventListener("projects-sidebar-smoke-activity", activity)
      document.removeEventListener("projects-sidebar-smoke-title-fade", titleFade)
      document.removeEventListener("projects-sidebar-smoke-removal", removal)
      document.removeEventListener("projects-sidebar-smoke-drafts", drafts)
      document.removeEventListener("projects-sidebar-smoke-forks", forks)
      document.removeEventListener("projects-sidebar-smoke-restore", restore)
      dispose()
    }
  },
  main(ctx) {
    let stopped = false
    const directory = "/tmp/opencode/projects-sidebar-activity"
    const run = async () => {
      await mkdir(directory, { recursive: true })
      const windows = ctx.windows.list()
      if (windows.length !== 1) throw new Error("Smoke test requires exactly one OpenCode window")
      const contents = windows[0].webContents
      let result
      let cleanup
      try {
        // DOM-dispatched keys do not set Chromium's input modality. Establish real keyboard modality
        // without activating a command, so :focus-visible checks do not depend on the user's last click.
        contents.sendInputEvent({ type: "keyDown", keyCode: "Shift" })
        contents.sendInputEvent({ type: "keyUp", keyCode: "Shift" })
        result = await contents.executeJavaScript(`(${runDesktopSmoke.toString()})()`)
        const away = await contents.executeJavaScript('({ x: innerWidth - 2, y: innerHeight - 2 })')
        contents.sendInputEvent({ type: "mouseMove", ...away })
        const baseline = await contents.executeJavaScript(`(${probeOverlayHover.toString()})("prepare")`)
        contents.sendInputEvent({ type: "mouseMove", x: baseline.x, y: baseline.y })
        const hovered = await contents.executeJavaScript(`(${probeOverlayHover.toString()})("hover", ${JSON.stringify({ left: baseline.left, width: baseline.width })})`)
        // Let the compositor catch up after style inspection, including when the app is behind another window.
        await contents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        await writeFile(`${directory}/desktop-menu-overlay.png`, (await contents.capturePage(undefined, { stayAwake: true })).toPNG())
        await contents.executeJavaScript(`(${probeOverlayHover.toString()})("hover", ${JSON.stringify({ left: baseline.left, width: baseline.width })})`)
        contents.sendInputEvent({ type: "mouseMove", ...away })
        const rested = await contents.executeJavaScript(`(${probeOverlayHover.toString()})("rest", ${JSON.stringify({ left: baseline.left, width: baseline.width })})`)
        result.results.push(...baseline.results, ...hovered.results, ...rested.results)
        const resizeStart = await contents.executeJavaScript(`(${readResizeProbe.toString()})()`)
        const drag = async (from: { x: number; y: number }, delta: number) => {
          contents.sendInputEvent({ type: "mouseMove", x: Math.round(from.x), y: Math.round(from.y) })
          contents.sendInputEvent({ type: "mouseDown", x: Math.round(from.x), y: Math.round(from.y), button: "left", clickCount: 1 })
          contents.sendInputEvent({ type: "mouseMove", x: Math.round(from.x + delta), y: Math.round(from.y), button: "left" })
          contents.sendInputEvent({ type: "mouseUp", x: Math.round(from.x + delta), y: Math.round(from.y), button: "left", clickCount: 1 })
          await contents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        }
        try {
          const delta = resizeStart.width < 620 ? 16 : -16
          await drag(resizeStart, delta)
          const resized = await contents.executeJavaScript(`(${readResizeProbe.toString()})()`)
          if (Math.abs(resized.width - resizeStart.width - delta) > 1) throw new Error("Native sidebar resize drag did not change width by the expected amount")
          result.results.push("Trusted pointer drag on the relocated native resize handle changes sidebar width correctly")
        } finally {
          const current = await contents.executeJavaScript(`(${readResizeProbe.toString()})()`)
          if (Math.abs(current.width - resizeStart.width) > 0.5) await drag(current, resizeStart.width - current.width)
          const restored = await contents.executeJavaScript(`(${readResizeProbe.toString()})()`)
          if (Math.abs(restored.width - resizeStart.width) > 0.5) throw new Error("Native sidebar resize diagnostic did not restore the original width")
          contents.sendInputEvent({ type: "mouseMove", ...away })
        }
        result.results.push("Native resize diagnostic restores the user's original sidebar width")
        const expected = await ctx.client.session.list({ limit: 100, order: "desc", parentID: null, archived: false })
        result.localRootSessions = expected.data.length
        if (stopped) return
        const image = await contents.capturePage()
        await writeFile(`${directory}/desktop-projects-final.png`, image.toPNG())
        try {
          const edge = await contents.executeJavaScript(`(${prepareScrollbarProbe.toString()})()`)
          contents.sendInputEvent({ type: "mouseMove", x: edge.x, y: edge.y })
          await contents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
          await writeFile(`${directory}/desktop-scrollbar-edge.png`, (await contents.capturePage(undefined, { stayAwake: true })).toPNG())
          await writeFile(`${directory}/desktop-scrollbar-edge.json`, JSON.stringify(edge, null, 2))
        } finally {
          await contents.executeJavaScript(`(${finishScrollbarProbe.toString()})()`)
          contents.sendInputEvent({ type: "mouseMove", ...away })
        }
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "Diagnostic failed", progress: await contents.executeJavaScript('document.documentElement.getAttribute("data-psb-smoke-progress")') }
        const image = await contents.capturePage()
        await writeFile(`${directory}/desktop-failure.png`, image.toPNG())
      } finally {
        await contents.executeJavaScript(`(${finishScrollbarProbe.toString()})()`)
        const initial = result?.initial ?? await contents.executeJavaScript('document.documentElement.getAttribute("data-projects-sidebar-smoke-initial")')
        if (initial) cleanup = await contents.executeJavaScript(`(${finishDesktopSmoke.toString()})(${JSON.stringify(initial)})`)
      }
      await writeFile(`${directory}/desktop-smoke-final.json`, JSON.stringify({ ok: !result?.error && !!cleanup && Object.values(cleanup).every(Boolean), ...result, cleanup }, null, 2))
      ctx.log.write("info", "Projects sidebar diagnostic complete")
    }
    // Returning immediately lets the host deliver the window GUI before we await its DOM.
    void run().catch(async (error: unknown) => {
      await mkdir(directory, { recursive: true })
      await writeFile(`${directory}/desktop-smoke-final.json`, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Diagnostic failed" }))
    })
    return () => { stopped = true }
  },
})
