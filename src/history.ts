import type { Project, SessionInfo, SessionsResponse } from "@opencode/client"
import { mergeSessions } from "./groups.ts"

export const pageSize = 100

export type HistorySource = {
  id: string
  name: string
  connected: boolean
  generation: object
  projects(signal: AbortSignal): Promise<Project[]>
  sessions(cursor: string | undefined, signal: AbortSignal): Promise<SessionsResponse>
  subscribe(changed: (event: { remove?: string; restore?: string }) => void): () => void
}

export type HistoryState = {
  id: string
  name: string
  connected: boolean
  projects: Project[]
  sessions: SessionInfo[]
  loading: boolean
  error: boolean
  cursor?: string
}

type RecordState = {
  source: HistorySource
  state: HistoryState
  removed: Set<string>
  unsubscribe?: () => void
  timer?: ReturnType<typeof setTimeout>
  request?: AbortController
  paged: boolean
  queued: boolean
}

/** Reads only session/project indexes. No transcripts, database access or server mutations. */
export function createHistory(changed: () => void, debounceMs = 200) {
  const records = new Map<string, RecordState>()
  let disposed = false

  function stop(record: RecordState) {
    record.request?.abort()
    record.request = undefined
    record.unsubscribe?.()
    record.unsubscribe = undefined
    clearTimeout(record.timer)
    record.timer = undefined
    record.queued = false
    record.state.loading = false
  }

  async function load(record: RecordState, more = false, replace = false) {
    if (disposed || !record.state.connected || (more && !record.state.cursor)) return
    if (record.request) { if (!more) record.queued = true; return }
    const request = new AbortController()
    record.request = request
    const cursor = more ? record.state.cursor : undefined
    record.state.loading = true
    record.state.error = false
    changed()
    const current = () => !disposed && record.request === request && !request.signal.aborted
    try {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15_000)])
      const [projects, page] = await Promise.all([
        more ? record.state.projects : record.source.projects(signal),
        record.source.sessions(cursor, signal),
      ])
      if (!current()) return
      record.state.projects = projects
      record.state.sessions = mergeSessions(replace ? [] : record.state.sessions, page.data, record.removed)
      const next = page.data.length >= pageSize && page.cursor.next !== cursor ? page.cursor.next ?? undefined : undefined
      if (replace || more || !record.paged) record.state.cursor = next
      record.paged = replace ? false : record.paged || more
    } catch {
      if (current()) record.state.error = true
    } finally {
      if (current()) {
        record.request = undefined
        record.state.loading = false
        changed()
        if (record.queued) { record.queued = false; void load(record) }
      }
    }
  }

  function connect(record: RecordState) {
    record.removed.clear()
    record.unsubscribe = record.source.subscribe((event) => {
      if (event.remove) {
        record.removed.add(event.remove)
        record.state.sessions = record.state.sessions.filter((session) => session.id !== event.remove)
        changed()
      }
      if (event.restore) record.removed.delete(event.restore)
      clearTimeout(record.timer)
      record.timer = setTimeout(() => { record.timer = undefined; void load(record) }, debounceMs)
    })
    void load(record, false, true)
  }

  return {
    snapshot: () => [...records.values()].map((record) => ({ ...record.state })),
    sources(sources: readonly HistorySource[]) {
      if (disposed) return
      const ids = new Set(sources.map((source) => source.id))
      for (const [id, record] of records) {
        if (!ids.has(id)) { stop(record); records.delete(id) }
      }
      for (const source of sources) {
        const record = records.get(source.id)
        if (!record) {
          const next: RecordState = {
            source, removed: new Set(), paged: false, queued: false,
            state: { id: source.id, name: source.name, connected: source.connected, projects: [], sessions: [], loading: false, error: false },
          }
          records.set(source.id, next)
          if (source.connected) connect(next)
          continue
        }
        const reconnect = record.source.generation !== source.generation || record.state.connected !== source.connected
        if (reconnect) stop(record)
        record.source = source
        record.state.name = source.name
        record.state.connected = source.connected
        if (reconnect && source.connected) connect(record)
      }
      changed()
    },
    more(id: string) { const record = records.get(id); if (record) return load(record, true) },
    refresh(id: string) { const record = records.get(id); if (record) return load(record, false, true) },
    reload(id: string) { const record = records.get(id); if (record) return load(record) },
    renameTitle(id: string, sessionID: string, title: string) {
      const record = records.get(id)
      if (disposed || !record) return
      record.state.sessions = record.state.sessions.map((session) => session.id === sessionID ? { ...session, title } : session)
      changed()
    },
    forget(id: string, sessionID: string) {
      const record = records.get(id)
      if (disposed || !record) return
      record.removed.add(sessionID)
      record.state.sessions = record.state.sessions.filter((session) => session.id !== sessionID)
      changed()
    },
    remember(id: string, session: SessionInfo) {
      const record = records.get(id)
      // The selected-session cache may be older than the index. Only add missing rows; never overwrite known ones.
      if (disposed || !record || record.state.loading || record.state.sessions.some((known) => known.id === session.id)) return
      const merged = mergeSessions(record.state.sessions, [session], record.removed)
      if (merged.length === record.state.sessions.length) return
      record.state.sessions = merged
      changed()
    },
    dispose() {
      disposed = true
      for (const record of records.values()) stop(record)
      records.clear()
    },
  }
}
