import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { audit, type Invariant } from '../harness/invariants'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'
import '../design/palette.css'

// Spec R1: the review's four measurements plus two of its findings, over
// every state it found a defect in. The same import order as `main.tsx`.

type State = 'board' | 'preview-palette' | 'lengths-help-off' | 'violations' | 'simple' | 'library-empty' | 'docs'
const STATES: readonly State[] = [
  'board',
  'preview-palette',
  'lengths-help-off',
  'violations',
  'simple',
  'library-empty',
  'docs',
]
const SIZES: readonly (readonly [number, number])[] = [
  [1400, 900],
  [1280, 800],
  [1024, 768],
  [860, 900],
  [420, 900],
]

/**
 * What fails today, by defect id (spec §2). A task that fixes a defect
 * deletes its entries here *first*, watches the case go red, then fixes it.
 * The comparison is exact, so an entry left behind after its fix is red too.
 */
const KNOWN_RED: Partial<Record<string, readonly Invariant[]>> = {
  'board@1400x900': ['contrast'], // Signal
  'board@1280x800': ['contrast'], // Signal
  'board@1024x768': ['contrast'], // Signal
  'board@860x900': ['contrast'], // Signal
  'board@420x900': ['contrast', 'scroll'], // contrast Signal, scroll P8

  'preview-palette@1400x900': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'preview-palette@1280x800': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'preview-palette@1024x768': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'preview-palette@860x900': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'preview-palette@420x900': ['contrast', 'scroll', 'ua-button'], // contrast Signal, scroll P8, ua-button P9

  'lengths-help-off@1400x900': ['contrast'], // Signal
  'lengths-help-off@1280x800': ['contrast'], // Signal
  'lengths-help-off@1024x768': ['contrast'], // Signal
  'lengths-help-off@860x900': ['contrast'], // Signal
  'lengths-help-off@420x900': ['contrast', 'scroll'], // contrast Signal, scroll P8

  'violations@1400x900': ['contrast'], // Signal
  'violations@1280x800': ['board-clip', 'contrast'], // board-clip P2, contrast Signal
  'violations@1024x768': ['board-clip', 'contrast'], // board-clip P2, contrast Signal
  'violations@860x900': ['contrast'], // Signal
  'violations@420x900': ['contrast', 'scroll'], // contrast Signal, scroll P8

  'simple@1400x900': ['contrast'], // Signal
  'simple@1280x800': ['contrast'], // Signal
  'simple@1024x768': ['contrast'], // Signal
  'simple@860x900': ['contrast'], // Signal
  'simple@420x900': ['contrast', 'scroll'], // contrast Signal, scroll P8

  'library-empty@1400x900': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'library-empty@1280x800': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'library-empty@1024x768': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'library-empty@860x900': ['contrast', 'ua-button'], // contrast Signal, ua-button P9
  'library-empty@420x900': ['contrast', 'scroll', 'ua-button'], // contrast Signal, scroll P8, ua-button P9

  'docs@1400x900': ['contrast'], // Signal
  'docs@1280x800': ['contrast'], // Signal
  'docs@1024x768': ['contrast'], // Signal
  'docs@860x900': ['contrast'], // Signal
  'docs@420x900': ['contrast', 'scroll'], // contrast Signal, scroll P8
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  // The view slice has no reset (mountApp.tsx); put back what a case moved,
  // through `setState` and not through a slice action (harness fact 40).
  useStore.setState((s) => ({ view: { ...s.view, palette: [] } }))
  vi.restoreAllMocks()
})

async function arrange(state: State) {
  resetApp(state === 'simple' ? 'simple' : 'advanced')
  if (state === 'library-empty') {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no store'))
    window.history.pushState({}, '', '/boards')
  }
  if (state === 'docs') window.history.pushState({}, '', '/docs/cli')
  const screen = await render(<App />)
  if (state !== 'library-empty' && state !== 'docs') await loadRunDone()
  await act(async () => {
    const s = useStore.getState()
    if (state === 'preview-palette') {
      s.ui.select('preview')
      for (let i = 0; i < 8; i++) s.view.addPaletteColor()
    }
    if (state === 'lengths-help-off') {
      s.ui.select('lengths')
      s.ui.setHelp(false)
    }
    if (state === 'violations') {
      s.params.setMany({ wShort: 0.8, wMid: 0.8 })
      s.ui.raiseClamped(true)
    }
  })
  return screen
}

test.each(STATES.flatMap((state) => SIZES.map(([w, h]) => [state, w, h] as const)))(
  'the %s state at %d×%d keeps every layout invariant',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    // One frame for the layout that followed the last store write.
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const board = state !== 'library-empty' && state !== 'docs'
    const findings = audit(screen.container, { board })
    const failing = [...new Set(findings.map((f) => f.invariant))].sort()
    const expected = [...(KNOWN_RED[`${state}@${w}x${h}`] ?? [])].sort()
    expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual(expected)
  },
  40_000,
)
