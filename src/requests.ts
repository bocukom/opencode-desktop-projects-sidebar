import type { FormInfo } from "@opencode/client"

export type Waiting = "approval" | "input"
type Requests = {
  family(id: string): readonly string[]
  permission: { list(id: string): readonly unknown[] | undefined }
  form: { list(id: string): readonly Pick<FormInfo, "metadata">[] | undefined }
}

/** Native pending stores remove answered/rejected requests themselves. Never infer waiting from idle time. */
export function waitingFor(data: Requests, id: string): Waiting | undefined {
  // Native families use subagent parentID, not fork links: independent forks must not share red markers.
  const family = [...new Set([id, ...data.family(id)])]
  if (family.some((id) => data.permission.list(id)?.length)) return "approval"
  if (family.some((id) => data.form.list(id)?.some((form) =>
    form.metadata?.kind === "question" || form.metadata?.kind === "mcp-elicitation" || form.metadata?.kind === "websearch.provider"))) return "input"
}
