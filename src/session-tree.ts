import type { SessionInfo } from "@opencode/client"
import { compareSessions } from "./session-order.ts"

export type SessionBranch = { session: SessionInfo; children: SessionBranch[] }

/** Presentation only: native forks stay independent sessions; parentID belongs to subagents. */
export function sessionTree(sessions: readonly SessionInfo[]): SessionBranch[] {
  const sorted = [...sessions].sort(compareSessions)
  const nodes = new Map(sorted.map((session) => [session.id, { session, children: [] } as SessionBranch]))
  const parents = new Map<string, string>()
  for (const session of sorted) {
    const parent = session.fork?.sessionID
    if (parent && parent !== session.id && nodes.has(parent)) parents.set(session.id, parent)
  }
  // Bad/stale metadata must never hide a cycle or recurse forever. Break one edge deterministically.
  const done = new Set<string>()
  for (const session of sorted) {
    const path = new Set<string>()
    let id: string | undefined = session.id
    while (id && !done.has(id)) {
      if (path.has(id)) { parents.delete(id); break }
      path.add(id)
      id = parents.get(id)
    }
    for (const id of path) done.add(id)
  }
  const roots: SessionBranch[] = []
  for (const session of sorted) {
    const node = nodes.get(session.id)!
    const parent = parents.get(session.id)
    if (parent) nodes.get(parent)!.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** Same preorder as the rendered nested lists, including forks of forks. */
export function sessionTreeOrder(sessions: readonly SessionInfo[]) {
  const ordered: SessionInfo[] = []
  const stack = sessionTree(sessions).reverse()
  while (stack.length) {
    const node = stack.pop()!
    ordered.push(node.session)
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
  }
  return ordered
}
