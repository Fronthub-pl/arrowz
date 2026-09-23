import { PARAM_SPEC, type Params } from '@arrowz/engine'
import { findPreset, PRESETS } from '@arrowz/engine/presets'
import { act } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { contrast, shown } from '../design/contrast'
import { audit, type Invariant } from '../harness/invariants'
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

// Spec R1: the review's four measurements plus two of its findings, over
// every state it found a defect in. The same import order as `main.tsx`.

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
 * case adds `:pl`; the two single cases below have their own keys). Each
 * invariant carries the task that fixes it (PR 7). A task deletes *its*
 * invariants from every list here first, watches the cases go red, then
 * fixes them, and drops a key whose list is empty. The comparison is exact
 * both ways, so an entry left behind after its fix is red too.
 */
const KNOWN_RED: Partial<Record<string, readonly Invariant[]>> = {}

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
    // The one board this fixture builds, listed under its own size: enough
    // for `useStoredBoard` (Workspace.tsx) to find the address's board in the
    // listing and fetch its file, the same round trip
    // `Workspace.browser.test.tsx`'s "a stored board can be opened…" case
    // drives through the real store URLs rather than by calling `showPreview`
    // directly — this is the open board's column reached the way a person
    // reaches it, not summoned by hand.
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
    // The settings drawer is open in every other state (`resetApp`), its
    // default; this one reads the closed face (handoff 2, PR 1).
    if (state === 'settings-closed') s.ui.setSettings(false)
    if (state === 'preview-palette') {
      s.ui.select('preview')
      for (let i = 0; i < 8; i++) s.view.addPaletteColor()
    }
    // Every row's description closed is the default (handoff 2, PR 2) and
    // every other lab state reads it: out of sight, `.fw-vh`, which needs the
    // panel as its positioned ancestor. This one opens them all below.
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
    // `useStoredBoard`'s fetch of the board file is asynchronous, so the
    // detail is not there the instant `render` returns — this is the wait
    // the task calls for, in place of `loadRunDone` (skipped above: this
    // state cares about the board the address opened, not the lab's own
    // load run).
    await expect.poll(() => screen.container.querySelector('.fw-bcol .fw-cmdfig')).not.toBeNull()
  }
  if (state === 'library-sheet-cli') await act(async () => useStore.getState().ui.setSheet('cli'))
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
    // A DOM click, not the locator's: the button is `display: none` outside
    // the bands that show the bar, and a DOM click keeps this arrange block
    // independent of which band shows it (a locator click waits 40s for a
    // visible element; measured in review: all four cases timed out).
    await act(async () => screen.container.querySelector<HTMLButtonElement>('.fw-more')?.click())
    await expect.poll(() => screen.container.querySelector('.fw-more-pop.open')).not.toBeNull()
  }
  return screen
}

/** Asserts the audit's failing invariants are exactly those `KNOWN_RED` records under `key`. */
function expectKnownRed(key: string, findings: readonly { invariant: Invariant; detail: string }[]) {
  const failing = [...new Set(findings.map((f) => f.invariant))].sort()
  const expected = [...(KNOWN_RED[key] ?? [])].sort()
  expect(failing, findings.map((f) => `${f.invariant}: ${f.detail}`).join('\n')).toEqual(expected)
}

async function matrixCase(state: State, w: number, h: number) {
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
  const findings = audit(screen.container, { board, solo: state === 'solo' || state === 'solo-sheet' })
  expectKnownRed(`${state}@${w}x${h}`, findings)
}

test.each(STATES.flatMap((state) => SIZES.map(([w, h]) => [state, w, h] as const)))(
  'the %s state at %d×%d keeps every layout invariant',
  matrixCase,
  40_000,
)

test.each(BANDED)('the banded %s state at %d×%d keeps every layout invariant', matrixCase, 40_000)

// The matrix above does not pin the panel's `max-height`: at 420×900 its
// seven levels in two columns (650px under a 171px top) fit without it. A
// window 700px tall is where they run past the bottom (measured: 16,171 to
// 404,821 in 420×700 with the rule removed), so this one case pins the rule.
test('the presets-open state at 420×700 keeps every layout invariant', async () => {
  await page.viewport(420, 700)
  const screen = await arrange('presets-open')
  await settle()
  expectKnownRed('presets-open@420x700', audit(screen.container, { board: true }))
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
    // Live pass, ≤480px: `.dims` gives way (shell.css), and its own `.sep`
    // used to stay rendered with nothing left to separate — an orphaned "/"
    // ahead of the right group's `margin-left: auto` gap. `TopBar.browser.
    // test.tsx` renders no stylesheet and sets no viewport, so this asserts
    // here instead, on the bar's own left cluster (mark, name, seps, dims),
    // which is where the defect showed.
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
// Polish, "Ogromny szkielet z serpentynami 400×400", at the narrowest width
// the lab supports. The knobs are written the way `applyPreset` writes them
// (every knob, the preset's over the defaults) but without its run, which at
// 400×400 would only slow the case down: the trigger reads the knobs.
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

// Review P7's question in the lab's layout (handoff 2, PR 6): an unreachable
// store leaves SIZES with no tab, the rail keeps Preview, and the panel says
// why rather than standing empty.
test('an unreachable store keeps the rail to Preview and says why in the panel', async () => {
  await page.viewport(1280, 800)
  const screen = await arrange('library-empty')
  await expect.poll(() => useStore.getState().library.listError).not.toBeNull()
  await expect.element(screen.getByText(/No store server/)).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Preview' }).elements()).toHaveLength(1)
  expect(screen.container.querySelectorAll('.fw-rail [role="tab"]')).toHaveLength(1)
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
}, 40_000)

// Spec §6: the bar's hover is a fill, like every other chip in the lab.
// `backgroundColor` equality is what pins the exact token, `--signal-fill-hover`,
// against the handoff's `rgba(237, 238, 242, 0.12)`; the contrast check
// guards that the shipped, opaque fill actually clears AA under `--ink` —
// this file, not `LabLayout.browser.test.tsx`, is where the ⌘K trigger's
// hover can be measured, because it is the one that already loads the full
// cascade `main.tsx` does, `palette.css` included (spec R1).
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
    // transition (`.fw .fw-seg button`); reading the computed style right
    // after the pointer event catches it mid-animation, still `rgba(0, 0, 0,
    // 0)`. `settle` (harness/settle.ts) waits it out.
    await settle()
    const el = control.element()
    const style = getComputedStyle(el)
    expect(style.textDecorationLine, name).toBe('none')
    expect(style.backgroundColor, name).toBe('rgb(85, 97, 200)')
    const { front, back } = shown(el)
    expect(contrast(front, back), name).toBeGreaterThanOrEqual(4.5)
  }
}, 40_000)
