import type { SessionInfo } from "@opencode/client"
import type { Waiting } from "./requests.ts"

export type Activity = Waiting | "running" | "ready" | undefined
type Progress = Pick<SessionInfo, "time" | "outcome">
type Update = { busy?: number; idle?: number; viewed?: number; outcome?: SessionInfo["outcome"] }

/** Server timestamps, not title/updated changes, define execution and read state. */
export function createActivity(changed: () => void = () => {}) {
  const events = new Map<string, Update>()
  const key = (server: string, id: string) => JSON.stringify([server, id])
  function progress(server: string, id: string, snapshots: readonly (Progress | undefined)[]) {
    const event = events.get(key(server, id))
    const values: Update[] = snapshots.flatMap((info) => info ? [{ ...info.time, outcome: info.outcome }] : [])
    if (event) values.push(event)
    const latest = values.reduce<Update>((last, value) => Math.max(value.busy ?? 0, value.idle ?? 0) >= Math.max(last.busy ?? 0, last.idle ?? 0) ? value : last, {})
    return {
      busy: Math.max(0, ...values.map((value) => value.busy ?? 0)),
      idle: Math.max(0, ...values.map((value) => value.idle ?? 0)),
      viewed: Math.max(0, ...values.map((value) => value.viewed ?? 0)),
      outcome: latest.outcome,
    }
  }
  return {
    update(server: string, id: string, update: Update) {
      const identity = key(server, id)
      const previous = events.get(identity) ?? {}
      const last = Math.max(previous.busy ?? 0, previous.idle ?? 0)
      const next = Math.max(update.busy ?? 0, update.idle ?? 0)
      events.set(identity, {
        ...previous,
        ...(next >= last ? update : {}),
        viewed: Math.max(previous.viewed ?? 0, update.viewed ?? 0),
      })
      changed()
    },
    seen(server: string, id: string, ...snapshots: (Progress | undefined)[]) {
      const current = progress(server, id, snapshots)
      if (current.idle <= current.viewed) return
      const identity = key(server, id)
      events.set(identity, { ...events.get(identity), viewed: current.idle })
      changed()
    },
    status(server: string, id: string, options: { connected: boolean; running: boolean; selected: boolean; waiting?: Waiting }, ...snapshots: (Progress | undefined)[]): Activity {
      const current = progress(server, id, snapshots)
      if (options.connected && options.waiting) return options.waiting
      if (options.connected && (options.running || current.busy > current.idle)) return "running"
      if (current.busy > current.idle || options.selected) return undefined
      return current.outcome === "succeeded" && current.idle > current.viewed ? "ready" : undefined
    },
    forget(server: string, id: string) { if (events.delete(key(server, id))) changed() },
    dispose() { events.clear() },
  }
}
