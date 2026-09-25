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

// File scope: a reset inside a describe would leave every case declared above
// the block running on whatever the case before it left behind.
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
  await expect.element(screen.getByText('coil penalty', { exact: true })).toBeVisible()
})

test('a row labels its knob with the short term and keeps the sentence in its title', async () => {
  const screen = await render(<KnobPanel group="shape" />)
  const label = screen.container.querySelector('label[for="knob-anticoil"]')
  expect(label?.textContent).toBe('coil penalty')
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
  await expect.element(screen.getByRole('combobox', { name: /arrow start/i })).toBeVisible()
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

test('a group with help prints it under the heading', async () => {
  const screen = await render(<KnobPanel group="closing" />)
  await expect.element(screen.getByText(/gets stuck/)).toBeVisible()
})

describe('the description on demand', () => {
  // Not `toBeVisible()`: a 1x1px clipped box still has a bounding rect, so it
  // cannot tell `.fw-vh` from a small element. `clipPath`/`position` are what
  // the CSS sets.
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
      .element(screen.getByRole('slider', { name: 'tunnel share' }))
      .toHaveAttribute('aria-describedby', 'knob-mix-why knob-mix-desc')
  })

  // The paragraph runs under the whole row, not in one starved track, so a
  // 300px panel still gives it at least half.
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

  // The engine turns the skeleton on with either parent (`skeletonOff`).
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

  // The difficulty block's id is `probe`, as is its parent knob's key; as
  // siblings in one list React warns and may drop or duplicate a row.
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

  // No rule names a knob inside a block and both writers clamp, so the refusal
  // is put in the store by hand: this guards the rule that one day will, so a
  // refusal never sits in a closed block unnoticed.
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
