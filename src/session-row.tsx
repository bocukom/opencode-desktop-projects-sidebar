import { Show, createEffect, createSignal, onCleanup } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import type { SessionInfo } from "@opencode/client"
import type { Copy } from "./copy.ts"
import type { createSessionActions } from "./session-actions.ts"
import type { Activity } from "./activity.ts"
import { WorkingIndicator } from "./working-indicator.tsx"
import { Disclosure } from "./disclosure.tsx"
import type { ForkDisclosure } from "./session-list.tsx"

export function SessionRow(props: {
  ctx: Pick<Context, "tabs" | "ui">
  actions: ReturnType<typeof createSessionActions>
  server: string
  session: SessionInfo
  selected: boolean
  connected: boolean
  text: Copy
  activity?: Activity
  branch?: ForkDisclosure
}) {
  const [editing, setEditing] = createSignal(false)
  const [value, setValue] = createSignal("")
  const [busy, setBusy] = createSignal(false)
  const [quietFocus, setQuietFocus] = createSignal(false)
  let input: HTMLInputElement | undefined
  let row: HTMLDivElement | undefined
  let alive = true
  onCleanup(() => { alive = false })
  const title = () => props.session.title?.trim() || props.text.untitled
  const trackOverflow = (viewport: HTMLSpanElement) => {
    let active = true
    const measure = () => {
      if (!active || !viewport.isConnected) return
      const text = viewport.firstElementChild as HTMLElement | null
      viewport.toggleAttribute("data-overflow", !!text && text.clientWidth > 0 && text.scrollWidth > text.clientWidth)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    createEffect(() => { title(); queueMicrotask(measure) })
    onCleanup(() => { active = false; observer.disconnect() })
  }
  const activityLabel = () => props.activity ? props.text[props.activity] : ""
  const rename = () => {
    if (!props.connected || busy()) return
    setQuietFocus(false)
    setValue(props.session.title ?? "")
    setEditing(true)
    queueMicrotask(() => {
      if (!alive || !editing() || !input) return
      input.focus({ preventScroll: true })
      input.setSelectionRange(0, 0)
      input.scrollLeft = 0
    })
  }
  const perform = async (action: () => Promise<boolean>) => {
    if (busy()) return
    setBusy(true)
    try { return await action() } finally { if (alive) setBusy(false) }
  }
  const finishRename = (restoreFocus = true) => {
    // Keep the keyboard's place without leaving an editing-style ring behind.
    setQuietFocus(true)
    setEditing(false)
    if (restoreFocus) row?.querySelector<HTMLButtonElement>(".psb-session")?.focus({ preventScroll: true })
  }
  const save = async (restoreFocus = true) => {
    // Removing the editor on Escape/Enter may also fire blur; never submit twice or after cancellation.
    if (!alive || !editing() || busy()) return
    if (!value().trim()) { if (!restoreFocus) finishRename(false); return }
    if (value().trim() === props.session.title) { finishRename(restoreFocus); return }
    const ok = await perform(() => props.actions.rename(props.server, props.session.id, value()))
    if (ok && alive) finishRename(restoreFocus)
    else if (alive && restoreFocus) queueMicrotask(() => input?.focus())
  }
  return <div ref={row} class="psb-session-row" data-editing={editing() ? "" : undefined} data-psb-activity={props.activity} aria-busy={busy()}>
    <span class="psb-activity" role={props.activity ? "img" : undefined} aria-hidden={props.activity ? undefined : true}
      aria-label={activityLabel() || undefined} title={activityLabel() || undefined}>
      <Show when={props.activity === "running"}><WorkingIndicator /></Show>
    </span>
    <Show when={editing()} fallback={<>
      <Show when={props.branch?.available()}>
        <button type="button" class="psb-fork-toggle" aria-expanded={props.branch!.expanded()} aria-controls={props.branch!.controls}
          aria-label={`${props.branch!.expanded() ? props.text.collapseForks : props.text.expandForks}: ${title()}`}
          title={props.branch!.expanded() ? props.text.collapseForks : props.text.expandForks}
          onClick={(event) => { event.stopPropagation(); props.branch!.toggle() }}>
          <Disclosure expanded={props.branch!.expanded()} />
        </button>
      </Show>
      <button type="button" class="psb-session" data-psb-session={props.session.id} data-psb-server={props.server} data-psb-updated={props.session.time.updated}
        data-psb-quiet-focus={quietFocus() ? "" : undefined} onBlur={() => setQuietFocus(false)}
        aria-current={props.selected ? "page" : undefined} disabled={!props.connected}
        aria-label={activityLabel() ? `${title()} — ${activityLabel()}` : undefined}
        title={`${title()}\n${props.session.location.directory}${activityLabel() ? `\n${activityLabel()}` : ""}`}
        onClick={() => props.ctx.tabs.open({ server: props.server, id: props.session.id }, { focus: true })}>
        <span ref={trackOverflow} class="psb-title-viewport" onDblClick={(event) => { event.preventDefault(); rename() }}>
          <span class="psb-session-title">{title()}</span>
        </span>
      </button>
      <div class="psb-actions" onDblClick={(event) => event.stopPropagation()}>
        <props.ctx.ui.Menu label={props.text.actions} icon="outline-dots" placement="bottom-end" disabled={!props.connected || busy()}
          items={[
            { label: "Rename", icon: "edit", onSelect: rename },
            { label: "Fork", icon: "fork", onSelect: () => { void perform(() => props.actions.fork(props.server, props.session.id)) } },
            { type: "separator" },
            { label: "Close", icon: "archive", onSelect: () => { void perform(() => props.actions.close(props.server, props.session.id)) } },
            { label: "Delete", icon: "trash", onSelect: () => { void perform(() => props.actions.remove(props.server, props.session.id, title())) } },
          ]} />
      </div>
    </>}>
      <input ref={input} class="psb-rename" aria-label={props.text.renameTitle} title={props.text.renameHelp} value={value()} disabled={busy()}
        onInput={(event) => setValue(event.currentTarget.value)}
        onBlur={() => { void save(false) }}
        on:keydown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void save() }
          if (event.key === "Escape") { event.preventDefault(); finishRename() }
        }} />
    </Show>
  </div>
}
