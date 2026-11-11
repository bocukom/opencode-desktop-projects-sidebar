import type { Context, ShellTab } from "@opencode/plugin/gui"
import { pathKey } from "./groups.ts"

export type DraftLink = { server: string; directory: string }
export type DraftLinks = Record<string, DraftLink>

// Desktop 2.2.5 can temporarily expose an unresolved session tab without a SessionRef.
// Its verified draft key format prevents mistaking such a tab for a new draft.
const isDraft = (tab: ShellTab) => !tab.session && tab.key.startsWith("draft:")

/** Only tab identities live here. Text, attachments and draft persistence belong to OpenCode. */
export function createProjectDrafts(ctx: Pick<Context, "tabs" | "layout" | "servers">, options: {
  links(): DraftLinks
  save(links: DraftLinks): void
  changed(busy: boolean): void
  error(): void
}) {
  let pending: { target: DraftLink; before: Set<string>; timeout: ReturnType<typeof setTimeout> } | undefined
  let observed = new Set<string>()
  let disposed = false
  const finish = () => {
    if (!pending) return
    clearTimeout(pending.timeout)
    pending = undefined
    options.changed(false)
  }
  const observe = (tabs: readonly ShellTab[]) => {
    if (disposed) return
    const links = { ...options.links() }
    let changed = false
    // Do not remove absent links belonging to another desktop window. Only prune tabs this
    // controller has actually seen, or tabs that have become sent sessions in this window.
    for (const key of Object.keys(links)) {
      const tab = tabs.find((tab) => tab.key === key)
      if (tab?.session || (!tab && observed.has(key))) { delete links[key]; changed = true }
    }
    observed = new Set(tabs.map((tab) => tab.key))
    if (pending) {
      const added = tabs.filter((tab) => isDraft(tab) && !pending!.before.has(tab.key))
      if (added.length === 1) {
        links[added[0].key] = pending.target
        changed = true
        finish()
      } else if (added.length > 1) {
        // The public API exposes no draft directory. Never guess if another creator raced us.
        finish()
        options.error()
      }
    }
    if (changed) options.save(links)
  }
  return {
    observe,
    open(target: DraftLink) {
      if (disposed || pending) return
      const server = ctx.servers.get(target.server)
      if (!server?.connected || !server.compatible) return
      const tabs = ctx.tabs.list()
      observe(tabs)
      const links = options.links()
      const existing = tabs.find((tab) => isDraft(tab) && links[tab.key]?.server === target.server
        && pathKey(links[tab.key].directory) === pathKey(target.directory))
      if (existing) { ctx.tabs.focus(existing.key); return }
      pending = {
        target: { server: target.server, directory: target.directory }, before: new Set(tabs.map((tab) => tab.key)),
        timeout: setTimeout(() => { finish(); if (!disposed) options.error() }, 15000),
      }
      options.changed(true)
      try {
        ctx.layout.draft({ server: target.server, directory: target.directory, prompt: "" })
        observe(ctx.tabs.list())
      } catch {
        finish()
        options.error()
      }
    },
    dispose() { disposed = true; finish() },
  }
}
