import { createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import type { SessionInfo } from "@opencode/client"
import { createActivity } from "./activity.ts"
import { waitingFor } from "./requests.ts"

/** Lives for the plugin setup, including while the sidebar is unmounted. */
export function createSessionActivity(ctx: Pick<Context, "servers" | "sessions">) {
  const [revision, setRevision] = createSignal(0)
  const activity = createActivity(() => setRevision((value) => value + 1))
  createEffect(() => {
    const unsubscribes = ctx.servers.list().flatMap((id) => {
      const server = ctx.servers.get(id)
      if (!server?.compatible || !server.connected) return []
      // Re-subscribe when the host replaces the authenticated connection.
      server.client
      return [
        server.data.on("session.execution.started", (event) => activity.update(id, event.data.sessionID, { busy: event.created })),
        ...(["succeeded", "failed", "interrupted"] as const).map((outcome) =>
          server.data.on(`session.execution.${outcome}`, (event) => activity.update(id, event.data.sessionID, { idle: event.created, outcome }))),
        server.data.on("session.viewed", (event) => activity.update(id, event.data.sessionID, { viewed: event.data.idle })),
        server.data.on("session.deleted", (event) => activity.forget(id, event.data.sessionID)),
        server.data.on("session.archived", (event) => activity.forget(id, event.data.sessionID)),
      ]
    })
    onCleanup(() => unsubscribes.forEach((unsubscribe) => unsubscribe()))
  })
  createEffect(() => {
    revision()
    const current = ctx.sessions.current()
    if (current) activity.seen(current.server.id, current.id, current.server.data.session.get(current.id))
  })
  onCleanup(() => activity.dispose())
  function status(serverID: string, info: SessionInfo, selected: boolean) {
    revision()
    const server = ctx.servers.get(serverID)
    const connected = !!server?.compatible && server.connected
    return activity.status(serverID, info.id, {
      connected,
      waiting: connected ? waitingFor(server.data.session, info.id) : undefined,
      running: server?.data.session.status(info.id) === "running", selected,
    }, info, server?.data.session.get(info.id))
  }
  return {
    status,
    summaryStatus(serverID: string, info: SessionInfo, selected: boolean) {
      const value = status(serverID, info, selected)
      return value === "approval" || value === "input" ? "running" : value
    },
    seen(serverID: string, info: SessionInfo) {
      revision()
      activity.seen(serverID, info.id, info, ctx.servers.get(serverID)?.data.session.get(info.id))
    },
  }
}
