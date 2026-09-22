import { decodeBoard } from '@arrowz/engine'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { contrast, shown } from '../design/contrast'
import { storedFixture } from '../state/library.fixtures'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.library.reset()
  state.lang.setLang('en')
  state.ui.setSolo(false)
  // The view too: cases below turn colouring on and build a palette. Reset
  // directly rather than through `setTheme`/`setPalette`/`setFlag`, as
  // `view.slice.test.ts` and `ViewPanel.browser.test.tsx` do — a fixture
  // built on an action under test cannot survive a mutation of that action,
  // and would fail every case in the file alongside the one that pins it.
  useStore.setState((s) => ({ view: { ...s.view, theme: '', palette: [], colored: false } }))
})

/**
 * The frame in a box with a size, as the stage gives it one. The frame asks the
 * route now (`useInLibrary`), so it needs a router; every case that names no
 * address gets `/`, which is the lab.
 */
async function mountFrame(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {/* One row: `.fw`'s own `48px auto 1fr` rows would give the frame 48px. */}
      <div className="fw" style={{ display: 'grid', gridTemplateRows: '1fr', width: '480px', height: '360px' }}>
        <BoardFrame />
      </div>
    </MemoryRouter>,
  )
}

const annotation = (container: HTMLElement) => container.querySelector('.fw-anno')

// Colours are a permission the element grants only to a host that asks
// (`enableColors`, arrowz-board.ts); without it `view.colored` is ignored and
// every piece is drawn in ink. `element.view.colored` alone cannot catch the
// gap — it is the input, not what is drawn — so this reads the element's own
// colours button, whose `aria-pressed` is the colour the board is actually
// drawn in.
test('the colored flag colours the board', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const element = screen.container.querySelector('arrowz-board')
  const colours = () => element?.shadowRoot?.querySelector('button.colors')
  const was = useStore.getState().view.colored
  try {
    await act(async () => useStore.getState().view.setFlag('colored', true))
    await expect.poll(() => colours()?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => useStore.getState().view.setFlag('colored', false))
    await expect.poll(() => colours()?.getAttribute('aria-pressed')).toBe('false')
  } finally {
    useStore.getState().view.setFlag('colored', was)
  }
})

test('the frame names nothing before there is a board', async () => {
  const screen = await mountFrame()
  expect(screen.container.querySelector('arrowz-board')).not.toBeNull()
  expect(annotation(screen.container)).toBeNull()
})

test('the annotation carries the size and seed of the board on screen', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
  expect(screen.container.querySelector('arrowz-board')?.board?.W).toBe(8)
})

// Spec §5.2: during a run the board on screen is the previous one, and so is
// what the frame says about it.
test('during a run the annotation still names the previous board', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().run.started({ ...finishedRun(2).params }))
  expect(annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
})

test('the annotation follows the language', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · ziarno 1')
})

// The element's host is `position: relative`, opaque and `z-index: auto`
// (arrowz-board.ts:129-135), so tree order decides what paints on top: an
// annotation before the element would be under the paper, and a colour test
// alone would pass on it (spec §5.1).
test('the annotation comes after the element and is what paints at its corner', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const element = screen.container.querySelector('arrowz-board')
  const label = annotation(screen.container)
  // `instanceof HTMLElement`, not `!== null`: `querySelector` returns `Element`,
  // which has no `style` for the hit test below.
  if (element === null || !(label instanceof HTMLElement)) throw new Error('the frame is not on the page')
  expect(element.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // Ruling 10 takes the annotation out of hit testing, and `elementFromPoint`
  // honours that (measured: the hit is the `arrowz-board` host). The rule is
  // asserted, then lifted for this one read, which asks what paints there.
  expect(getComputedStyle(label).pointerEvents).toBe('none')
  const box = label.getBoundingClientRect()
  label.style.pointerEvents = 'auto'
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
  label.style.pointerEvents = ''
  expect(hit === label || (hit !== null && label.contains(hit))).toBe(true)
})

// §7.1, PR 4b: the mock's `--void` on `--signal` is 4.08:1; the frame inverts it.
test('the annotation reads at AA', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  const label = annotation(screen.container)
  if (label === null) throw new Error('no annotation')
  const { front, back } = shown(label)
  expect(contrast(front, back)).toBeGreaterThanOrEqual(4.5)
})

