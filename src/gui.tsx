import { Schema } from "effect"
import { ErrorBoundary, createComputed, createEffect, createSignal, untrack } from "solid-js"
import { render } from "solid-js/web"
import { Command, Plugin, Store, Style } from "@opencode/plugin/gui"
import { installPrototype } from "./adapter.ts"
import { copy } from "./copy.ts"
import { HistoryView } from "./history-view.tsx"
import { createSessionActivity } from "./activity-source.ts"
import { createProjectDrafts } from "./project-drafts.ts"
import css from "./style.css?inline"
import { radarKeyframes } from "./spinner-radar.ts"

export default Plugin.define({
  stores: {
    preferences: Store.global(Schema.Struct({ enabled: Schema.Boolean, collapsed: Schema.optionalKey(Schema.Array(Schema.String)), collapsedForks: Schema.optionalKey(Schema.Array(Schema.String)), sidebarWidth: Schema.optionalKey(Schema.Number) }), { enabled: false, collapsed: [], collapsedForks: [] }),
    drafts: Store.global(Schema.Struct({ links: Schema.Record(Schema.String, Schema.Struct({ server: Schema.String, directory: Schema.String })) }), { links: {} }),
  },
  i18n: {
    en: { disable: "Restore the standard sidebar", settings: "Projects sidebar settings" },
    ru: { disable: "Вернуть стандартный sidebar", settings: "Настройки Projects sidebar" },
  },
  setup(ctx) {
    ctx.add(Style, css + radarKeyframes("psb-spinner-radar"))
    const activity = createSessionActivity(ctx)
    const [draftBusy, setDraftBusy] = createSignal(false)
    const drafts = createProjectDrafts(ctx, {
      links: () => untrack(() => ctx.stores.drafts.value.links),
      save: (links) => ctx.stores.drafts.set({ links }),
      changed: setDraftBusy,
      error: () => ctx.toast.show({ title: "Projects sidebar", description: copy(ctx.locale.locale()).draftError, variant: "error" }),
    })
    createComputed(() => {
      const tabs = ctx.tabs.list()
      untrack(() => drafts.observe(tabs))
    })
    const adapter = installPrototype({
      document,
      enabled: () => ctx.stores.preferences.value.enabled,
      ready: () => ctx.stores.preferences.ready(),
      width: {
        get: () => ctx.stores.preferences.value.sidebarWidth,
        set: (width) => ctx.stores.preferences.update((draft) => { draft.sidebarWidth = width }),
      },
      setEnabled: (enabled) => ctx.stores.preferences.update((draft) => { draft.enabled = enabled }),
      copy: () => copy(ctx.locale.locale()),
      mountList: (container) => render(() => <ErrorBoundary fallback={() => { adapter.fail(); return null }}><HistoryView ctx={ctx} activity={activity}
        drafts={drafts} draftBusy={() => !ctx.stores.drafts.ready() || draftBusy()}
        collapsed={() => ctx.stores.preferences.value.collapsed ?? []}
        collapse={(key, closed) => ctx.stores.preferences.update((draft) => {
          draft.collapsed = closed ? [...new Set([...(draft.collapsed ?? []), key])] : (draft.collapsed ?? []).filter((item) => item !== key)
        })}
        collapsedForks={() => ctx.stores.preferences.value.collapsedForks ?? []}
        collapseFork={(key, closed) => ctx.stores.preferences.update((draft) => {
          draft.collapsedForks = closed ? [...new Set([...(draft.collapsedForks ?? []), key])] : (draft.collapsedForks ?? []).filter((item) => item !== key)
        })}
      /></ErrorBoundary>, container),
      onError: () => ctx.toast.show({ title: "Projects sidebar", description: copy(ctx.locale.locale()).unsupported, variant: "error" }),
    })
    createEffect(() => {
      ctx.stores.preferences.value.enabled
      ctx.stores.preferences.ready()
      ctx.locale.locale()
      adapter.refresh()
    })
    ctx.add(Command, () => ({
      id: "disable", title: ctx.t("disable"), keywords: "projects sidebar inbox restore вернуть проекты",
      run: () => { ctx.stores.preferences.update((draft) => { draft.enabled = false }); adapter.refresh() },
    }))
    ctx.add(Command, () => ({ id: "settings", title: ctx.t("settings"), run: () => ctx.layout.settings("general") }))
    return () => { drafts.dispose(); adapter.dispose() }
  },
})
