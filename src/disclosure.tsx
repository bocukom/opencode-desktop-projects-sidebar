/** Shared compact chevron with rounded ends and join for projects and fork branches. */
export function Disclosure(props: { expanded: boolean }) {
  return <svg class="psb-disclosure" viewBox="0 0 10 10" data-expanded={props.expanded ? "" : undefined} aria-hidden="true">
    <path d="M3.4 2.1 6.3 5 3.4 7.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
}
