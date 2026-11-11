import { createSignal } from "solid-js"
import { render } from "solid-js/web"
import { HistoryLoading } from "../src/history-loading.tsx"
import { copy } from "../src/copy.ts"

export async function runHistoryLoadingSmoke() {
  const host = document.createElement('div')
  host.hidden = true
  document.body.append(host)
  const [loading, setLoading] = createSignal(true)
  const [loaded, setLoaded] = createSignal(0)
  const [locale, setLocale] = createSignal('en')
  const dispose = render(() => <HistoryLoading loading={loading()} loaded={loaded()} label={copy(locale()).loading} />, host)
  const results: string[] = []
  const check = (ok: unknown, label: string) => { if (!ok) throw new Error(label); results.push(label) }
  try {
    check(host.textContent === 'Loading history…', 'Empty history still announces its initial loading')
    setLocale('ru')
    check(host.textContent === 'Загрузка истории…', 'Initial history loading remains localized')
    setLoaded(37)
    check(host.childElementCount === 0, 'Loaded history never renders the loading text during background refresh')
    for (let i = 0; i < 5; i++) { setLoading(false); setLoading(true) }
    check(host.childElementCount === 0, 'Repeated background refreshes do not flash a loading message')
    setLoading(false); setLoaded(0)
    check(host.childElementCount === 0, 'An idle empty history does not show a loading message')
    setLoading(true)
    check(host.textContent === 'Загрузка истории…', 'Loading a genuinely empty history still has feedback')
  } finally { dispose(); host.remove() }
  return results
}
