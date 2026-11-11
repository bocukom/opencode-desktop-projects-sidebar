import type { HistoryGroup } from "./groups.ts"
import { compareSessions } from "./session-order.ts"

const projectNames = new Intl.Collator(["ru", "en"], { numeric: true, sensitivity: "base" })

/** Projects stay alphabetical; chats use execution timestamps, newest first. */
export function sortGroups(groups: readonly HistoryGroup[]) {
  return groups.map((group) => ({
    ...group,
    sessions: [...group.sessions].sort(compareSessions),
  })).sort((a, b) => projectNames.compare(a.name, b.name) || projectNames.compare(a.serverName, b.serverName) || a.key.localeCompare(b.key))
}
