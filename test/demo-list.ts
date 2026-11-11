/** Synthetic content for DOM-adapter tests only; not included in the plugin bundle. */
export function demoList(container: HTMLElement, restore: () => void = () => {}, ru = false) {
  const doc = container.ownerDocument
  const notice = doc.createElement("p")
  notice.textContent = ru ? "Демонстрация — не настоящие чаты" : "Demo only — these are not real chats"
  container.append(notice)
  for (const name of ["Example A", "Example B"]) {
    const details = doc.createElement("details")
    details.open = true
    const summary = doc.createElement("summary")
    summary.textContent = name
    details.append(summary)
    container.append(details)
  }
  const button = doc.createElement("button")
  button.textContent = "Restore Inbox"
  button.addEventListener("click", restore)
  container.append(button)
  return () => container.replaceChildren()
}
