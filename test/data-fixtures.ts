import type { Project, SessionInfo, SessionsResponse } from "@opencode/client"
import type { HistorySource } from "../src/history.ts"

export function session(id: string, directory = "/work/app", patch: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id, projectID: "project", title: id,
    location: { directory }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 1 }, ...patch,
  }
}

export function project(canonical = "/work/app", patch: Partial<Project> = {}): Project {
  return { id: "project", canonical, sandboxes: [], time: { created: 1, updated: 1, active: 1 }, ...patch }
}

export function page(data: SessionInfo[], next?: string): SessionsResponse { return { data, cursor: { next } } }

export function fakeSource(id = "local") {
  const listeners = new Set<(event: { remove?: string; restore?: string }) => void>()
  const calls: { cursor?: string; signal: AbortSignal }[] = []
  let read = async (_cursor?: string, _signal?: AbortSignal) => page([session("one")])
  let catalog = [project()]
  const source: HistorySource = {
    id, name: id, connected: true, generation: {},
    projects: async () => catalog,
    sessions: (cursor, signal) => { calls.push({ cursor, signal }); return read(cursor, signal) },
    subscribe(changed) { listeners.add(changed); return () => { listeners.delete(changed) } },
  }
  return {
    source, calls,
    read: (callback: typeof read) => { read = callback },
    projects: (items: Project[]) => { catalog = items },
    event: (event: { remove?: string; restore?: string } = {}) => listeners.forEach((changed) => changed(event)),
    subscriptions: () => listeners.size,
  }
}
