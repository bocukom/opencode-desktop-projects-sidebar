import { For, Show, createMemo, createSignal, createUniqueId, type JSX } from "solid-js"
import type { SessionInfo } from "@opencode/client"
import type { SessionBranch } from "./session-tree.ts"
import type { Activity } from "./activity.ts"
import type { Copy } from "./copy.ts"
import { copy } from "./copy.ts"
import { listActivity } from "./list-activity.ts"
import { WorkingIndicator } from "./working-indicator.tsx"

export type ForkDisclosure = {
  available(): boolean
  expanded(): boolean
  controls: string
  toggle(): void
}

/** Key each level by native ID so metadata refreshes don't reset menus or inline rename. */
export function SessionList(props: {
  nodes: readonly SessionBranch[]
  nested?: boolean
  hidden?: boolean
  listID?: string
  text?: Copy
  activity?(session: SessionInfo): Activity
  collapsed?(id: string): boolean
  collapse?(id: string, closed: boolean): void
  row(session: () => SessionInfo, branch: ForkDisclosure): JSX.Element
}) {
  const byID = createMemo(() => new Map(props.nodes.map((node) => [node.session.id, node])))
  const [visible, setVisible] = createSignal(10)
  const more = () => props.nodes.length > visible()
  const text = () => props.text ?? copy("en")
  const activity = createMemo(() => props.activity ? listActivity(props.nodes.slice(visible()), props.activity) : undefined)
  const label = () => activity() ? `${text().showMore} — ${text()[activity()!]}` : text().showMore
  return <ul id={props.listID} hidden={props.hidden} data-psb-session-list class={props.nested ? "psb-fork-children" : undefined}
    on:psb-reveal-session={(event: Event) => {
      const index = props.nodes.findIndex((node) => node.session.id === (event as CustomEvent<string>).detail)
      if (index >= 0) setVisible((value) => Math.max(value, Math.ceil((index + 1) / 10) * 10))
    }}>
    <For each={props.nodes.map((node) => node.session.id)}>{(id, index) => <Show when={byID().get(id)}>{(node) => {
      const [closed, setClosed] = createSignal(false)
      const branch: ForkDisclosure = {
        available: () => !!node().children.length,
        expanded: () => !(props.collapsed?.(id) ?? closed()),
        controls: `psb-forks-${createUniqueId()}`,
        toggle: () => {
          const next = branch.expanded()
          if (props.collapse) props.collapse(id, next)
          else setClosed(next)
        },
      }
      return <li data-psb-tree-node={id} hidden={index() >= visible()} data-psb-last={!more() && index() === props.nodes.length - 1 ? "" : undefined}>
        {props.row(() => node().session, branch)}
        <Show when={node().children.length}>
          <SessionList nodes={node().children} nested hidden={!branch.expanded()} listID={branch.controls}
            collapsed={props.collapsed} collapse={props.collapse} row={props.row} text={text()} activity={props.activity} />
        </Show>
      </li>
    }}</Show>}</For>
    <Show when={more()}>
      <li class="psb-show-more-row" data-psb-last>
        <button type="button" class="psb-show-more" title={label()} aria-label={label()} onClick={() => setVisible((value) => value + 10)}>
          <span>{text().showMore}</span>
          <Show when={activity()}>{(status) => <span class="psb-more-activity" data-psb-activity={status()} aria-hidden="true">
            <Show when={status() === "running"}><WorkingIndicator /></Show>
          </span>}</Show>
        </button>
      </li>
    </Show>
  </ul>
}
