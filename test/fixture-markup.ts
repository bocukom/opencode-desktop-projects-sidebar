export type NativeMode = "top" | "side" | "inbox"

export function mountFixture(doc: Document, initial: NativeMode = "inbox") {
  doc.body.innerHTML = `
    <div id="fixture-shell"><div id="fixture-sidebar"></div><main>
      <h1>Preferences — isolated test fixture</h1>
      <p>This is a test page, not the OpenCode application.</p>
      <fieldset data-component="interface-mode" data-action="settings-tab-layout">
        <legend>Interface</legend>
        ${["top", "side", "inbox"].map((mode) => `
          <label data-slot="interface-mode-option">
            <input type="radio" name="fixture-mode" value="${mode}">
            <span data-slot="interface-mode-sketch" data-mode="${mode}" aria-hidden="true">
              <span data-slot="${mode === "top" ? "preview-strip" : "preview-rail"}"><span data-slot="preview-tab" data-active></span><span data-slot="preview-tab"></span></span>
              <span data-slot="preview-page"><span data-slot="preview-line"></span><span data-slot="preview-line"></span><span data-slot="preview-composer"></span></span>
            </span>
            <span data-slot="interface-mode-name">${mode === "top" ? "Top tabs" : mode === "side" ? "Side tabs" : "Inbox"}</span>
          </label>`).join("")}
      </fieldset>
      <p id="fixture-state"></p><button id="fixture-dispose" type="button">Unload plugin</button>
    </main></div>`

  let mode = initial
  let initialized = false
  function select(next: NativeMode) {
    for (const input of doc.querySelectorAll<HTMLInputElement>('[name="fixture-mode"]')) {
      if (!["top", "side", "inbox"].includes(input.value)) continue
      input.checked = input.value === next
      input.parentElement!.toggleAttribute("data-checked", input.checked)
    }
    if (initialized && next === mode) return
    initialized = true
    mode = next
    const area = doc.querySelector("#fixture-sidebar")!
    if (next === "top") { area.replaceChildren(); return }
    area.innerHTML = `<aside id="vertical-tabs-sidebar" data-slot="vertical-tabs-sidebar" data-state="open">
      <div data-slot="vertical-tabs-mount" style="padding: 8px 10px 8px 18px">
      <header><button type="button">Home</button><button type="button">Search sessions</button><button type="button">New session</button></header>
      <div class="fixture-list">${next === "inbox" ? '<div data-slot="sidebar-inbox"><p>Original Inbox session</p><button type="button">Original session action</button></div>' : '<div data-slot="native-side-tabs">Original side tabs</div>'}</div>
      </div>
    </aside>`
  }
  for (const input of doc.querySelectorAll<HTMLInputElement>('[name="fixture-mode"]')) {
    input.addEventListener("change", () => select(input.value as NativeMode))
  }
  select(initial)
  return { mode: () => mode, select }
}
