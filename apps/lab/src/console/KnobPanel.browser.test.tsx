import { type ParamKey, PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { act } from 'react'
import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { KnobPanel } from './KnobPanel'
// A closed description is `.fw-vh` and the rows are a grid; a component test
// renders no other route to the stylesheet, so it imports it itself to see
// the same clipping and layout the app would apply.
import '../design/tokens.css'
import '../design/console.css'

// File scope, the way this repository's other browser files open one (see
// `RunColumn.browser.test.tsx`, whose own file-scope block resets the same
// four things): a reset inside a describe leaves every case declared above
// the block running on whatever the case before it happened to leave behind.
beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.run.reset()
  state.result.reset()
  state.ui.setAuto(false)
  state.ui.clearFocusRequest()
})

const EN = dictionary('en')
function specOf(key: ParamKey) {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (spec === undefined) throw new Error(`PARAM_SPEC has no ${key}`)
  return spec
}
const helpFor = (key: ParamKey) => EN.paramText(specOf(key)).help

test('a panel draws every knob of its group', async () => {
  const screen = await render(<KnobPanel group="shape" />)
  // Four knobs in shape: pStraight, wLateral, warns, anticoil — one row each.
  expect(screen.container.querySelectorAll('.kv-row')).toHaveLength(4)
  await expect.element(screen.getByText('anticoil', { exact: true })).toBeVisible()
})

// Handoff 2, PR 2: the label is the engine's short term; the full sentence
// is the row's title, with the range.
test('a row labels its knob with the short term and keeps the sentence in its title', async () => {
  const screen = await render(<KnobPanel group="shape" />)
  const label = screen.container.querySelector('label[for="knob-anticoil"]')
  expect(label?.textContent).toBe('anticoil')
  expect(label?.closest('.kv-row')?.getAttribute('title')).toBe(`${specOf('anticoil').label} · 1–10`)
})

test('the panel names its group and is the tabpanel the rail points at', async () => {
  const screen = await render(<KnobPanel group="skeleton" />)
  const panel = screen.getByRole('tabpanel')
  await expect.element(panel).toHaveAttribute('id', 'rail-panel-skeleton')
  await expect.element(panel).toHaveAttribute('aria-labelledby', 'rail-tab-skeleton')
})

test('the difficulty group shows one start control, not two knobs', async () => {
  const screen = await render(<KnobPanel group="difficulty" />)
  // headBias and mix share --start, so the group's five specs become four
  // controls: the start control, trapBias, probe, probeLen.
  await expect.element(screen.getByRole('combobox', { name: /piece start/i })).toBeVisible()
  expect(screen.container.querySelectorAll('#knob-headBias')).toHaveLength(0)
  expect(screen.container.querySelectorAll('#knob-mix')).toHaveLength(0)
})

test('every knob in PARAM_SPEC is reachable from exactly one panel', async () => {
  const groups = [...new Set(PARAM_SPEC.map((s) => s.group))]
  const drawn = new Set<string>()
  for (const group of groups) {
    const screen = await render(<KnobPanel group={group} />)
    for (const el of screen.container.querySelectorAll('[id^="knob-"]')) {
      const key = el.id.replace('knob-', '')
      expect(drawn.has(key)).toBe(false)
      drawn.add(key)
    }
  }
  // headBias and mix are behind the start control; mix appears only while
  // mixing is chosen, and the defaults spell `random`. A closed dependency
  // block keeps its knobs mounted, so they count too.
  const expected = PARAM_SPEC.filter((s) => s.surface !== 'start').map((s) => s.key)
  for (const key of expected) expect(drawn.has(key)).toBe(true)
})

// The descriptions switch is gone (handoff 2, PR 2): the group's own sentence
// is always under the heading.
test('a group with help prints it under the heading', async () => {
  const screen = await render(<KnobPanel group="closing" />)
  await expect.element(screen.getByText(/no legal carve/)).toBeVisible()
})

