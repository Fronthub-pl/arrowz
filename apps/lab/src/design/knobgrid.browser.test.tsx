import { act } from 'react'
import { beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobPanel } from '../console/KnobPanel'
import { mountApp } from '../harness/mountApp'
import { RAIL_GROUPS } from '../state/ui.slice'
import { useStore } from '../state/store'
import './tokens.css'
import './shell.css'
import './console.css'
import './run.css'

beforeEach(() => {
  useStore.getState().params.reset()
})

/**
 * The bound tracks need a panel of 30ch + 188px (404px). Only XL's drawer
 * gives one: L's is capped at 34rem (360–400px of panel), and at 924
 * the panel is narrower still.
 */
const expectBoundsAt = (width: number) => width >= 1600

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

// A label, its value and its control share one line, level with each other.
test('a knob value and its control sit level with the middle of its label', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const lines = [...screen.container.querySelectorAll('.kv-row > .ln')]
  expect(lines.length).toBeGreaterThan(2)
  for (const line of lines) {
    const lab = line.querySelector('.kv-lab')
    const value = line.querySelector('.kv-num')
    const control = line.querySelector('.kv-track, select')
    if (lab === null || value === null || control === null) throw new Error('a row without its three parts')
    expect(Math.abs(centre(lab) - centre(value))).toBeLessThan(1)
    expect(Math.abs(centre(lab) - centre(control))).toBeLessThan(1)
  }
})

// The ruled rhythm: every row is 34px, a 1px rule under it, and the next row
// starts right under that rule.
test('rows are 34px, ruled, one under the next', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="shape" />
    </div>,
  )
  const rows = [...screen.container.querySelectorAll<HTMLElement>('.kv-g > .kv-row')]
  expect(rows).toHaveLength(4)
  for (const row of rows) {
    expect(row.querySelector('.ln')?.getBoundingClientRect().height).toBeCloseTo(34, 0)
    expect(getComputedStyle(row).boxShadow).toContain('0px 1px 0px')
  }
  const [a, b] = rows
  if (a === undefined || b === undefined) throw new Error('need two rows')
  expect(b.getBoundingClientRect().top).toBeCloseTo(a.getBoundingClientRect().bottom, 0)
})

// Every group and the preview, both languages, at 1440 and 924 (under the
// bound tracks' floor) and at 1920 (over it): every value ends on one x and
// every control starts on one x, across groups, and no short label is cut.
test.each([
  [1920, 1080, 'en'],
  [1440, 900, 'en'],
  [1440, 900, 'pl'],
  [924, 768, 'en'],
  [924, 768, 'pl'],
] as const)(
  'at %i×%i (%s) every group and the preview put values and controls on one x, and cut no label',
  async (w, h, lang) => {
    await page.viewport(w, h)
    const screen = await mountApp('advanced')
    await act(async () => useStore.getState().lang.setLang(lang))
    // The skeleton's and the probe's blocks open, so their rows are measured
    // too — the indent must come out of the label track alone.
    await act(async () => useStore.getState().params.setMany({ giants: 4, probe: 0.3 }))
    // The preview's two blocks open too.
    await act(async () => useStore.setState((s) => ({ view: { ...s.view, hilite: true, showPoints: true } })))
    const valueEnds = new Set<number>()
    const controlStarts = new Set<number>()
    const wideStarts = new Set<number>()
    let rows = 0
    for (const group of [...RAIL_GROUPS, 'preview' as const]) {
      await act(async () => useStore.getState().ui.select(group))
      for (const line of screen.container.querySelectorAll('.kv-row > .ln')) {
        rows++
        const lab = line.querySelector<HTMLElement>('.kv-lab')
        if (lab === null) throw new Error('a row without a label')
        expect(lab.scrollWidth, `${group}: "${lab.textContent}" is cut`).toBeLessThanOrEqual(lab.clientWidth)
        const value = line.querySelector('.vc')
        const control = line.querySelector('.cc')
        if (value === null || control === null) throw new Error('a row without its tracks')
        valueEnds.add(Math.round(value.getBoundingClientRect().right))
        // The palette's list takes the minimum's track as well, on purpose:
        // it starts where the minimum's track starts in every other row.
        const left = Math.round(control.getBoundingClientRect().left)
        if (control.classList.contains('wide')) wideStarts.add(left)
        else controlStarts.add(left)
      }
    }
    expect(rows).toBeGreaterThan(20)
    expect([...valueEnds]).toHaveLength(1)
    expect([...controlStarts]).toHaveLength(1)
    expect([...wideStarts]).toHaveLength(1)
    // Where the bound tracks show, the wide control starts where the
    // minimum's track does: one bound track and one column gap before the
    // control's. Under the floor, where they do not, on the control's own x. The
    // minimum's own box cannot say it: it is right-aligned in its track.
    const line = screen.container.querySelector('.kv-row > .ln')
    if (line === null) throw new Error('no row')
    const style = getComputedStyle(line)
    const lead = Number.parseFloat(style.columnGap) + Number.parseFloat(style.getPropertyValue('--end'))
    const [control] = [...controlStarts]
    if (control === undefined) throw new Error('no control x')
    expect([...wideStarts]).toEqual([expectBoundsAt(w) ? Math.round(control - lead) : control])
    const bounds = screen.container.querySelector('.kv-row .mx')
    const expectBounds = expectBoundsAt(w)
    expect(bounds === null ? false : getComputedStyle(bounds).display !== 'none').toBe(expectBounds)
  },
  60_000,
)
