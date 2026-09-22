import { PARAM_SPEC } from '@arrowz/engine'
import { beforeEach, expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobPanel } from '../console/KnobPanel'
import { useStore } from '../state/store'
import './tokens.css'
import './shell.css'
import './console.css'

beforeEach(() => {
  const state = useStore.getState()
  state.params.reset()
  state.ui.setHelp(true)
})

const centre = (el: Element) => {
  const r = el.getBoundingClientRect()
  return r.top + r.height / 2
}

// Review P5: `.top` was flex on `baseline`, so a label wrapping to three lines
// kept its value beside the first. One grid, centred, keeps the pair together.
test('a knob value sits level with the middle of its label, however it wraps', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const tops = [...screen.container.querySelectorAll('.fw-k .top')]
  expect(tops.length).toBeGreaterThan(2)
  for (const top of tops) {
    const lab = top.querySelector('.lab')
    const num = top.querySelector('.num, select')
    if (lab === null || num === null) throw new Error('a knob without a label or a value')
    expect(Math.abs(centre(lab) - centre(num))).toBeLessThan(1)
  }
})

// Review change 3: every value ends on one axis per column.
test('values in one grid column end on one x', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const cards = [...screen.container.querySelectorAll<HTMLElement>('.fw-grid > .fw-k')]
  const left = Math.min(...cards.slice(0, 1).map((c) => c.getBoundingClientRect().left))
  const firstColumn = cards.filter((c) => Math.abs(c.getBoundingClientRect().left - left) < 1)
  const ends = firstColumn.map((c) => c.querySelector('.num, select')?.getBoundingClientRect().right ?? Number.NaN)
  expect(ends.length).toBeGreaterThan(1)
  for (const end of ends) expect(end).toBeCloseTo(ends[0] ?? Number.NaN, 0)
})

// Review change 1: 18px between rows of cards, from one declaration.
test('rows of cards are 18px apart', async () => {
  await page.viewport(1024, 768)
  const screen = await render(
    <div className="fw" style={{ width: '520px' }}>
      <KnobPanel group="lengths" />
    </div>,
  )
  const grid = screen.container.querySelector('.fw-grid')
  if (grid === null) throw new Error('no grid')
  expect(getComputedStyle(grid).rowGap).toBe('18px')
  expect(PARAM_SPEC.filter((s) => s.group === 'lengths').length).toBeGreaterThan(2)
})