describe('the description on demand', () => {
  // Measured, not `toBeVisible()`: that matcher reads the bounding rect, which
  // a 1x1px clipped box still has, so it cannot tell `.fw-vh` apart from an
  // element that merely happens to be small. `clipPath`/`position` are the
  // properties the CSS actually sets, so they are what a reversal would break.
  it('keeps each description closed until its `?` opens it', async () => {
    const screen = await render(<KnobPanel group="board" />)
    const help = screen.container.querySelector('#knob-W-desc')
    if (help === null) throw new Error('no description')
    expect(getComputedStyle(help).clipPath).toBe('inset(50%)')
    expect(getComputedStyle(help).position).toBe('absolute')
    const q = screen.getByRole('button', { name: 'About width' })
    await expect.element(q).toHaveAttribute('aria-expanded', 'false')
    await expect.element(q).toHaveAttribute('aria-controls', 'knob-W-desc')
    await q.click()
    await expect.element(q).toHaveAttribute('aria-expanded', 'true')
    expect(getComputedStyle(help).clipPath).toBe('none')
    expect(getComputedStyle(help).position).not.toBe('absolute')
    await q.click()
    expect(getComputedStyle(help).clipPath).toBe('inset(50%)')
  })

  it('keeps a closed description in the accessibility tree', async () => {
    const screen = await render(<KnobPanel group="board" />)
    const help = screen.container.querySelector('#knob-W-desc')
    expect(help?.textContent).toBe(helpFor('W'))
    // `textContent` alone would stay unchanged under `display: none` too —
    // `display`/`visibility` are what govern whether an element leaves the
    // accessibility tree.
    if (help === null) throw new Error('no description')
    expect(getComputedStyle(help).display).not.toBe('none')
    expect(getComputedStyle(help).visibility).not.toBe('hidden')
  })

  // Ruling 9 of 2026-09-13 survives the move: a closed description never takes
  // the reason a run is refused with it, and the state line holds the reason
  // alone.
  it('keeps a violation under its row, visible, with the description closed', async () => {
    useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
    const screen = await render(<KnobPanel group="lengths" />)
    const why = screen.getByTestId('knob-wShort-why')
    await expect.element(why).toBeVisible()
    const violation = useStore.getState().params.violations[0]
    if (violation === undefined) throw new Error('expected a violation')
    await expect.element(why.getByText(EN.violation(violation))).toBeVisible()
    expect(why.element().textContent).not.toContain(helpFor('wShort'))
  })

  it('puts each description in its own row, once, and nowhere under the heading', async () => {
    const screen = await render(<KnobPanel group="board" />)
    const help = screen.container.querySelector('#knob-W-desc')
    expect(help?.closest('.kv-row')?.querySelector('#knob-W')).not.toBeNull()
    expect(screen.container.querySelectorAll('#knob-W-desc')).toHaveLength(1)
  })

  it('points each control at its reason and its description', async () => {
    const screen = await render(<KnobPanel group="board" />)
    await expect
      .element(screen.getByRole('slider', { name: 'width' }))
      .toHaveAttribute('aria-describedby', 'knob-W-why knob-W-desc')
    await expect
      .element(screen.getByRole('button', { name: /^width:/ }))
      .toHaveAttribute('aria-describedby', 'knob-W-why knob-W-desc')
  })

  // `difficulty` holds the `--start` pair: the mix row is one control of its
  // own, and its description joins and leaves the panel with it.
  it('has the mix row’s description only while the start choice is mixing', async () => {
    const screen = await render(<KnobPanel group="difficulty" />)
    expect(screen.container.querySelector('#knob-mix-desc')).toBeNull()
    await act(async () => useStore.getState().params.setStart('mixing'))
    await expect.poll(() => screen.container.querySelector('.kv-row #knob-mix-desc')).not.toBeNull()
    await expect
      .element(screen.getByRole('slider', { name: 'mixing' }))
      .toHaveAttribute('aria-describedby', 'knob-mix-why knob-mix-desc')
  })

  // Live pass, 420×900: a description in a starved column read one word per
  // line. The paragraph runs under the whole row, so at 300px it has at least
  // half of it.
  it('gives a narrow panel enough width for a description to read, not one word a line', async () => {
    const screen = await render(
      <div style={{ width: '300px' }}>
        <KnobPanel group="board" />
      </div>,
    )
    await screen.getByRole('button', { name: 'About width' }).click()
    const help = screen.container.querySelector('#knob-W-desc')
    if (help === null) throw new Error('no description')
    expect(help.getBoundingClientRect().width).toBeGreaterThanOrEqual(150)
  })
})

