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

// Handoff 2, PR 2: the knob rows draw their own track — rail, fill, thumb and
// the rule floor — under the native range input, which keeps the keyboard and
// the value while being invisible.
describe('the drawn track of a knob row', () => {
  const track = (floor?: number, onCommit: (v: number) => void = () => {}) => (
    <div className="fw" style={{ width: '200px' }}>
      <KnobTrack
        id="t"
        value={0.8}
        bounds={specOf('pStraight')}
        step={specOf('pStraight').step}
        floor={floor}
        word={null}
        describedBy="why desc"
        onCommit={onCommit}
      />
    </div>
  )

  it('draws the fill and the thumb at the value, over the whole rail', async () => {
    // The joined coarse/XS media query widens `.kv-g` at XS (spec §5); this
    // pins the desktop rail width, not the finger's.
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

  // The input covers the drawn track and is transparent: the platform's
  // keyboard, touch and value, with none of its look.
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

  it('marks a rule floor inside the track, and none at the track minimum', async () => {
    const at = await render(track(0.7))
    const floor = at.container.querySelector('.kv-track .floor')
    expect(floor?.getAttribute('title')).toBe('Rule bound: 0.7')
    at.unmount()
    const none = await render(track(0.6))
    expect(none.container.querySelector('.kv-track .floor')).toBeNull()
  })
})