// Spec §5.2 and PR 4b, Ruling 3: a glyph of its own — `⤢` is the element's fit
// button — named by `fullView`, and a toggle, so it says whether it is on.
test('the solo toggle is a named toggle in the frame, after the element', async () => {
  const screen = await mountFrame()
  const toggle = screen.getByRole('button', { name: 'Full view (key F)' })
  // The name says "key F" in prose; this says it to a machine. Both stay: six
  // assertions in this file and LabLayout find the button by that whole name.
  await expect.element(toggle).toHaveAttribute('aria-keyshortcuts', 'f')
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'false')
  const element = screen.container.querySelector('arrowz-board')
  if (element === null) throw new Error('no board element')
  expect(element.compareDocumentPosition(toggle.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await toggle.click()
  expect(useStore.getState().ui.solo).toBe(true)
  await expect.element(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  expect(useStore.getState().ui.solo).toBe(false)
})

// Spec §5.3: the preview is what the stage shows while the library has one,
// and the run's own board is still there underneath, untouched.
test('a preview takes the stage and names itself, leaving the run result alone', async () => {
  // Mounted on the library tab, because that is where a preview is shown at
  // all: the frame asks the route first (`useInLibrary`), so this case on `/`
  // would watch the lab's own board and ignore the preview entirely. Review
  // round 3 measured exactly that failure.
  const { meta, file } = storedFixture(2, 6, 6)
  const screen = await mountFrame(`/boards/6x6/${meta.id}`)
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))

  await expect.poll(() => annotation(screen.container)?.textContent).toBe('6×6 · seed 2')
  expect(screen.container.querySelector('arrowz-board')?.board?.W).toBe(6)
  expect(useStore.getState().result.shown).not.toBeNull()

  // And clearing it empties the stage rather than falling back to the run's
  // board: on this tab the lab's board is not a substitute (spec §5.6).
  await act(async () => useStore.getState().result.clearPreview())
  await expect.poll(() => annotation(screen.container)).toBeNull()
})

// Ruling 3: a stored board carries its own view. The element gates colour
// behind `enableColors`, so this reads the element's own colours button —
// the input alone would prove nothing (harness fact 20).
test('a stored board is drawn under its own saved view, not the lab’s', async () => {
  // Mounted on the library tab, which is the only place a preview is drawn at
  // all: at `/` the frame puts no board on the stage (it asks the route), and
  // the colour assertion below would then be read off an *empty* element — it
  // would prove `elementView` follows the preview, but not this case's own
  // title, that a stored board is drawn under its own view.
  const { meta, file } = storedFixture(2)
  const stored = { ...meta, view: { ...meta.view, colored: true } }
  const screen = await mountFrame(`/boards/8x8/${meta.id}`)
  await act(async () => useStore.getState().view.setFlag('colored', false))
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta: stored }))

  const element = screen.container.querySelector('arrowz-board')
  await expect
    .poll(() => element?.shadowRoot?.querySelector('button.colors')?.getAttribute('aria-pressed'))
    .toBe('true')
  // There is a board under those colours: the board and the view reach the
  // element in one commit, so this is the same frame the poll settled on.
  expect(element?.board?.W).toBe(8)
})

// Ruling O: the view is gated on the tab, not on the preview alone.
// `useInLibrary` flips with the location render while `useStoredBoard` clears
// the preview in an effect after commit, so there is one committed frame on the
// way back to `/` where a preview is still set. The lab's board must wear the
// lab's view in it — this is the case the tightened gate is for.
test('a preview left over on the lab tab lends the lab neither its board nor its view', async () => {
  const screen = await mountFrame()
  const { meta, file } = storedFixture(2, 6, 6)
  const stored = { ...meta, view: { ...meta.view, colored: true } }
  await act(async () => useStore.getState().view.setFlag('colored', false))
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta: stored }))

  const element = screen.container.querySelector('arrowz-board')
  // The run's own 8×8, not the stored 6×6, and the lab's colours, not the
  // stored board's.
  await expect.poll(() => annotation(screen.container)?.textContent).toBe('8×8 · seed 1')
  expect(element?.board?.W).toBe(8)
  expect(element?.shadowRoot?.querySelector('button.colors')?.getAttribute('aria-pressed')).toBe('false')
})

// Palette round-2 addendum, task 2: the custom palette is added to what
// `BoardFrame` hands the element explicitly, since `boardViewOf` carries no
// colour fields at all (view.ts:50-60, `view.test.ts` pins that). Read off
// the element's own `.view.palette` — the input the frame passed it, and
// exactly what `gl-layer.ts`'s `resolvePalette` draws from.
test('a custom palette reaches the element', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => {
    useStore.getState().view.addPaletteColor()
    useStore.getState().view.setPaletteColor(0, '#ff00ff')
  })
  const element = screen.container.querySelector('arrowz-board')
  expect(element?.view.palette).toEqual(['#ff00ff'])
  // Ruling 6 repealed the exclusion that used to clear the palette here: a
  // theme chosen afterwards no longer wipes it, and the element's own
  // `.view.palette` still reads the override `BoardFrame.tsx` builds.
  await act(async () => useStore.getState().view.setTheme('gruvbox-dark'))
  expect(element?.view.palette).toEqual(['#ff00ff'])
  useStore.getState().view.setTheme('')
})

// Finding 1 (final whole-addendum review): the palette is a viewing
// preference like the theme, and `theme={view.theme}` above already applies
// unconditionally to whatever board is on screen — the preview branch used to
// discard the custom palette instead of folding it in the same way, so a
// theme repainted a stored preview and a custom palette did not, for two
// states the design calls equivalent and mutually exclusive.
test('a custom palette reaches a library preview too, the same way the theme already does', async () => {
  const { meta, file } = storedFixture(2)
  const screen = await mountFrame(`/boards/8x8/${meta.id}`)
  const wasColored = useStore.getState().view.colored
  try {
    await act(async () => {
      useStore.getState().view.addPaletteColor()
      useStore.getState().view.setPaletteColor(0, '#ff00ff')
    })
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    const element = screen.container.querySelector('arrowz-board')
    expect(element?.view.palette).toEqual(['#ff00ff'])
    // There is a board under that palette: `labView` carries the palette
    // too, so a preview that never landed would leave this green on its own.
    expect(element?.board?.W).toBe(8)
  } finally {
    useStore.getState().view.setPalette([])
    useStore.getState().view.setFlag('colored', wasColored)
  }
})