describe('the dependency blocks', () => {
  const header = (container: HTMLElement) => {
    const found = container.querySelector<HTMLButtonElement>('.kv-dephd')
    if (found === null) throw new Error('no dependency header')
    return found
  }

  it('closes the skeleton block while both parents are 0, and says what it needs', async () => {
    const screen = await render(<KnobPanel group="skeleton" />)
    const head = header(screen.container)
    expect(head.textContent).toContain(EN.t('needsSkeleton'))
    expect(head.getAttribute('aria-expanded')).toBe('false')
    const body = document.getElementById(head.getAttribute('aria-controls') ?? '')
    expect(body?.hidden).toBe(true)
    // The six knobs are in the block, the two parents above it.
    expect(body?.querySelectorAll('.kv-row')).toHaveLength(6)
    expect(body?.querySelector('#knob-giants, #knob-wGiant')).toBeNull()
    await head.click()
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(body?.hidden).toBe(false)
  })

  // The engine turns the skeleton on with either parent (`skeletonOff`), so
  // `later share` alone opens the block — the reconstruction's "needs giants"
  // would have hidden live knobs.
  it.each([['giants' as const], ['wGiant' as const]])('opens it once %s alone is above 0', async (parent) => {
    const screen = await render(<KnobPanel group="skeleton" />)
    await act(async () => useStore.getState().params.setMany({ [parent]: specOf(parent).max }))
    const head = header(screen.container)
    expect(head.getAttribute('aria-expanded')).toBe('true')
    expect(head.textContent).toContain(EN.t('depSkeleton'))
  })

  it('names its two sub-sections', async () => {
    useStore.getState().params.setMany({ giants: 4 })
    const screen = await render(<KnobPanel group="skeleton" />)
    const subs = [...screen.container.querySelectorAll('.kv-sub')].map((el) => el.textContent)
    expect(subs).toEqual([EN.t('subLayout'), EN.t('subGrowth')])
  })

  // The block's reason is said once, in its header; a row's other reason is
  // still its own line.
  it('says the block’s reason once, and a row’s other reason under that row', async () => {
    const screen = await render(<KnobPanel group="skeleton" />)
    const span = screen.getByTestId('knob-giantSpan-why').element()
    expect(span.textContent).toBe('')
    expect(span.closest('.kv-row')?.classList.contains('off')).toBe(true)
    await act(async () => useStore.getState().params.setMany({ giants: 4, giantAnticoil: 6, anticoil: 6 }))
    const anticoil = screen.getByTestId('knob-giantAnticoil-why').element()
    expect(anticoil.textContent).toBe(`${EN.t('inactivePrefix')}${EN.reason('anticoilWins')}`)
    expect(screen.getByTestId('knob-giantSpan-why').element().textContent).toBe('')
  })

  // Live pass, 2026-09-23: the difficulty block's id is `probe`, and so is
  // its parent knob's key; as siblings in one list React warned and may drop
  // or duplicate a row on an update.
  it('keys the block apart from the knob that is its parent', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await render(<KnobPanel group="difficulty" />)
    const duplicate = error.mock.calls.filter((call) => String(call[0]).includes('same key'))
    error.mockRestore()
    expect(duplicate.map((call) => call.map(String).join(' '))).toEqual([])
  })

  it('opens itself for a knob the palette asked for', async () => {
    const screen = await render(<KnobPanel group="difficulty" />)
    expect(header(screen.container).getAttribute('aria-expanded')).toBe('false')
    await act(async () => useStore.getState().ui.requestFocus('knob-probeLen'))
    expect(header(screen.container).getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById('dep-probe')?.hidden).toBe(false)
  })

  // No rule of today's engine names a knob inside a block, and both writers
  // clamp to the range, so the refusal is put in the store by hand: this pins
  // the guard for the rule that one day will, so a refusal never lands in a
  // closed block.
  it('opens itself for a knob the engine refuses', async () => {
    const screen = await render(<KnobPanel group="difficulty" />)
    expect(header(screen.container).getAttribute('aria-expanded')).toBe('false')
    const refusal = { kind: 'range', key: 'probeLen', value: 999, min: 4, max: 200 } as const
    await act(async () =>
      useStore.setState((s) => ({ params: { ...s.params, broken: { ...s.params.broken, probeLen: [refusal] } } })),
    )
    expect(header(screen.container).getAttribute('aria-expanded')).toBe('true')
  })
})

describe('the lengths mix', () => {
  it('draws short, medium and the long rest, in percent', async () => {
    useStore.getState().params.setMany({ wShort: 0.3, wMid: 0.45 })
    const screen = await render(<KnobPanel group="lengths" />)
    const legend = screen.container.querySelector('.kv-mix .leg')?.textContent ?? ''
    expect(legend).toContain('short 30%')
    expect(legend).toContain('medium 45%')
    expect(legend).toContain('long 25%')
    const bar = screen.container.querySelector<HTMLElement>('.kv-mix .bar')
    expect(bar?.getAttribute('aria-hidden')).toBe('true')
  })

  // The cap is the sharesSum rule: a mark at 90% of the bar, and past it the
  // long share turns red.
  it('marks the short + medium cap at 90%, and reddens the long share past it', async () => {
    const screen = await render(<KnobPanel group="lengths" />)
    const bar = screen.container.querySelector('.kv-mix .bar')
    const cap = screen.container.querySelector('.kv-mix .cap')
    if (bar === null || cap === null) throw new Error('no mix bar')
    const b = bar.getBoundingClientRect()
    expect(cap.getBoundingClientRect().left - b.left).toBeCloseTo(b.width * 0.9, 0)
    expect(screen.container.querySelector('.kv-mix .l.bad')).toBeNull()
    await act(async () => useStore.getState().params.setMany({ wShort: 0.6, wMid: 0.35 }))
    expect(screen.container.querySelector('.kv-mix .l.bad')).not.toBeNull()
    expect(screen.container.querySelector('.kv-mix .leg .bad')).not.toBeNull()
  })
})
