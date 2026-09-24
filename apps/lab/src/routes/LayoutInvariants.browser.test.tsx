import { newSession, PARAM_SPEC, type Params, play } from '@arrowz/engine'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { contrast, shown } from '../design/contrast'
import { audit, type Finding, type Invariant } from '../harness/invariants'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { settleTransitions as settle } from '../harness/settle'
import { storedFixture } from '../state/library.fixtures'
import type { Sheet } from '../state/ui.slice'
import { useStore } from '../state/store'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'
import '../design/library.css'
import '../design/run.css'
import '../design/report.css'
import '../design/docs.css'
import '../design/palette.css'

// The layout audit's invariants over every lab state that once broke them.
// The same import order as `main.tsx`.

type State =
  | 'board'
  | 'presets-open'
  | 'report-open'
  | 'settings-closed'
  | 'preview-palette'
  | 'lengths-help-open'
  | 'violations'
  | 'simple'
  | 'library-empty'
  | 'library-detail'
  | 'docs'
  | 'solo'
  | 'solo-sheet'
  | 'sheet-settings'
  | 'sheet-cli'
  | 'sheet-report'
  | 'library-sheet-cli'
  | 'menu-open'
  | 'more-open'
  | 'inspect'
  | 'play'
const STATES: readonly State[] = [
  'board',
  'presets-open',
  'report-open',
  'settings-closed',
  'preview-palette',
  'lengths-help-open',
  'violations',
  'simple',
  'library-empty',
  'library-detail',
  'docs',
  'solo',
]

/** States that exist only in some bands, each run at its own sizes. */
const BANDED: readonly (readonly [State, number, number])[] = [
  ...(['sheet-settings', 'sheet-cli', 'sheet-report', 'library-sheet-cli', 'menu-open', 'solo-sheet'] as const).flatMap(
    (s) =>
      (
        [
          [600, 900],
          [375, 812],
        ] as const
      ).map(([w, h]) => [s, w, h] as const),
  ),
  ...(
    [
      [1024, 768],
      [924, 540],
      [768, 1024],
    ] as const
  ).map(([w, h]) => ['more-open', w, h] as const),
]

const SIZES: readonly (readonly [number, number])[] = [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [924, 540],
  [768, 1024],
  [600, 900],
  [375, 812],
]

/**
 * What fails today, per invariant, keyed by `${state}@${w}x${h}` (a Polish
 * case adds `:pl`; the two single cases below have their own keys). A fix
 * deletes its invariants here first, watches the cases go red, then fixes
 * them, and drops a key whose list is empty. The comparison is exact both
 * ways, so an entry left behind after its fix is red too.
 */
const KNOWN_RED: Partial<Record<string, readonly Invariant[]>> = {}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  // The view slice has no reset; put back what a case moved via setState, not
  // via a slice action, so the reset cannot hide that action's bugs.
  useStore.setState((s) => ({ view: { ...s.view, palette: [] } }))
  // The Polish pass below leaves the page in `pl`; `resetApp`'s own
  // `setLang('en')` runs at the start of the next case's `arrange`, but a
  // case that throws before that point must not leave `pl` behind either.
  useStore.setState((s) => ({ lang: { ...s.lang, lang: 'en' } }))
  useStore.setState((s) => ({ ui: { ...s.ui, report: false } }))
  vi.restoreAllMocks()
})

/** The store lists one 8×8 board and serves its file (the `library-*` detail states). */
function stubStoredBoard() {
  const stored = storedFixture(1)
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/api/boards')) {
      return Promise.resolve(Response.json([{ size: '8x8', W: 8, H: 8, cells: 64, boards: [stored.meta] }]))
    }
    if (url.includes('/store/')) return Promise.resolve(Response.json(stored.file))
    return Promise.resolve(new Response('{}', { status: 404 }))
  })
  return stored
}

