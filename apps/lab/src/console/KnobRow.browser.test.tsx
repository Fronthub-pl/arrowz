import { PARAM_SPEC } from '@arrowz/engine'
import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobTrack } from './KnobRow'
import '../design/tokens.css'
import '../design/console.css'

const specOf = (key: string) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`no spec for ${key}`)
  return spec
}

describe('the drawn track of a knob row', () => {
  const track = (floor?: number, onCommit: (v: number) => void = () => {}, word: string | null = null) => (
    <div className="fw" style={{ width: '200px' }}>
      <KnobTrack
        id="t"
        value={0.8}
        bounds={specOf('pStraight')}
        step={specOf('pStraight').step}
        floor={floor}
        word={word}
        describedBy="why desc"
        onCommit={onCommit}
      />
    </div>
  )

  it('draws the fill and the thumb at the value, over the whole rail', async () => {
    // The coarse/XS media query widens `.kv-g`; this pins the desktop rail width.
    await page.viewport(1400, 900)
    const screen = await render(track())
    const rail = screen.container.querySelector('.kv-track .rail')
    const fill = screen.container.querySelector('.kv-track .fill')
    const thumb = screen.container.querySelector('.kv-track .thumb')
    if (rail === null || fill === null || thumb === null) throw new Error('the track is not drawn')
    // 0.8 on 0.6..1 is half the track.
    const r = rail.getBoundingClientRect()
    expect(fill.getBoundingClientRect().width).toBeCloseTo(r.width / 2, 0)
    expect(thumb.getBoundingClientRect().left + 1 - r.left).toBeCloseTo(r.width / 2, 0)
  })

  it('lays the native input over the drawing, invisible, and commits from the keyboard', async () => {
    const onCommit = vi.fn()
    const screen = await render(track(undefined, onCommit))
    const input = screen.getByRole('slider').element()
    const box = screen.container.querySelector('.kv-track')
    if (!(input instanceof HTMLInputElement) || box === null) throw new Error('no input')
    expect(getComputedStyle(input).opacity).toBe('0')
    const i = input.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    for (const side of ['left', 'top', 'width', 'height'] as const) expect(i[side], side).toBeCloseTo(b[side], 0)
    expect(input.getAttribute('aria-describedby')).toBe('why desc')
    input.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onCommit).toHaveBeenCalledWith(0.81)
  })

  it('marks a rule floor inside the track', async () => {
    const screen = await render(track(0.7))
    const floor = screen.container.querySelector('.kv-track .floor')
    expect(floor?.getAttribute('title')).toBe('Rule bound: 0.7')
  })

  it('draws no marker for a floor at the track minimum', async () => {
    const screen = await render(track(0.6))
    expect(screen.container.querySelector('.kv-track .floor')).toBeNull()
  })

  it('states the value in words where the spec has one, not the number', async () => {
    const screen = await render(track(undefined, () => {}, 'auto'))
    const input = screen.getByRole('slider').element()
    if (!(input instanceof HTMLInputElement)) throw new Error('no input')
    expect(input.getAttribute('aria-valuetext')).toBe('auto')
  })

  it('draws no aria-valuetext for a plain number', async () => {
    const screen = await render(track())
    const input = screen.getByRole('slider').element()
    if (!(input instanceof HTMLInputElement)) throw new Error('no input')
    expect(input.hasAttribute('aria-valuetext')).toBe(false)
  })

  it('the rule floor does not raise the input minimum, because it is a marker, not a limit', async () => {
    const screen = await render(track(0.8))
    const input = screen.getByRole('slider').element()
    if (!(input instanceof HTMLInputElement)) throw new Error('no input')
    expect(input.getAttribute('min')).toBe('0.6')
  })
})
