import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { copy } from "./copy.ts"
import { groupSessions } from "./groups.ts"
import { sortGroups } from "./order.ts"
import { createHistory } from "./history.ts"
import { historySource } from "./history-source.ts"
import { createSessionActions } from "./session-actions.ts"
import { SessionRow } from "./session-row.tsx"
import { SessionList } from "./session-list.tsx"
import { sessionTree } from "./session-tree.ts"
import type { createSessionActivity } from "./activity-source.ts"
import type { createProjectDrafts } from "./project-drafts.ts"
import { HistoryFooter, type ActivityEntry } from "./history-footer.tsx"
import { Disclosure } from "./disclosure.tsx"
import { revealSession } from "./reveal-session.ts"
import { ProjectActivity } from "./project-activity.tsx"
import { HistoryLoading } from "./history-loading.tsx"

type Props = {
  ctx: Pick<Context, "servers" | "sessions" | "tabs" | "locale" | "ui" | "dialogs" | "toast" | "layout">
  activity: ReturnType<typeof createSessionActivity>
  drafts: Pick<ReturnType<typeof createProjectDrafts>, "open">
  draftBusy(): boolean
  collapsed(): readonly string[]
  collapse(key: string, closed: boolean): void
  collapsedForks(): readonly string[]
  collapseFork(key: string, closed: boolean): void
}