async function arrange(state: State) {
  resetApp(state === 'simple' ? 'simple' : 'advanced')
  if (state === 'library-empty') {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('no store'))
    window.history.pushState({}, '', '/boards')
  }
  if (state === 'library-detail' || state === 'library-sheet-cli') {
    // The one board this fixture builds, listed under its own size: enough for
    // `useStoredBoard` to find the address's board and fetch its file, so the
    // open board's column is reached the way a person reaches it.
    const stored = stubStoredBoard()
    window.history.pushState({}, '', `/boards/8x8/${stored.meta.id}`)
  }
  if (state === 'docs') window.history.pushState({}, '', '/docs/cli')
  const screen = await render(<App />)
  if (state !== 'library-empty' && state !== 'library-detail' && state !== 'library-sheet-cli' && state !== 'docs')
    await loadRunDone()
  await act(async () => {
    const s = useStore.getState()
    if (state === 'report-open') s.ui.setReport(true)
    // The settings drawer is open in every other state (`resetApp`); this one
    // reads the closed face.
    if (state === 'settings-closed') s.ui.setSettings(false)
    if (state === 'preview-palette') {
      s.ui.select('preview')
      for (let i = 0; i < 8; i++) s.view.addPaletteColor()
    }
    // Every row's description is closed by default, out of sight in `.fw-vh`,
    // which needs the panel as its positioned ancestor. This one opens them all.
    if (state === 'lengths-help-open') s.ui.select('lengths')
    if (state === 'violations') {
      s.params.setMany({ wShort: 0.8, wMid: 0.8 })
      s.ui.raiseClamped(true)
    }
    if (state === 'solo') s.ui.setSolo(true)
    if (state === 'solo-sheet') {
      s.ui.setSolo(true)
      s.ui.setSheet('settings')
    }
    if (state === 'sheet-settings' || state === 'sheet-cli' || state === 'sheet-report')
      s.ui.setSheet(state.slice(6) as Sheet)
    if (state === 'menu-open') s.ui.setMenu(true)
  })
  if (state === 'library-detail' || state === 'library-sheet-cli') {
    // `useStoredBoard`'s fetch of the board file is asynchronous, so wait for
    // the detail; `loadRunDone` is skipped, because this state is about the
    // board the address opened, not the lab's own load run.
    await expect.poll(() => screen.container.querySelector('.fw-bcol .fw-cmdfig')).not.toBeNull()
  }
  if (state === 'library-sheet-cli') await act(async () => useStore.getState().ui.setSheet('cli'))
  if (state === 'inspect' || state === 'play') await showBoardMode(screen.container, state)
  if (state === 'lengths-help-open') {
    await expect.poll(() => screen.container.querySelectorAll('.kv-g .q').length).toBeGreaterThan(0)
    for (const q of screen.container.querySelectorAll<HTMLButtonElement>('.kv-g .q')) q.click()
    await expect.poll(() => screen.container.querySelectorAll('.kv-help.fw-vh').length).toBe(0)
  }
  if (state === 'presets-open') {
    await screen.getByRole('button', { name: /^preset/ }).click()
    await expect.poll(() => screen.container.querySelector('.fw-pp-panel:not([hidden])')).not.toBeNull()
  }
  if (state === 'more-open') {
    // A DOM click, not the locator's: the button is `display: none` outside the
    // bands that show the bar, and a locator click waits 40s for a visible element.
    await act(async () => screen.container.querySelector<HTMLButtonElement>('.fw-more')?.click())
    await expect.poll(() => screen.container.querySelector('.fw-more-pop.open')).not.toBeNull()
  }
  return screen
}

/**
 * The board mode with its line on screen: in Inspect the card of a blocked
 * piece, the longest the card gets; in Play the counts after one mistake.
 */
async function showBoardMode(container: HTMLElement, mode: 'inspect' | 'play') {
  await act(async () => useStore.getState().ui.setBoardMode(mode))
  const element = container.querySelector('arrowz-board')
  const board = useStore.getState().result.shown?.board
  if (element === null || board === undefined) throw new Error('no board on stage')
  const session = newSession(board)
  const blocked = board.pieces.find((pc) => play(session, pc.id).move.kind === 'bounce') ?? board.pieces[0]
  if (blocked === undefined) throw new Error('an empty board')
  const fire = (type: string, detail: unknown) =>
    element.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  await act(async () => {
    if (mode === 'inspect') fire('piece-click', { pieceId: blocked.id })
    else fire('life-lost', { pieceId: blocked.id, blockerId: 0, distance: 0 })
  })
  await expect.poll(() => container.querySelector('.fw-modeline')).not.toBeNull()
}

/** Asserts the audit's failing invariants are exactly those `KNOWN_RED` records under `key`. */
function expectKnownRed(key: string, findings: readonly Finding[]) {
  const failing = [...new Set(findings.map((f) => f.invariant))].sort()
  const expected = [...(KNOWN_RED[key] ?? [])].sort()
  expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual(expected)
}

async function matrixCase(state: State, w: number, h: number) {
  await page.viewport(w, h)
  const screen = await arrange(state)
  await settle()
  // `library-detail` keeps `board: true`: `BoardFrame` draws `.fw-board` on
  // both tabs, here the stored board just fetched, worth clipping like the
  // lab's own. 'library-empty' and 'docs' have no board: the empty store never
  // gets a preview, and the docs route hides the whole workspace.
  const board = state !== 'library-empty' && state !== 'docs'
  const findings = audit(screen.container, { board, solo: state === 'solo' || state === 'solo-sheet' })
  expectKnownRed(`${state}@${w}x${h}`, findings)
}

