import { DEFAULT_VIEW, themeOf } from '@arrowz/board-element'
import { dictionary } from '@arrowz/engine/i18n'
import { simpleParams } from '@arrowz/engine/simple'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { SimplePanel } from './SimplePanel'
import '../design/tokens.css'
import '../design/shell.css'
import '../design/console.css'

/** `#rrggbb` as the browser reports it back through `getComputedStyle`. */
function rgbOf(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** A theme the fixture files must actually carry, or the test itself is broken. */
function themeFixture(name: string) {
  const theme = themeOf(name)
  if (!theme) throw new Error(`no such theme: ${name}`)
  return theme
}

function stub() {
  const calls = { start: 0 }
  const control: RunControl = { start: () => void calls.start++, abort: () => {}, hold: () => {} }
  return { control, started: () => calls.start }
}

const state = () => useStore.getState()
const EN = dictionary('en')
const DEFAULT_ROUNDED = DEFAULT_VIEW.rounded

/** The knobs the recipe on screen gives with the seed on screen — what every write below must leave. */
const drawn = () => simpleParams({ ...state().recipe.value, seed: state().params.values.seed }, null)

/**
 * A range input moved the way a drag moves it: the native value setter, then
 * the `input` event React listens to. `fill` does not drive a range input, and
 * a click lands wherever the pointer is.
 */
function slide(input: HTMLInputElement | null, value: number) {
  if (!input) throw new Error('no such slider')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, String(value))
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  state().params.reset()
  state().recipe.reset()
  state().recipe.setRandom(false)
  state().ui.raiseClamped(false)
  // The store outlives a test. Reset through `setState`, not the view actions,
  // so a broken action fails only the cases that exercise it.
  useStore.setState((s) => ({ view: { ...s.view, theme: '', palette: [], rounded: DEFAULT_ROUNDED } }))
  state().lang.setLang('en')
})

