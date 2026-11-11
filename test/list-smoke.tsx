import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { SessionList } from "../src/session-list.tsx"
import type { SessionBranch } from "../src/session-tree.ts"
import type { Activity } from "../src/activity.ts"
import { revealSession } from "../src/reveal-session.ts"
import { copy } from "../src/copy.ts"
import { session } from "./data-fixtures.ts"

/** Only mock rows and native DOM, never navigates or changes real session history. */
export async function runListSmoke() {
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  const paint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  const make = (prefix: string, count: number): SessionBranch[] => Array.from({ length: count }, (_, i) => ({ session: session(`${prefix}-${i}`, '/mock'), children: [] }))
  const initial = make('root', 25)
  initial[0].children = make('first-fork', 12)
  initial[20].children = make('fork', 25)
  initial[20].children[20].children = make('deep', 12)
  const [nodes, setNodes] = createSignal(initial)
  const [statuses, setStatuses] = createSignal(new Map<string, Activity>())
  const [closed, setClosed] = createSignal(new Set<string>())
  const [projectClosed, setProjectClosed] = createSignal(false)
  const [locale, setLocale] = createSignal('en')
  const host = document.createElement('div')
  host.setAttribute('data-projects-sidebar-root', '')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:280px;height:200px;overflow:auto'
  document.body.append(host)
  const collapse = (id: string, value: boolean) => setClosed((prev) => { const next = new Set(prev); value ? next.add(id) : next.delete(id); return next })
  const dispose = render(() => <details data-psb-group="mock-project" open={!projectClosed()}><summary>Mock project</summary>
    <SessionList nodes={nodes()} text={copy(locale())} activity={(info) => statuses().get(info.id)} collapsed={(id) => closed().has(id)} collapse={collapse}
      row={(info, branch) => <div class="psb-session-row"><button type="button" data-psb-session={info().id} data-psb-server="mock">{info().id}</button>
        <button type="button" class="mock-toggle" onClick={() => branch.toggle()}>Toggle</button></div>} />
  </details>, host)
  const list = (id?: string) => id ? host.querySelector<HTMLUListElement>(`[data-psb-tree-node="${id}"] > ul`)! : host.querySelector<HTMLUListElement>('details > ul')!
  const more = (ul: Element) => ul.querySelector<HTMLButtonElement>(':scope > .psb-show-more-row > button')
  const marker = (ul: Element) => more(ul)?.querySelector<HTMLElement>('.psb-more-activity')
  const visible = (ul: Element) => [...ul.children].filter((el) => el.hasAttribute('data-psb-tree-node') && !(el as HTMLElement).hidden)
  const state = async (entries: [string, Activity][]) => { setStatuses(new Map(entries)); await paint() }
  try {
    await paint()
    const root = list(), first = list('root-0')
    const stable = root.querySelector('[data-psb-session="root-0"]')
    check(visible(root).length === 10 && visible(first).length === 10, 'Project shows ten roots independently of its visible forks; fork siblings have their own ten-row limit')
    check(more(root)?.textContent?.trim() === 'Show more' && !marker(root), 'Show more appears only for excess siblings with no invented activity marker')
    await state([['root-0', 'approval']])
    check(!marker(root), 'Visible-session requests do not mark the hidden portion')
    await state([['deep-11', 'ready']])
    check(marker(root)?.dataset.psbActivity === 'ready' && marker(list('root-20'))?.dataset.psbActivity === 'ready', 'Unread descendant hidden behind multiple list limits marks every enclosing Show more')
    await state([['deep-11', 'ready'], ['root-11', 'running']])
    check(marker(root)?.dataset.psbActivity === 'running' && !!marker(root)?.querySelector('svg'), 'Hidden running sessions display the native-style working indicator ahead of unread dots')
    await state([['deep-11', 'input'], ['root-11', 'running']])
    check(marker(root)?.dataset.psbActivity === 'input' && more(root)?.title.includes(copy('en').input), 'Hidden answer request takes priority and explains itself in the tooltip')
    await state([['deep-11', 'input'], ['root-11', 'approval']])
    check(marker(root)?.dataset.psbActivity === 'approval', 'Permission approval has priority across hidden siblings and descendants')
    more(root)!.click(); await paint()
    check(visible(root).length === 20 && marker(root)?.dataset.psbActivity === 'input' && root.querySelector('[data-psb-session="root-0"]') === stable, 'Show more reveals the next ten roots without remounting existing rows, and recomputes remaining hidden activity')
    more(first)!.click(); await paint()
    check(visible(first).length === 12 && !more(first) && visible(root).length === 20, 'Fork pagination is independent of the project list and disappears at the end')
    collapse('root-20', true); collapse('fork-20', true); setProjectClosed(true); await paint()
    const cancel = revealSession(host, { server: 'mock', id: 'deep-11' }, () => setProjectClosed(false), (key, value) => collapse(JSON.parse(key)[1], value))
    await paint(); cancel()
    const target = host.querySelector<HTMLElement>('[data-psb-session="deep-11"]')!
    check(!projectClosed() && !closed().size && visible(root).length === 25 && visible(list('root-20')).length === 25 && visible(list('fork-20')).length === 12, 'Popup reveal opens project, fork branches and every Show more page needed for the exact target')
    check(target.getBoundingClientRect().height > 0 && !more(root) && !more(list('root-20')), 'Revealed popup target is visible rather than trapped in paginated ancestors')
    setNodes([...nodes()]); await paint()
    check(visible(root).length === 25 && root.querySelector('[data-psb-session="root-0"]') === stable, 'History refresh retains expanded page sizes and stable row identity')
    const additional = make('additional', 10)
    setNodes([...nodes(), ...additional]); await paint()
    setLocale('ru'); host.dir = 'rtl'; await paint()
    check(more(root)?.textContent?.trim() === 'Показать ещё' && getComputedStyle(more(root)!).direction === 'rtl', 'Show more uses localized copy and logical RTL layout')
    more(root)!.click(); await paint()
    check(visible(root).length === 35 && !more(root), 'New loaded siblings respect the retained page size and reveal the remaining batch')
    return results
  } finally { dispose(); host.remove() }
}
