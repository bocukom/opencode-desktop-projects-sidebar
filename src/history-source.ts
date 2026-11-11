import type { ServerRef } from "@opencode/plugin/gui"
import type { HistorySource } from "./history.ts"
import { pageSize } from "./history.ts"

export function historySource(server: ServerRef): HistorySource {
  return {
    id: server.id,
    name: server.name,
    connected: server.compatible && server.connected,
    generation: server.client,
    projects: (signal) => server.client.project.list(undefined, { signal }),
    sessions: (cursor, signal) => server.client.session.list({ limit: pageSize, order: "desc", parentID: null, archived: false, ...(cursor ? { cursor } : {}) }, { signal }),
    subscribe(changed) {
      const subscriptions = [
        server.data.on("session.deleted", (event) => changed({ remove: event.data.sessionID })),
        server.data.on("session.archived", (event) => changed({ remove: event.data.sessionID })),
        server.data.on("session.unarchived", (event) => changed({ restore: event.data.sessionID })),
        ...([
          "session.created", "session.renamed", "session.moved", "session.forked", "session.execution.started",
          "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted",
          "session.inbox.enqueued", "session.step.ended", "project.updated",
        ] as const).map((type) => server.data.on(type, () => changed({}))),
      ]
      return () => subscriptions.forEach((unsubscribe) => unsubscribe())
    },
  }
}