describe('SimplePanel', () => {
  it('is a region a screen reader can name', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await expect.element(screen.getByRole('region', { name: 'Simple settings' })).toBeVisible()
  })

  it('is two named sections of knob rows on the advanced view’s grid', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const grid = screen.container.querySelector('.fw-simple > .kv.kv-g')
    expect(grid).not.toBeNull()
    await expect.element(screen.getByRole('group', { name: 'board' })).toBeVisible()
    await expect.element(screen.getByRole('group', { name: 'Preview' })).toBeVisible()
    expect(grid?.querySelectorAll('.kv-row')).toHaveLength(14)
    expect(screen.container.querySelector('.fw-k, .fw-grid, .fw-kdesc')).toBeNull()
    await act(async () => state().lang.setLang('pl'))
    await expect.element(screen.getByRole('group', { name: 'plansza' })).toBeVisible()
    await expect.element(screen.getByRole('group', { name: 'Podgląd' })).toBeVisible()
    await act(async () => state().lang.setLang('en'))
  })

  // The run is the debounce's, so none starts here.
  it('writes a typed width into the recipe and the knobs, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    // Relative: `recipe.edits` only grows, and `reset()` leaves it alone on purpose.
    const shaped = state().recipe.edits
    await screen.getByRole('button', { name: /^width/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '120')
    await userEvent.keyboard('{Enter}')
    expect(state().recipe.value.W).toBe(120)
    expect(state().params.values).toEqual(drawn())
    expect(state().view.cell).toBe(13)
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  it('writes a dragged height into the recipe, and shows the recipe’s value', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#knob-H'), 60)
    await expect.poll(() => state().recipe.value.H).toBe(60)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    await expect.element(screen.getByRole('button', { name: 'height: 60' })).toBeVisible()
    expect(g.started()).toBe(0)
  })

  // A preset, a link or Load into lab moves the knobs and leaves the recipe where it was.
  it('shows the size Generate carves, not the recipe’s', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const recipe = state().recipe.value.W
    await act(async () => void state().params.set('W', recipe + 7))
    await expect.element(screen.getByRole('button', { name: `width: ${recipe + 7}` })).toBeVisible()
  })

  it('keeps the other side the knobs have when one side is typed', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    await act(async () => void state().params.setMany({ W: 1000, H: 1000 }))
    const shaped = state().recipe.edits
    await screen.getByRole('button', { name: /^width/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '900')
    await userEvent.keyboard('{Enter}')
    expect(state().recipe.value).toMatchObject({ W: 900, H: 1000 })
    expect(state().params.values).toMatchObject({ W: 900, H: 1000 })
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    await expect.element(screen.getByRole('button', { name: 'height: 1000' })).toBeVisible()
    expect(g.started()).toBe(0)
  })

  it('moves the recipe and the knobs with a slider, and starts nothing', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const shaped = state().recipe.edits
    slide(screen.container.querySelector<HTMLInputElement>('#simple-lengths'), 20)
    await expect.poll(() => state().recipe.value.lengths).toBe(0.2)
    expect(state().params.values).toEqual(drawn())
    expect(state().recipe.edits).toBe(shaped + 1)
    expect(g.started()).toBe(0)
  })

  it('shows a recipe slider’s value as text, described by its end words and its help', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const input = screen.container.querySelector<HTMLInputElement>('#simple-shape')
    const row = input?.closest('.kv-row')
    if (!input || !(row instanceof HTMLElement)) throw new Error('no shape row')
    expect(row.querySelector('.vc button, .kv-end')).toBeNull()
    expect(row.querySelector('.vc')?.textContent).toBe(String(Math.round(state().recipe.value.shape * 100)))
    expect(input.getAttribute('aria-describedby')).toBe('simple-shape-ends simple-shape-help')
    const ends = document.getElementById('simple-shape-ends')
    expect(ends?.className).toBe('kv-ends')
    expect([...(ends?.children ?? [])].map((word) => word.textContent)).toEqual([...EN.d.simple.ends.shape])
    expect(row.contains(ends)).toBe(true)
  })

  it('puts a recipe slider’s end words under its track, one at each end', async () => {
    await page.viewport(1440, 900)
    const screen = await render(
      <div style={{ width: '720px', containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    const track = screen.container.querySelector('#simple-lengths')?.closest('.kv-track')
    const ends = screen.container.querySelector('#simple-lengths-ends')
    if (!(track instanceof HTMLElement) || !(ends instanceof HTMLElement)) throw new Error('no lengths row')
    const [low, high] = [...ends.children].map((word) => word.getBoundingClientRect())
    const lane = track.getBoundingClientRect()
    expect(Math.abs((low?.left ?? 0) - lane.left)).toBeLessThanOrEqual(1)
    expect(Math.abs((high?.right ?? 0) - lane.right)).toBeLessThanOrEqual(1)
    expect(low?.top ?? 0).toBeGreaterThanOrEqual(lane.bottom - 1)
  })

  // At XS the track is about 97px, so the words take the whole row instead.
  it('gives the end words the whole row at XS, on one line, in English and Polish', async () => {
    await page.viewport(375, 812)
    const screen = await render(
      <div style={{ width: '340px', containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    for (const lang of ['en', 'pl'] as const) {
      await act(async () => state().lang.setLang(lang))
      for (const slider of ['lengths', 'shape']) {
        const ends = screen.container.querySelector(`#simple-${slider}-ends`)
        const line = ends?.closest('.ln')
        if (!(ends instanceof HTMLElement) || !(line instanceof HTMLElement)) throw new Error(`no ${slider} row`)
        const row = line.getBoundingClientRect()
        const [low, high] = [...ends.children].map((word) => word.getBoundingClientRect())
        expect(Math.abs((low?.left ?? 0) - row.left), `${lang}: ${slider}`).toBeLessThanOrEqual(1)
        expect(Math.abs((high?.right ?? 0) - row.right), `${lang}: ${slider}`).toBeLessThanOrEqual(1)
        expect(low?.height, `${lang}: ${slider}`).toBe(high?.height)
        expect(Math.round(low?.top ?? 0), `${lang}: ${slider}`).toBe(Math.round(high?.top ?? -1))
        expect(ends.getBoundingClientRect().height, `${lang}: ${slider}`).toBeLessThan(20)
      }
    }
  })

  // A panel too narrow for the bound tracks (the container query, not XS)
  // leaves a track narrower than two end words side by side: they wrap inside
  // it rather than run past it, where `.kv` clips them.
  it('keeps the end words inside a narrow track, in English and Polish', async () => {
    await page.viewport(1440, 900)
    const screen = await render(
      <div style={{ width: '340px', containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    for (const lang of ['en', 'pl'] as const) {
      await act(async () => state().lang.setLang(lang))
      for (const slider of ['lengths', 'shape']) {
        const lane = screen.container.querySelector(`#simple-${slider}`)?.closest('.kv-track')?.getBoundingClientRect()
        const ends = screen.container.querySelector(`#simple-${slider}-ends`)
        if (lane === undefined || !(ends instanceof HTMLElement)) throw new Error(`no ${slider} row`)
        expect(lane.width, 'the case needs a narrow track').toBeLessThan(120)
        for (const word of ends.children) {
          const box = word.getBoundingClientRect()
          expect(box.left, `${lang}: ${word.textContent}`).toBeGreaterThanOrEqual(lane.left - 1)
          expect(box.right, `${lang}: ${word.textContent}`).toBeLessThanOrEqual(lane.right + 1)
        }
        const row = ends.closest('.kv-row')
        if (!(row instanceof HTMLElement)) throw new Error('no row')
        expect(row.scrollWidth, `${lang}: ${slider}`).toBeLessThanOrEqual(row.clientWidth)
      }
    }
  })

  it('opens each simple control’s own help under its ?, and only that one', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const rows = [
      { id: 'simple-lengths-help', name: EN.d.simple.lengths, text: EN.d.simple.lengthsHelp },
      { id: 'simple-shape-help', name: EN.d.simple.shape, text: EN.d.simple.shapeHelp },
      { id: 'simple-skeleton-help', name: EN.d.simple.skeleton, text: EN.d.simple.skeletonHelp },
    ]
    for (const { id, name, text } of rows) {
      const help = document.getElementById(id)
      expect(help?.textContent, id).toBe(text)
      expect(help?.classList.contains('fw-vh'), id).toBe(true)
      const q = screen.getByRole('button', { name: EN.t('aboutKnob', name) })
      expect(q.element().getAttribute('aria-controls'), id).toBe(id)
      expect(q.element().closest('.kv-row')?.contains(help), id).toBe(true)
      await q.click()
      expect(q.element().getAttribute('aria-expanded'), id).toBe('true')
      expect(help?.classList.contains('fw-vh'), id).toBe(false)
      for (const other of rows.filter((r) => r.id !== id)) {
        expect(document.getElementById(other.id)?.classList.contains('fw-vh'), `${id} opened ${other.id}`).toBe(true)
      }
      await q.click()
      expect(help?.classList.contains('fw-vh'), id).toBe(true)
    }
  })

  it('keeps a slider’s help open across a language switch, in the new language', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    await screen.getByRole('button', { name: EN.t('aboutKnob', EN.d.simple.lengths) }).click()
    await act(async () => state().lang.setLang('pl'))
    const help = document.getElementById('simple-lengths-help')
    expect(help?.textContent).toBe(dictionary('pl').d.simple.lengthsHelp)
    expect(help?.classList.contains('fw-vh')).toBe(false)
    await act(async () => state().lang.setLang('en'))
  })

  it('describes the skeleton’s choice by its help', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const group = screen.getByRole('radiogroup', { name: EN.d.simple.skeleton })
    expect(group.element().getAttribute('aria-describedby')).toBe('simple-skeleton-help')
  })

  it('runs at once when the skeleton is switched, on the knobs it gives', async () => {
    const seen: unknown[] = []
    const control: RunControl = {
      start: () => void seen.push({ ...state().params.values }),
      abort: () => {},
      hold: () => {},
    }
    const shaped = state().recipe.edits
    const screen = await render(<SimplePanel control={control} />)
    await screen.getByRole('radio', { name: 'with a skeleton' }).click()
    expect(state().recipe.value.skeleton).toBe('on')
    expect(seen).toEqual([drawn()])
    expect(state().recipe.edits).toBe(shaped)
  })

  it('stands the skeleton’s choice at the right edge of the row', async () => {
    const screen = await render(
      <div style={{ width: '720px', containerType: 'inline-size' }}>
        <SimplePanel control={stub().control} />
      </div>,
    )
    const seg = screen.container.querySelector('.fw-simple .kv-row .fw-seg')
    const cc = seg?.closest('.cc')
    if (!(seg instanceof HTMLElement) || !(cc instanceof HTMLElement)) throw new Error('no skeleton choice')
    expect(cc.classList.contains('wide')).toBe(true)
    expect(Math.abs(seg.getBoundingClientRect().right - cc.getBoundingClientRect().right)).toBeLessThanOrEqual(1)
  })

  // A seed typed here must not wake an `auto` left on in the advanced view.
  it('writes a typed seed into the knobs without counting it as a knob edit', async () => {
    const g = stub()
    state().ui.setAuto(true)
    const typed = state().params.edits
    const screen = await render(<SimplePanel control={g.control} />)
    await screen.getByRole('button', { name: /^seed/ }).click()
    await userEvent.fill(screen.getByRole('textbox'), '4242')
    await userEvent.keyboard('{Enter}')
    expect(state().params.values.seed).toBe(4242)
    expect(state().params.edits).toBe(typed)
    expect(g.started()).toBe(0)
    state().ui.setAuto(false)
  })

  it('switches randomising without running, and says on or off', async () => {
    const g = stub()
    const screen = await render(<SimplePanel control={g.control} />)
    const random = screen.getByRole('switch', { name: 'randomise' })
    const row = random.element().closest('.kv-row')
    expect(row?.querySelector('.vc')?.textContent).toBe('off')
    await random.click()
    expect(state().recipe.value.random).toBe(true)
    expect(row?.querySelector('.vc')?.textContent).toBe('on')
    expect(g.started()).toBe(0)
  })

  it('keeps the randomise sentence in the title and its help under the row’s ?', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const random = screen.getByRole('switch', { name: 'randomise' })
    expect(random.element().getAttribute('title')).toBe(EN.d.simple.randomize)
    const help = document.getElementById(random.element().getAttribute('aria-describedby') ?? '')
    expect(help?.textContent).toBe(EN.d.simple.randomizeHelp)
    const row = random.element().closest('.kv-row')
    expect(row?.contains(help)).toBe(true)
    const q = row?.querySelector('button.q')
    expect(q?.getAttribute('aria-controls')).toBe(help?.id)
    await act(async () => state().lang.setLang('pl'))
    await expect.element(screen.getByRole('switch', { name: 'losuj' })).toBeVisible()
    await act(async () => state().lang.setLang('en'))
  })

  it('shows the preview rows the old simple view shows, and only those', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    for (const id of ['view-stroke', 'view-headWidth', 'view-headHeight', 'view-theme'])
      expect(screen.container.querySelector(`#${id}`), id).not.toBeNull()
    for (const name of ['rounded', 'multicolour', 'longest'])
      await expect.element(screen.getByRole('switch', { name })).toBeVisible()
    expect(screen.container.querySelector('#view-cell')).toBeNull()
    expect(screen.container.querySelector('#view-top')).toBeNull()
    expect(screen.container.querySelector('#view-voids')).toBeNull()
  })

  it('a preview row in the simple panel still writes the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    slide(screen.container.querySelector<HTMLInputElement>('#view-stroke'), 0.8)
    await expect.poll(() => useStore.getState().view.stroke).toBe(0.8)
    await screen.getByRole('switch', { name: 'rounded' }).click()
    expect(useStore.getState().view.rounded).toBe(!DEFAULT_ROUNDED)
  })

  it('offers the theme picker, and writes a choice into the lab’s view', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const picker = screen.getByRole('combobox')
    await expect.element(picker).toBeInTheDocument()
    await userEvent.selectOptions(picker, 'gruvbox-dark')
    expect(useStore.getState().view.theme).toBe('gruvbox-dark')
  })

  it('shows the chosen theme’s arrow colours, in order, on its own paper, and clears with the theme', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.container.querySelector('.fw-swatches')).toBeNull()
    const picker = screen.getByRole('combobox')
    await userEvent.selectOptions(picker, 'gruvbox-dark')
    const strip = screen.container.querySelector<HTMLElement>('.fw-swatches')
    if (!strip) throw new Error('no swatch strip after choosing a theme')
    const theme = themeFixture('gruvbox-dark')
    expect(getComputedStyle(strip).backgroundColor).toBe(rgbOf(theme.paper))
    const swatches = [...strip.querySelectorAll<HTMLElement>('.fw-swatch')]
    expect(swatches.map((s) => getComputedStyle(s).backgroundColor)).toEqual(theme.palette.map(rgbOf))
    expect(strip.closest('.kv-row')?.querySelector('#view-theme')).not.toBeNull()
    expect(strip.getAttribute('aria-hidden')).toBe('true')
    await userEvent.selectOptions(picker, '')
    expect(screen.container.querySelector('.fw-swatches')).toBeNull()
  })

  // Pinned by absence: the two panels share `ViewPanel`'s rows, which is how
  // an edit could hand the simple view the editor by accident.
  it('has no custom-palette editor — no add-colour button and no colour input', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    expect(screen.getByRole('button', { name: 'add colour' }).query()).toBeNull()
    expect(screen.container.querySelector('input[type="color"]')).toBeNull()
    expect(screen.container.querySelector('#view-palette-label')).toBeNull()
  })

  it('head height points at its help in its own row, which its ? opens', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const track = screen.container.querySelector('#view-headHeight')
    expect(track?.getAttribute('aria-describedby')).toBe('view-headHeight-help')
    const help = document.getElementById('view-headHeight-help')
    expect(help?.textContent).toBe(EN.t('headHelp'))
    expect(help?.closest('.kv-row')).toBe(track?.closest('.kv-row'))
    expect(help?.classList.contains('fw-vh')).toBe(true)
    await screen.getByRole('button', { name: EN.t('aboutKnob', 'head height') }).click()
    expect(help?.classList.contains('fw-vh')).toBe(false)
  })

  it('ends the board section with where to find a harder board, in English and Polish', async () => {
    const screen = await render(<SimplePanel control={stub().control} />)
    const board = screen.getByRole('group', { name: 'board' }).element()
    const hint = document.getElementById('simple-harder')
    expect(hint?.tagName).toBe('P')
    expect(hint?.parentElement).toBe(board)
    expect(board.lastElementChild).toBe(hint)
    expect(hint?.textContent).toBe(EN.d.simple.harder)
    expect(hint?.classList.contains('kv-row') || hint?.classList.contains('kv-help')).toBe(false)
    await act(async () => state().lang.setLang('pl'))
    expect(hint?.textContent).toBe(dictionary('pl').d.simple.harder)
    await act(async () => state().lang.setLang('en'))
  })

  // `.kv-lab` ellipsises; with the `?` beside it, a long label would lose its end.
  it('shows the simple labels whole beside their ?, at 720px and at XS, in English and Polish', async () => {
    for (const [viewport, width] of [
      [1440, 720],
      [375, 340],
    ] as const) {
      await page.viewport(viewport, 900)
      const screen = await render(
        <div style={{ width: `${width}px`, containerType: 'inline-size' }}>
          <SimplePanel control={stub().control} />
        </div>,
      )
      for (const lang of ['en', 'pl'] as const) {
        await act(async () => state().lang.setLang(lang))
        const labels = [
          screen.container.querySelector('label[for="simple-lengths"]'),
          screen.container.querySelector('label[for="simple-shape"]'),
          screen.container.querySelector('#simple-skeleton-label'),
        ]
        for (const lab of labels) {
          if (!(lab instanceof HTMLElement)) throw new Error('no label')
          expect(lab.scrollWidth, `${viewport} ${lang}: ${lab.textContent}`).toBeLessThanOrEqual(lab.clientWidth)
        }
      }
      // The check can fail: the old Polish label does not fit beside its `?`.
      const lab = screen.container.querySelector('label[for="simple-lengths"]')
      if (!(lab instanceof HTMLElement)) throw new Error('no label')
      const text = lab.textContent
      lab.textContent = 'długość elementów'
      expect(lab.scrollWidth, `${viewport}: the old label`).toBeGreaterThan(lab.clientWidth)
      lab.textContent = text
    }
    await act(async () => state().lang.setLang('en'))
  })

  // A chip that runs past its track lands on the `?`, and a tap there re-runs
  // the board. `.fw` gives the chips the lab's padding and touch height.
  it('leaves every ? in the board section hit at its centre, and the skeleton chips inside their row, in English and Polish', async () => {
    for (const [viewport, width] of [
      [375, 340],
      [1440, 340],
      [1440, 720],
    ] as const) {
      await page.viewport(viewport, 812)
      const screen = await render(
        <div className="fw" style={{ width: `${width}px`, containerType: 'inline-size' }}>
          <SimplePanel control={stub().control} />
        </div>,
      )
      const board = screen.container.querySelector('#simple-skeleton-label')?.closest('.kv-sect')
      if (!(board instanceof HTMLElement)) throw new Error('no board section')
      for (const lang of ['en', 'pl'] as const) {
        await act(async () => state().lang.setLang(lang))
        const marks = [...board.querySelectorAll<HTMLElement>('.q')]
        expect(marks.length, 'the board section has its ?').toBeGreaterThanOrEqual(3)
        for (const q of marks) {
          q.scrollIntoView({ block: 'center' })
          const box = q.getBoundingClientRect()
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
          expect(hit !== null && q.contains(hit), `${viewport}/${width} ${lang}: ${q.getAttribute('aria-label')}`).toBe(
            true,
          )
        }
        const seg = board.querySelector('.fw-seg')
        const ln = seg?.closest('.ln')
        const lc = ln?.querySelector('.lc')
        if (!(seg instanceof HTMLElement) || !(ln instanceof HTMLElement) || !(lc instanceof HTMLElement))
          throw new Error('no skeleton row')
        const chips = seg.getBoundingClientRect()
        const row = ln.getBoundingClientRect()
        const label = lc.getBoundingClientRect()
        expect(chips.left, `${viewport}/${width} ${lang}: chips left`).toBeGreaterThanOrEqual(row.left)
        expect(chips.right, `${viewport}/${width} ${lang}: chips right`).toBeLessThanOrEqual(row.right + 1)
        const overlaps =
          chips.left < label.right && label.left < chips.right && chips.top < label.bottom && label.top < chips.bottom
        expect(overlaps, `${viewport}/${width} ${lang}: chips over the label`).toBe(false)
      }
    }
    await act(async () => state().lang.setLang('en'))
  })
})