export function HistoryView(props: Props) {
  let viewport!: HTMLDivElement
  let cancelReveal = () => {}
  const [revision, update] = createSignal(0)
  const history = createHistory(() => update((value) => value + 1))
  const text = () => copy(props.ctx.locale.locale())
  const actions = createSessionActions(props.ctx, text, {
    groups: () => groups(),
    renamed: history.renameTitle, removed: history.forget, added: history.remember,
    refresh: (server) => { void history.reload(server) },
  })
  const states = createMemo(() => { revision(); return history.snapshot() })
  const byServer = createMemo(() => new Map(states().map((state) => [state.id, state])))
  const groups = createMemo(() => sortGroups(groupSessions(states())))
  const byGroup = createMemo(() => new Map(groups().map((group) => [group.key, group])))
  const selected = () => {
    const session = props.ctx.sessions.current()
    return session ? JSON.stringify([session.server.id, session.id]) : undefined
  }
  const activityLists = createMemo(() => {
    const result: Record<"running" | "ready", ActivityEntry[]> = { running: [], ready: [] }
    for (const group of groups()) for (const session of group.sessions) {
      const status = props.activity.summaryStatus(group.server, session, selected() === JSON.stringify([group.server, session.id]))
      const activity = props.activity.status(group.server, session, selected() === JSON.stringify([group.server, session.id]))
      if (status === "running" || status === "ready") result[status].push({ server: group.server, id: session.id, title: session.title?.trim() || text().untitled,
        waiting: activity === "approval" || activity === "input" ? activity : undefined })
    }
    return result
  })
  const readySessions = createMemo(() => new Set(activityLists().ready.map((item) => JSON.stringify([item.server, item.id]))))
  const waitingSessions = createMemo(() => new Map(activityLists().running.map((item) => [JSON.stringify([item.server, item.id]), item.waiting])))

  createEffect(() => history.sources(props.ctx.servers.list().flatMap((id) => {
    const server = props.ctx.servers.get(id)
    return server ? [historySource(server)] : []
  })))
  createEffect(() => {
    revision()
    const current = props.ctx.sessions.current()
    const info = current?.server.data.session.get(current.id)
    if (current && info) history.remember(current.server.id, info)
    const indexed = current && states().find((state) => state.id === current.server.id)?.sessions.find((session) => session.id === current.id)
    if (current && indexed) props.activity.seen(current.server.id, indexed)
  })
  onCleanup(() => { cancelReveal(); actions.dispose(); history.dispose() })

  return <>
    <div class="psb-history" data-psb-history ref={viewport}>
      <For each={groups().map((group) => group.key)}>{(key) => <Show when={byGroup().get(key)}>{(group) => {
        const tree = createMemo(() => sessionTree(group().sessions))
        const active = () => group().sessions.some((session) => selected() === JSON.stringify([group().server, session.id]))
        const waiting = createMemo(() => {
          const values = group().sessions.map((session) => waitingSessions().get(JSON.stringify([group().server, session.id])))
          return values.includes("approval") ? "approval" as const : values.includes("input") ? "input" as const : undefined
        })
        return <details data-psb-group={key} data-psb-collapsed={props.collapsed().includes(key) ? "" : undefined} open={!props.collapsed().includes(key)} onToggle={(event) => {
          const closed = !event.currentTarget.open
          if (closed !== props.collapsed().includes(key)) props.collapse(key, closed)
        }}>
          <summary title={`${group().directory}\n${group().serverName}`} data-psb-active={active() ? "" : undefined}>
            <Disclosure expanded={!props.collapsed().includes(key)} />
            <span class="psb-project-name">{group().name}</span>
            <ProjectActivity collapsed={props.collapsed().includes(key)} waiting={waiting()}
              ready={group().sessions.some((session) => readySessions().has(JSON.stringify([group().server, session.id])))} label={waiting() ? text()[waiting()!] : text().ready} />
            <button type="button" class="psb-project-new" data-psb-project-new
              title={text().newConversation} aria-label={`${text().newConversation}: ${group().name}`}
              disabled={props.draftBusy() || !byServer().get(group().server)?.connected}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                props.collapse(key, false)
                props.drafts.open(group())
              }}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
            </button>
          </summary>
          <SessionList nodes={tree()} text={text()}
            activity={(session) => props.activity.status(group().server, session, selected() === JSON.stringify([group().server, session.id]))}
            collapsed={(id) => props.collapsedForks().includes(JSON.stringify([group().server, id]))}
            collapse={(id, closed) => props.collapseFork(JSON.stringify([group().server, id]), closed)} row={(session, branch) =>
            <SessionRow ctx={props.ctx} actions={actions} server={group().server} session={session()}
              branch={branch}
              selected={selected() === JSON.stringify([group().server, session().id])}
              activity={props.activity.status(group().server, session(), selected() === JSON.stringify([group().server, session().id]))}
              connected={!!byServer().get(group().server)?.connected} text={text()} />
          } />
        </details>
      }}</Show>}</For>
      <Show when={!groups().length && !states().some((state) => state.loading || state.error || !state.connected)}>
        <p class="psb-message">{states().length ? text().empty : text().noServers}</p>
      </Show>
      <For each={states().map((state) => state.id)}>{(id) => <Show when={byServer().get(id)}>{(state) =>
        <div class="psb-server-state" data-psb-server-state={id} data-psb-loading={state().loading ? "" : undefined} aria-live="polite">
          <Show when={!state().connected || state().error}>
            <p class="psb-message psb-warning">{state().name}: {state().connected ? text().loadError : text().offline}</p>
          </Show>
          <HistoryLoading loading={state().loading} loaded={state().sessions.length} label={text().loading} />
          <Show when={state().connected && !state().loading}>
            <Show when={state().cursor}><button type="button" class="psb-more" onClick={() => void history.more(id)}>{text().more}{states().length > 1 ? ` · ${state().name}` : ""}</button></Show>
            <Show when={state().error}><button type="button" onClick={() => void history.refresh(id)}>{text().retry}</button></Show>
          </Show>
        </div>}</Show>}</For>
    </div>
    <HistoryFooter ctx={props.ctx} settings={() => props.ctx.layout.settings("general")} lists={activityLists()}
      reveal={(item) => {
        cancelReveal()
        cancelReveal = revealSession(viewport, item, props.collapse, props.collapseFork)
      }}
      text={text()} />
  </>
}
