import { mkdir, writeFile } from "node:fs/promises"
import { Plugin } from "@opencode/plugin/gui"
import { createEffect } from "solid-js"
import base from "../src/gui.tsx"
import { runNativeWidthSmoke } from "./sidebar-width-gui.ts"

/** Live mount probe. Optional VITE_PSB_RESTORE=1 restores Projects in an existing Inbox.
 * Never opens sessions or changes the host's native interface mode. */
export default Plugin.define({
  ...base,
  setup(ctx) {
    const cleanup = base.setup?.(ctx)
    const probeWindow = window as typeof window & { __psbWidthProbe?: () => Promise<unknown> }
    if (import.meta.env.VITE_PSB_WIDTH_PROBE === "1") probeWindow.__psbWidthProbe = () => runNativeWidthSmoke({
      get: () => ctx.stores.preferences.value.sidebarWidth,
      set: (width) => ctx.stores.preferences.update((draft) => { draft.sidebarWidth = width }),
    })
    let restored = false
    createEffect(() => {
      if (!ctx.stores.preferences.ready()) return
      if (import.meta.env.VITE_PSB_RESTORE === "1" && !restored && document.querySelector('#vertical-tabs-sidebar [data-slot="sidebar-inbox"]')) {
        restored = true
        ctx.stores.preferences.update((draft) => { draft.enabled = true })
      }
      document.documentElement.setAttribute("data-psb-compatibility-enabled", String(ctx.stores.preferences.value.enabled))
    })
    return () => { delete probeWindow.__psbWidthProbe; void cleanup?.(); document.documentElement.removeAttribute("data-psb-compatibility-enabled") }
  },
  main(ctx) {
    const run = async () => {
      const windows = ctx.windows.list()
      if (windows.length !== 1) throw new Error("Compatibility probe requires exactly one window")
      const evaluate = (label: string, code: string) =>
        windows[0].webContents.executeJavaScript(code).catch((error: unknown) => {
          throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`)
        })
      const result = await evaluate('mount', `new Promise((resolve) => {
        const probe = () => {
          const root = document.querySelector('[data-projects-sidebar-root][data-ready="true"]');
          const inbox = document.querySelector('#vertical-tabs-sidebar [data-slot="sidebar-inbox"]');
           const rect = root?.getBoundingClientRect();
           const footer = root?.querySelector('.psb-footer')?.getBoundingClientRect();
           const activity = root?.querySelector('.psb-footer-activity')?.getBoundingClientRect();
           const mount = root?.closest('[data-slot="vertical-tabs-mount"]')?.getBoundingClientRect();
           const spacing = footer && activity && mount ? { top: activity.top - footer.top, bottom: mount.bottom - activity.bottom } : null;
           const style = (element) => element ? getComputedStyle(element) : null;
          const checks = {
            savedEnabled: document.documentElement.getAttribute('data-psb-compatibility-enabled') === 'true',
            mounted: !!root,
            adjacentInbox: !!root && root.previousElementSibling === inbox,
            nativeHidden: inbox ? style(inbox).display === 'none' : false,
            visible: !!rect && rect.width > 0 && rect.height > 0 && style(root)?.display !== 'none',
            historyLoaded: !!root?.querySelector('[data-psb-session]'),
            noWarnings: !!root && !root.querySelector('.psb-warning'),
            footer: !!root?.querySelector('[data-psb-counter="running"]') && !!root?.querySelector('[data-psb-counter="ready"]'),
            noLoadedCounter: !!root && !root.querySelector('.psb-loaded'),
            activityAtStart: !!root && (() => {
              const panel = root.querySelector('.psb-footer-activity')?.getBoundingClientRect();
              const bar = root.querySelector('.psb-footer')?.getBoundingClientRect();
              if (!panel || !bar) return false;
              const rtl = style(root)?.direction === 'rtl';
              return Math.abs((rtl ? bar.right - panel.right : panel.left - bar.left) - 8) < 0.5;
            })(),
             singleMount: document.querySelectorAll('[data-projects-sidebar-root]').length === 1,
             equalVisibleFooterSpacing: !!spacing && Math.abs(spacing.top - spacing.bottom) < 0.5 && Math.abs(spacing.top - 9) < 0.5,
          };
          return { ok: Object.values(checks).every(Boolean), checks, enabledValue: document.documentElement.getAttribute('data-psb-compatibility-enabled'), inboxPresent: !!inbox, sidebarPresent: !!document.querySelector('#vertical-tabs-sidebar'), settingsPresent: !!document.querySelector('fieldset[data-component="interface-mode"]'), nativeModes: [...document.querySelectorAll('fieldset[data-component="interface-mode"] input[type="radio"]')].map(input => ({ value: input.value, checked: input.checked })), groups: root?.querySelectorAll('[data-psb-group]').length ?? 0, rows: root?.querySelectorAll('[data-psb-session]').length ?? 0 };
        };
        const finish = () => { const result = probe(); if (!result.ok) return; clearTimeout(timer); observer.disconnect(); resolve(result); };
        const observer = new MutationObserver(finish);
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        const timer = setTimeout(() => { observer.disconnect(); resolve(probe()); }, 20000);
        finish();
      })`)
      const widthProbe = import.meta.env.VITE_PSB_WIDTH_PROBE === "1"
        ? await windows[0].webContents.executeJavaScript('window.__psbWidthProbe()') : undefined
      const settings = await evaluate('settings', `new Promise(resolve => setTimeout(() => {
        const fieldset = document.querySelector('fieldset[data-projects-sidebar-selected]');
        if (!fieldset) { resolve(null); return; }
        const cards = [...fieldset.querySelectorAll('[data-slot="interface-mode-option"]')];
        const projects = fieldset.querySelector('[data-projects-sidebar-card]');
        const inbox = fieldset.querySelector('input[value="inbox"]')?.parentElement;
        const neutral = fieldset.querySelector('input[value="top"]')?.parentElement;
        const rect = projects?.getBoundingClientRect();
        const checks = {
          compactCards: !!rect && rect.height < 120 && cards.every(card => Math.abs(card.getBoundingClientRect().height - rect.height) < 1),
          oneCheckedRadio: fieldset.querySelectorAll('input:checked').length === 1 && !!projects?.querySelector('input:checked'),
          neutralInbox: !!inbox && !!neutral && getComputedStyle(inbox).borderColor === getComputedStyle(neutral).borderColor && getComputedStyle(inbox, '::after').boxShadow === 'none',
          selectedProjects: !!projects && !!inbox && getComputedStyle(projects).borderColor !== getComputedStyle(inbox).borderColor && getComputedStyle(projects, '::after').boxShadow !== 'none',
        };
        const bounds = fieldset.getBoundingClientRect();
        resolve({ ok: Object.values(checks).every(Boolean), checks, bounds: { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: Math.ceil(bounds.width), height: Math.ceil(bounds.height) } });
      }, 180))`)
      const geometry = await evaluate('geometry', `(() => {
        const panel = document.querySelector('.psb-footer-activity')?.getBoundingClientRect();
        const footer = document.querySelector('.psb-footer')?.getBoundingClientRect();
        const mount = document.querySelector('[data-projects-sidebar-root]')?.closest('[data-slot="vertical-tabs-mount"]')?.getBoundingClientRect();
        return panel && footer && mount ? { top: panel.top - footer.top, bottom: mount.bottom - panel.bottom } : null;
      })()`)
      const update = await evaluate('update', `(() => {
        const control = document.querySelector('[data-psb-update]');
        if (!control) return null;
        const rect = control.getBoundingClientRect();
        const settings = document.querySelector('.psb-footer-settings').getBoundingClientRect();
        const activity = document.querySelector('.psb-footer-activity').getBoundingClientRect();
        const footer = document.querySelector('.psb-footer').getBoundingClientRect();
        const rtl = getComputedStyle(control).direction === 'rtl';
        const checks = {
          sameLine: Math.abs(rect.top + rect.height / 2 - settings.top - settings.height / 2) < 0.5,
          beforeSettings: Math.abs((rtl ? rect.left - settings.right : settings.left - rect.right) - 4) < 0.5,
          compact: rect.width === 30 && rect.height === 30,
          activityAtStart: Math.abs((rtl ? footer.right - activity.right : activity.left - footer.left) - 8) < 0.5,
          nativeParent: control.parentElement.dataset.slot === 'vertical-tabs-footer',
          noExtraRow: control.parentElement.getBoundingClientRect().height === 0,
        };
        return { ok: Object.values(checks).every(Boolean), checks };
      })()`)
      await mkdir("/tmp/opencode/psb-compatibility", { recursive: true })
      await writeFile("/tmp/opencode/psb-compatibility/result.json", JSON.stringify({ version: ctx.app.version, ...result, ok: result.ok && (!settings || settings.ok) && (!update || update.ok), geometry, widthProbe, settings, update }, null, 2))
      if (settings?.bounds) await writeFile("/tmp/opencode/psb-compatibility/settings.png", (await windows[0].webContents.capturePage(settings.bounds, { stayAwake: true })).toPNG())
      const bounds = await windows[0].webContents.executeJavaScript(`(() => {
        const mount = document.querySelector('[data-projects-sidebar-root]')?.closest('[data-slot="vertical-tabs-mount"]')?.getBoundingClientRect();
        return mount ? { x: Math.floor(mount.left), y: Math.floor(mount.bottom - 90), width: Math.ceil(mount.width), height: 90 } : null;
      })()`)
      if (bounds) await writeFile("/tmp/opencode/psb-compatibility/footer.png", (await windows[0].webContents.capturePage(bounds, { stayAwake: true })).toPNG())
    }
    void run().catch(async (error: unknown) => {
      await mkdir("/tmp/opencode/psb-compatibility", { recursive: true })
      await writeFile("/tmp/opencode/psb-compatibility/result.json", JSON.stringify({ ok: false, error: String(error), stack: error instanceof Error ? error.stack : undefined }))
    })
  },
})
