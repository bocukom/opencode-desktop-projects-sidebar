import type { SessionInfo } from "@opencode/client"
import type { Activity } from "./activity.ts"
import type { SessionBranch } from "./session-tree.ts"

/** Include descendants of hidden siblings; never infer state from titles. */
export function listActivity(nodes: readonly SessionBranch[], status: (session: SessionInfo) => Activity): Activity {
  let result: Activity
  const priority = { approval: 4, input: 3, running: 2, ready: 1 }
  const stack = [...nodes]
  while (stack.length) {
    const node = stack.pop()!
    const value = status(node.session)
    if (value && (!result || priority[value] > priority[result])) result = value
    stack.push(...node.children)
  }
  return result
}
