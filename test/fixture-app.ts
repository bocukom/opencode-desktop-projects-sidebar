import { installPrototype } from "../src/adapter.ts"
import { copy } from "../src/copy.ts"
import { mountFixture } from "./fixture-markup.ts"
import { demoList } from "./demo-list.ts"
import "../src/style.css"
import "./fixture.css"

mountFixture(document)
let enabled = false
const adapter = installPrototype({
  document, enabled: () => enabled,
  setEnabled: (value) => {
    enabled = value
    document.querySelector("#fixture-state")!.textContent = `Plugin enabled: ${value}`
  },
  copy: () => copy("en"),
  mountList: (container) => demoList(container, () => { enabled = false; adapter.refresh() }),
})
document.querySelector("#fixture-dispose")!.addEventListener("click", () => adapter.dispose())
