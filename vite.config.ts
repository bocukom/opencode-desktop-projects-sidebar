import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig(({ mode }) => ({
  plugins: [gui(mode === "smoke" ? { entry: "test/smoke-gui.ts" } : mode === "footer-smoke" ? { entry: "test/footer-gui.tsx" } : mode === "compatibility-smoke" ? { entry: "test/compatibility-gui.ts" } : {})],
}))
