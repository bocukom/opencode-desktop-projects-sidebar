import { Show } from "solid-js"
import type { Waiting } from "./requests.ts"

/** Collapsed projects must not hide pending requests or unread completions. */
export function ProjectActivity(props: { collapsed: boolean; ready: boolean; waiting?: Waiting; label: string }) {
  return <Show when={props.collapsed && (props.waiting || props.ready)}>
    <span class="psb-project-activity" data-psb-waiting={props.waiting} role="img" aria-label={props.label} title={props.label} />
  </Show>
}