test.each(STATES.flatMap((state) => SIZES.map(([w, h]) => [state, w, h] as const)))(
  'the %s state at %d×%d keeps every layout invariant',
  matrixCase,
  40_000,
)

test.each(BANDED)('the banded %s state at %d×%d keeps every layout invariant', matrixCase, 40_000)

// The board mode's line is on screen only in Inspect and Play, so the matrix
// above sees the control but never the line: the lab's three widths and a
// phone, and the two narrowest again in Polish, where the words are longer.
const MODE_CASES: readonly (readonly [State, number, number])[] = (['inspect', 'play'] as const).flatMap((s) =>
  (
    [
      [860, 900],
      [1280, 800],
      [1400, 900],
      [375, 812],
      [924, 540],
      [1280, 699],
    ] as const
  ).map(([w, h]) => [s, w, h] as const),
)

test.each(MODE_CASES)('the %s mode at %d×%d keeps every layout invariant', matrixCase, 40_000)

const MODE_PL_CASES: readonly (readonly [State, number, number])[] = (['inspect', 'play'] as const).flatMap((s) =>
  (
    [
      [860, 900],
      [375, 812],
    ] as const
  ).map(([w, h]) => [s, w, h] as const),
)

test.each(MODE_PL_CASES)(
  'the %s mode at %d×%d keeps every layout invariant in Polish',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    await act(async () => useStore.getState().lang.setLang('pl'))
    await settle()
    expectKnownRed(`${state}@${w}x${h}:pl`, audit(screen.container, { board: true }))
  },
  40_000,
)

// The annotation grows with the seed and the language: a ten-digit seed in
// Polish on a phone is the longest it gets beside the mode control. The seed
// is carved, not written into the store, so the annotation is a run's.
const LONG_SEED = 4_294_967_295
test.each(['inspect', 'play'] as const)(
  'the %s mode at 375×812 in Polish with a ten-digit seed keeps every layout invariant',
  async (state) => {
    await page.viewport(375, 812)
    const screen = await arrange('board')
    await act(async () => useStore.getState().params.setMany({ seed: LONG_SEED }))
    await act(async () => screen.container.querySelector<HTMLButtonElement>('.fw-go')?.click())
    await expect.poll(() => useStore.getState().result.shown?.params.seed, { timeout: 30_000 }).toBe(LONG_SEED)
    await showBoardMode(screen.container, state)
    await act(async () => useStore.getState().lang.setLang('pl'))
    await settle()
    expect(screen.container.querySelector('.fw-anno')?.textContent).toMatch(/ziarno 4294967295$/)
    expectKnownRed(`${state}@375x812:pl:long-seed`, audit(screen.container, { board: true }))
  },
  40_000,
)

// The matrix above does not pin the panel's `max-height`: at 420×900 it fits
// without it. At a short window the panel stays on screen by its own
// `max-height: calc(100vh - 276px)` under `max-width: 767px`, gated on width,
// not on band.ts's low-window height query. 699 and 700 straddle that query's
// edge, so neither band may lose the rule.
test('the presets-open state at 420×699 keeps every layout invariant', async () => {
  await page.viewport(420, 699)
  const screen = await arrange('presets-open')
  await settle()
  expectKnownRed('presets-open@420x699', audit(screen.container, { board: true }))
}, 40_000)

test('the presets-open state at 420×700 keeps every layout invariant', async () => {
  await page.viewport(420, 700)
  const screen = await arrange('presets-open')
  await settle()
  expectKnownRed('presets-open@420x700', audit(screen.container, { board: true }))
}, 40_000)

// The matrix above runs only in English, where the bar fits by 1px at 420 wide;
// the language chip's Polish "Zaawansowany" pushes past `.fw-top`'s
// `overflow: hidden`. Two sizes, not the whole matrix crossed with `lang`, for
// runtime: 420×900, the narrowest supported width, and 1280×800 as a sanity check.
const LANG_CASES: readonly (readonly [State, number, number])[] = [
  ['board', 420, 900],
  ['board', 1280, 800],
  ['board', 1024, 768],
  ['board', 768, 1024],
  ['presets-open', 924, 540],
  ['board', 375, 812],
  ['more-open', 1024, 768],
]

