import type { Project, SessionInfo } from "@opencode/client"
import { compareSessions } from "./session-order.ts"

export type HistoryGroup = {
  key: string
  server: string
  serverName: string
  directory: string
  name: string
  sessions: SessionInfo[]
}

export function pathKey(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "") || "/"
  return /^[a-z]:(?:\/|$)/i.test(normalized) || normalized.startsWith("//") ? normalized.toLowerCase() : normalized
}

function contains(root: string, directory: string) {
  const base = pathKey(root)
  const child = pathKey(directory)
  return base === child || child.startsWith(base === "/" ? "/" : `${base}/`)
}

function directoryFor(session: SessionInfo, project: Project | undefined) {
  const directory = session.location.directory
  if (project && project.id !== "global" && [project.canonical, ...project.sandboxes].some((root) => contains(root, directory))) return project.canonical
  const suffix = session.subpath?.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
  if (suffix && pathKey(directory).endsWith(`/${pathKey(suffix)}`)) return directory.slice(0, -(suffix.length + 1)) || "/"
  return directory
}

export function mergeSessions(known: readonly SessionInfo[], incoming: readonly SessionInfo[], removed: ReadonlySet<string> = new Set()) {
  return [...new Map([...known, ...incoming].map((session) => [session.id, session])).values()]
    .filter((session) => !session.parentID && session.time.archived === undefined && !removed.has(session.id))
}

export function groupSessions(servers: readonly { id: string; name: string; projects: readonly Project[]; sessions: readonly SessionInfo[] }[]) {
  const groups = new Map<string, HistoryGroup>()
  for (const server of servers) {
    const projects = new Map(server.projects.map((project) => [project.id, project]))
    for (const session of mergeSessions([], server.sessions)) {
      const project = projects.get(session.projectID)
      const directory = directoryFor(session, project)
      const key = JSON.stringify([server.id, session.projectID, pathKey(directory)])
      let group = groups.get(key)
      if (!group) {
        group = {
          key, server: server.id, serverName: server.name, directory,
          name: project?.id !== "global" && project?.name?.trim() || directory.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) || directory,
          sessions: [],
        }
        groups.set(key, group)
      }
      group.sessions.push(session)
    }
  }
  for (const group of groups.values()) group.sessions.sort(compareSessions)
  return [...groups.values()].sort((a, b) => compareSessions(a.sessions[0], b.sessions[0]) || a.key.localeCompare(b.key))
}
