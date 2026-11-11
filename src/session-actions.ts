import type { SessionInfo } from "@opencode/client"
import type { Context } from "@opencode/plugin/gui"
import type { Copy } from "./copy.ts"
import type { HistoryGroup } from "./groups.ts"
import { prepareRemovalNavigation } from "./removal-navigation.ts"

export type ActionContext = Pick<Context, "servers" | "tabs" | "dialogs" | "toast" | "layout">

/** All writes target the row's server, never the currently selected session. */
export function createSessionActions(ctx: ActionContext, text: () => Copy, hooks: {
  groups(): readonly HistoryGroup[]
  renamed(server: string, id: string, title: string): void
  removed(server: string, id: string): void
  added(server: string, session: SessionInfo): void
  refresh(server: string): void
}) {
  const pending = new Set<string>()
  const navigations = new Set<() => void>()
  let disposed = false
  async function run(serverID: string, id: string, action: (server: NonNullable<ReturnType<typeof ctx.servers.get>>) => Promise<void>) {
    const key = JSON.stringify([serverID, id])
    if (disposed || pending.has(key)) return false
    pending.add(key)
    try {
      const server = ctx.servers.get(serverID)
      if (!server?.connected || !server.compatible) throw new Error("offline")
      await action(server)
      return true
    } catch {
      if (!disposed) ctx.toast.show({ title: text().actionError, variant: "error" })
      return false
    } finally { pending.delete(key) }
  }
  const closeTabs = (server: string, id: string) => {
    for (const tab of ctx.tabs.list()) {
      if (tab.session?.server.id === server && tab.session.id === id) ctx.tabs.close(tab.key)
    }
  }
  const removeSession = async (server: string, id: string, write: () => Promise<unknown>) => {
    const navigation = prepareRemovalNavigation(ctx, hooks.groups, server, id, (server, id) => pending.has(JSON.stringify([server, id])))
    navigations.add(navigation.dispose)
    try {
      await write()
      if (disposed) return
      // Focus the sidebar neighbor before closing the active tab, not the host's unrelated tab fallback.
      navigation.focus()
      hooks.removed(server, id)
      closeTabs(server, id)
      hooks.refresh(server)
    } finally { navigation.dispose(); navigations.delete(navigation.dispose) }
  }
  return {
    rename(server: string, id: string, title: string) {
      const value = title.trim()
      if (!value) return Promise.resolve(false)
      return run(server, id, async (ref) => {
        await ref.client.session.update({ sessionID: id, title: value })
        if (disposed) return
        hooks.renamed(server, id, value)
        hooks.refresh(server)
      })
    },
    fork(server: string, id: string) {
      return run(server, id, async (ref) => {
        const fork = await ref.client.session.fork({ sessionID: id })
        if (disposed) return
        hooks.added(server, fork)
        ctx.tabs.open({ server, id: fork.id }, { focus: true })
        hooks.refresh(server)
      })
    },
    close(server: string, id: string) {
      return run(server, id, async (ref) => {
        await removeSession(server, id, () => ref.client.session.update({ sessionID: id, archived: true }))
      })
    },
    remove(server: string, id: string, title: string) {
      return run(server, id, async () => {
        if (!await ctx.dialogs.confirm({ title: text().deleteTitle, description: `${title}\n\n${text().deleteDescription}`, confirm: "Delete", danger: true }) || disposed) return
        // The confirmation may stay open while a server disconnects or re-authenticates.
        const ref = ctx.servers.get(server)
        if (!ref?.connected || !ref.compatible) throw new Error("offline")
        await removeSession(server, id, () => ref.client.session.remove({ sessionID: id }))
      })
    },
    dispose() { disposed = true; navigations.forEach((dispose) => dispose()); navigations.clear() },
  }
}
