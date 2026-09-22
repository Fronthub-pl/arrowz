import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { audit, type Invariant } from '../harness/invariants'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { storedFixture } from '../state/library.fixtures'
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

type State =
  | 'board'
  | 'presets-open'
  | 'preview-palette'
  | 'lengths-help-off'
  | 'violations'
  | 'simple'
  | 'library-empty'
  | 'library-detail'
  | 'docs'
const STATES: readonly State[] = [
  'board',
  'presets-open',
  'preview-palette',
  'lengths-help-off',
  'violations',
  'simple',
  'library-empty',
  'library-detail',
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
const KNOWN_RED: Partial<Record<string, readonly Invariant[]>> = {}
// Later regressions are listed here, keyed by `${state}@${w}x${h}`, with a trailing comment naming a defect id.

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  // The view slice has no reset (mountApp.tsx); put back what a case moved,
  // through `setState` and not through a slice action (harness fact 40).
  useStore.setState((s) => ({ view: { ...s.view, palette: [] } }))
  // The Polish pass below leaves the page in `pl`; `resetApp`'s own
  // `setLang('en')` runs at the start of the next case's `arrange`, but a
  // case that throws before that point must not leave `pl` behind either.
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'en' } }))
  vi.restoreAllMocks()
})

async function arrange(state: State) {
  resetApp(state === 'simple' ? 'simple' : 'advanced')
  if (state === 'library-empty') {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no store'))
    window.history.pushState({}, '', '/boards')
  }
  if (state === 'library-detail') {
    // The one board this fixture builds, listed under its own size: enough
    // for `useStoredBoard` (Workspace.tsx) to find the address's board in the
    // listing and fetch its file, the same round trip
    // `Workspace.browser.test.tsx`'s "a stored board can be opened…" case
    // drives through the real store URLs rather than by calling `showPreview`
    // directly — this is `.fw-lib-detail` reached the way a person reaches
    // it, not summoned by hand.
    const stored = storedFixture(1)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.includes('/api/boards')) {
        return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }]))
      }
      if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
      return Promise.resolve(new Response('{}', { status: 404 }))
    })
    window.history.pushState({}, '', `/boards/8x8/${stored.meta.id}`)
  }
  if (state === 'docs') window.history.pushState({}, '', '/docs/cli')
  const screen = await render(<App />)
  if (state !== 'library-empty' && state !== 'library-detail' && state !== 'docs') await loadRunDone()
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
    // Fix round 2: with help on, `BoardDetail`'s head-height help list never
    // renders `.fw-vh` at all, so this state could not have caught the gap
    // it exists to catch (no positioned ancestor for the hidden text inside
    // `.fw-lib-detail`'s scroller). `resetApp` sets help back to `true` at
    // the top of every case's own `arrange`, so this does not leak into the
    // next state.
    if (state === 'library-detail') {
      s.ui.setHelp(false)
    }
    if (state === 'violations') {
      s.params.setMany({ wShort: 0.8, wMid: 0.8 })
      s.ui.raiseClamped(true)
    }
  })
  if (state === 'library-detail') {
    // `useStoredBoard`'s fetch of the board file is asynchronous, so the
    // detail is not there the instant `render` returns — this is the wait
    // the task calls for, in place of `loadRunDone` (skipped above: this
    // state cares about the board the address opened, not the lab's own
    // load run).
    await expect.poll(() => screen.container.querySelector('.fw-lib-detail')).not.toBeNull()
  }
  if (state === 'presets-open') {
    await screen.getByRole('button', { name: /^preset/ }).click()
    await expect.poll(() => screen.container.querySelector('.fw-pp-panel:not([hidden])')).not.toBeNull()
  }
  return screen
}

/** One frame for the layout that followed the last store write, then the
 * settled layout: a rail tab selected in `arrange` is still mid-way through
 * its 120ms background transition one frame later. */
async function settle(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await Promise.all(
    document
      .getAnimations()
      .filter((a) => a instanceof CSSTransition)
      .map((a) => a.finished.catch(() => undefined)),
  )
}

