import type { SessionInfo } from "@opencode/client"

/** Ignore metadata edits and viewing; forks without execution timestamps use their creation time. */
export function activityTime(session: SessionInfo) {
  return Math.max(session.time.created, session.time.busy ?? 0, session.time.idle ?? 0)
}

export function compareSessions(a: SessionInfo, b: SessionInfo) {
  return activityTime(b) - activityTime(a) || a.id.localeCompare(b.id)
}