test('an unset paper leaves the theme its own, and a set one overrides it', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().view.setTheme('gruvbox-dark'))
  const element = screen.container.querySelector('arrowz-board')
  // Absent, not empty: the element sanitises *after* precedence, so a stated
  // '' would beat the theme and then fall to the element's own default,
  // turning a dark theme light (spec §4.4).
  expect(element === null || !('paper' in (element.view ?? {}))).toBe(true)

  await act(async () => useStore.getState().view.setPaper('#010203'))
  expect(element?.view.paper).toBe('#010203')
  // The theme is still supplying what the user did not override (Ruling 6).
  expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  useStore.getState().view.setTheme('')
  useStore.getState().view.setPaper('')
})

// The same seam as the palette's preview case above: a colour that reaches the
// lab branch and not the library's, for two states the design calls equivalent.
test('the library preview gets the custom colours too', async () => {
  const { meta, file } = storedFixture(2)
  const screen = await mountFrame(`/boards/8x8/${meta.id}`)
  try {
    await act(async () => useStore.getState().view.setPaper('#040506'))
    await act(async () => useStore.getState().result.showPreview({ board: decodeBoard(file), file, meta }))
    const element = screen.container.querySelector('arrowz-board')
    expect(element?.view.paper).toBe('#040506')
    // There is a board under that paper: `labView` carries it too, so a
    // preview that never landed would leave this green on its own.
    expect(element?.board?.W).toBe(8)
  } finally {
    useStore.getState().view.setPaper('')
  }
})

test('the point grid reaches the element', async () => {
  const screen = await mountFrame()
  await act(async () => finish(finishedRun(1)))
  await act(async () => {
    const view = useStore.getState().view
    view.setFlag('showPoints', true)
    view.setPointColor('#0a0b0c')
    view.setPointRadius('0.2')
  })
  const element = screen.container.querySelector('arrowz-board')
  expect(element?.showPoints).toBe(true)
  expect(element?.pointColor).toBe('#0a0b0c')
  expect(element?.pointRadius).toBe(0.2)
  useStore.getState().view.setFlag('showPoints', false)
})

// Spec §5.6: a link to a board that is no longer on disk leaves the stage
// empty and says why. Measured by review round 2 before the tab gate existed:
// the frame fell through to the lab's own board, so a 25×50 carve stood under
// the words "cannot be read" about an 8×8 one. The run's result is deliberately
// present here — that is the board that must NOT appear.
test('on the library tab a board that could not be read leaves the stage empty', async () => {
  const screen = await mountFrame('/boards/8x8/sha256-0')
  await act(async () => finish(finishedRun(1)))
  await act(async () => useStore.getState().library.boardFailed({ name: '8x8/sha256-0', reason: 'not in the store' }))

  await expect.poll(() => screen.container.querySelector('arrowz-board')?.board ?? null).toBeNull()
  expect(annotation(screen.container)).toBeNull()
})

// Renamed from "the frame around the board takes the paper the element
// announces" (fix wave after the whole-branch review): `<arrowz-board>` sets
// `--arrowz-paper` on its own host, and a custom property inherits downward
// only, so `.fw-board` -- an ancestor of the element it nests -- can never
// see it. Nothing in the app ever sets the property on `.fw-board` itself;
// the letterbox a person actually sees is painted by the element's own
// `:host`, which does receive it. P10 dropped the dead `var(--arrowz-paper,
// var(--paper))` fallback that used to read a property `.fw-board` can never
// receive -- `.fw-board` now paints `var(--paper)` outright, and does not
// follow `--arrowz-paper` set on itself.
test('the frame paints the lab’s token, not --arrowz-paper set on itself', async () => {
  const screen = await mountFrame()
  const frame = screen.container.querySelector('.fw-board')
  // `instanceof HTMLElement`, not `!== null`: `querySelector` returns `Element`,
  // which has no `style` for the property set below.
  if (!(frame instanceof HTMLElement)) throw new Error('the board frame is not on the page')
  // Production, exactly: `.fw-board` never receives `--arrowz-paper` (the
  // element covers it and sets the property on its own host instead), so this
  // is what the frame paints, always -- the lab's own token.
  expect(getComputedStyle(frame).backgroundColor).toBe('rgb(244, 245, 248)')
  // Not production -- nothing in the app sets the property on `.fw-board`
  // itself -- but this still guards that the declaration is a plain
  // `var(--paper)`, not a fallback that would read the property here.
  frame.style.setProperty('--arrowz-paper', 'rgb(40, 40, 40)')
  expect(getComputedStyle(frame).backgroundColor).toBe('rgb(244, 245, 248)')
})
