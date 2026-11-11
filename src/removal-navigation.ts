import { createComputed, createRoot } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import type { HistoryGroup } from "./groups.ts"
import { sessionTreeOrder } from "./session-tree.ts"

/** Capture sidebar order before an archive/delete event can remove its row. */
export function removalNeighbors(groups: readonly HistoryGroup[], server: string, id: string) {
  const group = groups.find((group) => group.server === server && group.sessions.some((session) => session.id === id))
  if (!group) return undefined
  const sessions = sessionTreeOrder(group.sessions)
  const index = sessions.findIndex((session) => session.id === id)
  return {
    key: group.key, server, directory: group.directory,
    candidates: [...sessions.slice(0, index).reverse(), ...sessions.slice(index + 1)].map((session) => session.id),
  }
}

/** Only the removed active chat may select a replacement; background actions never steal focus. */
export function prepareRemovalNavigation(ctx: Pick<Context, "tabs" | "layout">, groups: () => readonly HistoryGroup[], server: string, id: string,
  pending: (server: string, id: string) => boolean) {
  const plan = removalNeighbors(groups(), server, id)
  const matches = (tab: ReturnType<typeof ctx.tabs.list>[number] | undefined) => tab?.session?.server.id === server && tab.session.id === id
  let owned = matches(ctx.tabs.list().find((tab) => tab.active))
  const dispose = createRoot((dispose) => {
    createComputed(() => {
      const tabs = ctx.tabs.list()
      // A native deletion event may close the tab before the API promise resolves.
      // Do not confuse that automatic fallback with a user switching away while it still exists.
      if (tabs.some(matches) && !matches(tabs.find((tab) => tab.active))) owned = false
    })
    return dispose
  })
  return {
    dispose,
    focus() {
      const tabs = ctx.tabs.list()
      if (!owned || !plan || (tabs.some(matches) && !matches(tabs.find((tab) => tab.active)))) return
      const remaining = groups().find((group) => group.key === plan.key)?.sessions ?? []
      const next = plan.candidates.find((candidate) => !pending(server, candidate) && remaining.some((session) => session.id === candidate))
      if (next) ctx.tabs.open({ server, id: next }, { focus: true })
      else ctx.layout.draft({ server, directory: plan.directory, prompt: "" })
    },
  }
}