test.each(LANG_CASES)(
  'the %s state at %d×%d keeps every layout invariant in Polish',
  async (state, w, h) => {
    await page.viewport(w, h)
    const screen = await arrange(state)
    await act(async () => useStore.getState().lang.setLang('pl'))
    await settle()
    expectKnownRed(`${state}@${w}x${h}:pl`, audit(screen.container, { board: true }))
    // ≤480px: `.dims` gives way, and its own `.sep` must not stay rendered
    // with nothing left to separate. `TopBar`'s own test loads no stylesheet
    // and sets no viewport, so this asserts here, on the bar's left cluster.
    const bar = screen.container.querySelector('.fw-top')
    if (bar === null) throw new Error('top bar missing')
    const clusterText = [...bar.querySelectorAll('.name, .sep, .dims')]
      .filter((el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: false }))
      .map((el) => el.textContent ?? '')
      .join('')
    expect(clusterText.endsWith('/')).toBe(false)
  },
  40_000,
)

// The longest trigger the picker can print: Huge's "winding skeleton" in
// Polish, at the narrowest width the lab supports. The knobs are written as
// `applyPreset` writes them but without its run, which at 400×400 would only
// slow the case down: the trigger reads the knobs.
test('the Polish trigger naming Huge winding skeleton at 420×900 keeps every layout invariant', async () => {
  await page.viewport(420, 900)
  const screen = await arrange('board')
  const option = PRESETS.flatMap((level) => level.options).find((o) => o.id === 'huge-400-serpentine')
  if (option === undefined) throw new Error('no huge-400-serpentine preset')
  await act(async () => {
    const s = useStore.getState()
    s.lang.setLang('pl')
    const full: Partial<Params> = {}
    for (const spec of PARAM_SPEC) full[spec.key] = option.params[spec.key] ?? spec.def
    s.params.setMany(full)
  })
  await settle()
  expect(findPreset(useStore.getState().params.values)?.id).toBe('huge-400-serpentine')
  const trigger = screen.getByRole('button', { name: /^preset/i })
  await expect.element(trigger).toMatchTextContent(/Ogromny szkielet z serpentynami/)
  await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
  expectKnownRed('huge-pl@420x900', audit(screen.container, { board: true }))
}, 40_000)

// An unreachable store leaves SIZES with no tab, the rail keeps Preview, and
// the panel says why rather than standing empty.
test('an unreachable store keeps the rail to Preview and says why in the panel', async () => {
  await page.viewport(1280, 800)
  const screen = await arrange('library-empty')
  await expect.poll(() => useStore.getState().library.listError).not.toBeNull()
  await expect.element(screen.getByText(/No store server/)).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Preview' }).elements()).toHaveLength(1)
  expect(screen.container.querySelectorAll('.fw-rail [role="tab"]')).toHaveLength(1)
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
}, 40_000)

// The bar's hover is a fill, like every other chip in the lab: the exact token
// `--signal-fill-hover`, which must clear AA under `--ink`. Measured here and
// not in `LabLayout.browser.test.tsx`, because this file loads the full
// cascade `main.tsx` does, `palette.css` included.
test('a hovered choice in the top bar is filled, not underlined, and still reads at AA', async () => {
  await page.viewport(1400, 900)
  const screen = await arrange('board')
  await settle()
  // Two locators written out: `getByRole` takes the ARIA role union, so a
  // role held in a `string` variable fails `lab:check`.
  const controls = [
    ['Simple', screen.getByRole('radio', { name: 'Simple' })],
    ['⌘K', screen.getByRole('button', { name: 'Command palette (⌘K)' })],
  ] as const
  for (const [name, control] of controls) {
    await userEvent.hover(control)
    // The segmented buttons carry the shared chip's 120ms background
    // transition; read right after the pointer event, the style is still
    // mid-animation. `settle` waits it out.
    await settle()
    const el = control.element()
    const style = getComputedStyle(el)
    expect(style.textDecorationLine, name).toBe('none')
    expect(style.backgroundColor, name).toBe('rgb(85, 97, 200)')
    const { front, back } = shown(el)
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
}, 40_000)

// A `KNOWN_RED` key nobody generates masks nothing and says nothing: a typo'd
// key would leave its case red while the entry reads as recorded. Every key
// must be one a case in this file asks for.
test('every KNOWN_RED key names a case this file runs', () => {
  const keys = new Set([
    ...STATES.flatMap((state) => SIZES.map(([w, h]) => `${state}@${w}x${h}`)),
    ...BANDED.map(([state, w, h]) => `${state}@${w}x${h}`),
    ...LANG_CASES.map(([state, w, h]) => `${state}@${w}x${h}:pl`),
    ...MODE_CASES.map(([state, w, h]) => `${state}@${w}x${h}`),
    ...MODE_PL_CASES.map(([state, w, h]) => `${state}@${w}x${h}:pl`),
    'inspect@375x812:pl:long-seed',
    'play@375x812:pl:long-seed',
    'presets-open@420x699',
    'presets-open@420x700',
    'huge-pl@420x900',
  ])
  expect(Object.keys(KNOWN_RED).filter((key) => !keys.has(key))).toEqual([])
})
