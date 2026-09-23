import { PARAM_SPEC } from '@arrowz/engine'
import { describe, expect, it, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { KnobTrack } from './KnobRow'
import { KnobSlider } from './KnobSlider'
import '../design/tokens.css'
import '../design/console.css'

const specOf = (key: string) => {
  const spec = PARAM_SPEC.find((s) => s.key === key)
  if (!spec) throw new Error(`no spec for ${key}`)
  return spec
}

test('the slider carries the knob range and the current value', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('warns')} value={4} label="closing off nooks" onCommit={() => {}} />,
  )
  const slider = screen.getByRole('slider', { name: 'closing off nooks' })
  await expect.element(slider).toHaveAttribute('min', '2')
  await expect.element(slider).toHaveAttribute('max', '16')
  await expect.element(slider).toHaveAttribute('step', '1')
  await expect.element(slider).toHaveValue('4')
})

test('an arrow key commits one step, because that is what the engine accepts', async () => {
  const onCommit = vi.fn()
  const screen = await render(
    <KnobSlider spec={specOf('warns')} value={4} label="closing off nooks" onCommit={onCommit} />,
  )
  // Focus, not click: clicking a range input commits the value at the pointer,
  // so a click in the middle of a 2..16 track would fire onCommit(9) first and
  // the assertion below would be testing the click, not the key.
  const slider = screen.getByRole('slider').element()
  if (!(slider instanceof HTMLInputElement)) throw new Error('the slider is not an input')
  slider.focus()
  await userEvent.keyboard('{ArrowRight}')
  expect(onCommit).toHaveBeenCalledTimes(1)
  expect(onCommit).toHaveBeenCalledWith(5)
})

test('a knob whose value has a word says the word, not the number', async () => {
  // Lmax 0 is "auto" on the command line; a slider announcing "0" announces
  // a maximum length of zero.
  const screen = await render(<KnobSlider spec={specOf('Lmax')} value={0} label="maximum length" onCommit={() => {}} />)
  await expect.element(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'auto')
})

test('the rule floor is a marker, not a limit', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={0.75} label="straightness" onCommit={() => {}} />,
  )
  // The knob can still be set below the floor: refusing is the run's job.
  await expect.element(screen.getByRole('slider')).toHaveAttribute('min', '0.6')
  // Not `toBeVisible`: the marker is an empty inline element with no box, and
  // browser tests load no stylesheet, so a visibility check would fail on
  // correct markup.
  const marker = screen.container.querySelector('.bar u')
  expect(marker?.getAttribute('title')).toBe('Rule bound: 0.75')
})

test('a knob with no floor draws no marker', async () => {
  const screen = await render(<KnobSlider spec={specOf('warns')} value={4} label="nooks" onCommit={() => {}} />)
  expect(screen.container.querySelectorAll('.bar u')).toHaveLength(0)
})

test('the marker sits where the floor is, as a percentage of the track', async () => {
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={0.8} label="straightness" onCommit={() => {}} />,
  )
  // pStraight runs 0.6..1, so 0.8 is halfway.
  const marker = screen.container.querySelector('.bar u')
  expect(marker?.getAttribute('style')).toContain('50%')
})

test('a floor outside the knob range marks nothing', async () => {
  // The mix row is bounded to 0.3..0.7; a floor of 0.1 is not a mark on it.
  const screen = await render(
    <KnobSlider
      spec={specOf('mix')}
      value={0.5}
      bounds={{ min: 0.3, max: 0.7 }}
      floor={0.1}
      label="share"
      onCommit={() => {}}
    />,
  )
  expect(screen.container.querySelectorAll('.bar u')).toHaveLength(0)
})

test('a floor exactly at the knob minimum marks nothing, because it binds nothing', async () => {
  // pStraight runs 0.6..1; STRAIGHT_BASE is exactly 0.6 on a small board, and
  // the whole track is already legal, so a mark at 0% would claim otherwise.
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={0.6} label="straightness" onCommit={() => {}} />,
  )
  expect(screen.container.querySelectorAll('.bar u')).toHaveLength(0)
})

test('a floor exactly at the knob maximum marks the end of the track', async () => {
  // pStraight runs 0.6..1; STRAIGHT_TOP is exactly 1 for some boards, and a
  // floor there refuses every value but the last, which is worth marking.
  const screen = await render(
    <KnobSlider spec={specOf('pStraight')} value={0.6} floor={1} label="straightness" onCommit={() => {}} />,
  )
  const marker = screen.container.querySelector('.bar u')
  expect(marker?.getAttribute('style')).toContain('100%')
  expect(marker?.getAttribute('title')).toBe('Rule bound: 1')
})

// Handoff 2, PR 2: the knob rows draw their own track — rail, fill, thumb and
// the rule floor — under the native range input, which keeps the keyboard and
// the value while being invisible. The simple view keeps `KnobSlider` above.
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
    // The joined coarse/XS block (`console.css:891`) widens `.kv-g` at XS
    // (spec §5); this pins the desktop rail width, not the finger's.
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
