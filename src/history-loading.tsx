import { Show } from "solid-js"

/** Keep background index refreshes silent when the existing history is usable. */
export function HistoryLoading(props: { loading: boolean; loaded: number; label: string }) {
  return <Show when={props.loading && props.loaded === 0}><p class="psb-message">{props.label}</p></Show>
}