test.each(STATES.flatMap((state) => SIZES.map(([w, h]) => [state, w, h] as const)))(
  'the %s state at %d×%d keeps every layout invariant',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    await settle()
    // `library-detail` keeps `board: true` (the default this excludes only
    // 'library-empty' and 'docs' from): `BoardFrame.tsx` draws `.fw-board`
    // on both tabs, and on this one it is the stored board `useStoredBoard`
    // just fetched (`inLibrary ? preview : result`) — a real picture inside
    // `.fw-boardwrap`, worth clipping the same way the lab's own board is.
    // 'library-empty' and 'docs' have no board to check: the empty store
    // never gets a preview, and the docs route hides the whole workspace.
    const board = state !== 'library-empty' && state !== 'docs'
    const findings = audit(screen.container, { board })
    const failing = [...new Set(findings.map((f) => f.invariant))].sort()
    const expected = [...(KNOWN_RED[`${state}@${w}x${h}`] ?? [])].sort()
    expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual(expected)
  },
  40_000,
)

// The matrix above does not pin the panel's `max-height`: at 420×900 its
// seven levels in two columns (650px under a 171px top) fit without it. A
// window 700px tall is where they run past the bottom (measured: 16,171 to
// 404,821 in 420×700 with the rule removed), so this one case pins the rule.
test('the presets-open state at 420×700 keeps every layout invariant', async () => {
  await page.viewport(420, 700)
  const screen = await arrange('presets-open')
  await settle()
  const findings = audit(screen.container, { board: true })
  const failing = [...new Set(findings.map((f) => f.invariant))].sort()
  expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual([])
}, 40_000)

// Review P8: the reconstruction's matrix above runs only in English, where
// the bar fits by 1px at 420 wide; the language switch's own chip is what a
// Polish "Zaawansowany" (spec §2, review P8) pushes past `.fw-top`'s
// `overflow: hidden`. Two sizes, not the whole matrix crossed with `lang`,
// to keep this file's runtime reasonable: 420×900 is R2's narrowest
// supported width (where the defect shows), 1280×800 is a size the matrix
// already covers in English, as a sanity check that Polish keeps every
// invariant there too.
const LANG_CASES: readonly (readonly [State, number, number])[] = [
  ['board', 420, 900],
  ['board', 1280, 800],
]

test.each(LANG_CASES)(
  'the %s state at %d×%d keeps every layout invariant in Polish',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    await act(async () => useStore.getState().lang.setLang('pl'))
    await settle()
    const findings = audit(screen.container, { board: true })
    const failing = [...new Set(findings.map((f) => f.invariant))].sort()
    expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual([])
    // Live pass, ≤480px: `.dims` gives way (shell.css), and its own `.sep`
    // used to stay rendered with nothing left to separate — an orphaned "/"
    // ahead of the right group's `margin-left: auto` gap. `TopBar.browser.
    // test.tsx` renders no stylesheet and sets no viewport, so this asserts
    // here instead, on the bar's own left cluster (mark, name, seps, preset,
    // dims), which is where the defect showed.
    const bar = screen.container.querySelector('.fw-top')
    if (bar === null) throw new Error('top bar missing')
    const clusterText = [...bar.querySelectorAll('.name, .sep, .preset, .dims')]
      .filter((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: false }))
      .map((el) => el.textContent ?? '')
      .join('')
    expect(clusterText.endsWith('/')).toBe(false)
  },
  40_000,
)

// Review P7: an unreachable store left the chips' 168px track standing empty.
test('an unreachable store drops the saved-boards console to one column', async () => {
  await page.viewport(1280, 800)
  const screen = await arrange('library-empty')
  await expect.poll(() => useStore.getState().library.listError).not.toBeNull()
  const chips = screen.container.querySelector('.fw-lib-chips')
  const list = screen.container.querySelector('.fw-lib-list')
  const console_ = screen.container.querySelector('.fw-console')
  if (chips === null || list === null || console_ === null) throw new Error('library face missing')
  expect(chips.checkVisibility()).toBe(false)
  expect(list.getBoundingClientRect().width).toBeCloseTo(console_.getBoundingClientRect().width, 0)
}, 40_000)
