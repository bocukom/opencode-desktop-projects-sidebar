/** Reveal only the selected popup target, preserving unrelated collapse preferences.
 * Scroll the history viewport, never the document or the chat transcript. */
export function revealSession(history: HTMLElement, target: { server: string; id: string }, collapse: (key: string, closed: boolean) => void, collapseFork: (key: string, closed: boolean) => void) {
  const row = [...history.querySelectorAll<HTMLElement>('[data-psb-session]')].find((node) => node.dataset.psbSession === target.id && node.dataset.psbServer === target.server)
  if (!row) return () => {}
  const view = history.ownerDocument.defaultView!
  for (let parent = row.parentElement; parent && parent !== history; parent = parent.parentElement) {
    if (parent.matches('li[data-psb-tree-node]') && parent.parentElement?.hasAttribute('data-psb-session-list')) {
      parent.parentElement.dispatchEvent(new view.CustomEvent('psb-reveal-session', { detail: parent.dataset.psbTreeNode }))
    }
    if (parent.matches('details[data-psb-group]')) collapse(parent.dataset.psbGroup!, false)
    // A nested list is owned by its source's tree node. Do not expand the target's own children.
    if (parent.matches('ul.psb-fork-children')) {
      const source = parent.parentElement?.dataset.psbTreeNode
      if (source) collapseFork(JSON.stringify([target.server, source]), false)
    }
  }
  const frame = view.requestAnimationFrame(() => {
    if (!history.isConnected || !row.isConnected) return
    const viewport = history.getBoundingClientRect()
    const rect = row.getBoundingClientRect()
    if (rect.height === 0) return
    if (rect.top < viewport.top) history.scrollTop += rect.top - viewport.top
    else if (rect.bottom > viewport.bottom) history.scrollTop += rect.bottom - viewport.bottom
  })
  return () => view.cancelAnimationFrame(frame)
}
