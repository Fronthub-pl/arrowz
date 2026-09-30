import { defaultParams, type SeedRun } from '@arrowz/engine'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'
import { KnobTrack } from '../console/KnobRow'
import { ValueKnob } from '../console/ValueKnob'
import { ViewPanel } from '../console/ViewPanel'
import { ColoursSection } from '../console/rows/ColoursSection'
import { Section } from '../console/rows/Section'
import { twoFrames } from '../harness/frames'
import { resetApp } from '../harness/mountApp'
import { renderAt } from '../harness/renderAt'
import { SeriesSection } from '../report/SeriesSection'
import { StatRowView } from '../report/StatRowView'
import type { RunControl } from '../run/useRun'
import { specOf } from './params.slice'
import { useStore } from './store'

// Every export calls through. A pure child (no store hook) renders only when
// its parent does, so its calls count the parent's renders; a Profiler cannot,
// since it counts commits of the whole subtree, the row that reads the field included.
vi.mock('../console/KnobRow', { spy: true })
vi.mock('../console/rows/Section', { spy: true })
vi.mock('../report/StatRowView', { spy: true })

/** The calls `child` gets from `edit`, once `node` has mounted and settled. */
async function callsDuring(node: ReactNode, child: { mock: { calls: unknown[] } }, edit: () => void) {
  await renderAt(node)
  await twoFrames()
  const before = child.mock.calls.length
  edit()
  await twoFrames()
  return child.mock.calls.length - before
}

const control: RunControl = { start: vi.fn(), abort: vi.fn(), hold: vi.fn(), checkSeeds: vi.fn() }

function seriesDone() {
  const s = useStore.getState().series
  s.started({ ...defaultParams(), seed: 10 }, 2)
  const runs: SeedRun[] = [
    { seed: 10, outcome: 'complete', pieces: 10, maxLen: 20, genMs: 5, remaining: 0 },
    { seed: 11, outcome: 'incomplete', pieces: 9, maxLen: 9, genMs: 9, remaining: 312 },
  ]
  for (const run of runs) s.answered(run)
  s.finished()
}

beforeEach(() => {
  vi.clearAllMocks()
  resetApp('advanced')
})

test('a stroke edit does not re-render the preview panel', async () => {
  const calls = await callsDuring(<ViewPanel />, vi.mocked(Section), () =>
    useStore.getState().view.setNumber('stroke', '0.3'),
  )
  expect(calls).toBe(0)
})

test('turning the point grid on re-renders the preview panel, which reads it', async () => {
  const calls = await callsDuring(<ViewPanel />, vi.mocked(Section), () =>
    useStore.getState().view.toggle('showPoints'),
  )
  expect(calls).toBeGreaterThan(0)
})

test('a stroke edit does not re-render the colours section', async () => {
  const calls = await callsDuring(<ColoursSection />, vi.mocked(Section), () =>
    useStore.getState().view.setNumber('stroke', '0.3'),
  )
  expect(calls).toBe(0)
})

test('a paper edit re-renders the colours section, which reads it', async () => {
  const calls = await callsDuring(<ColoursSection />, vi.mocked(Section), () =>
    useStore.getState().view.setPaper('#112233'),
  )
  expect(calls).toBeGreaterThan(0)
})

test('committing the seed count does not re-render the series section', async () => {
  seriesDone()
  const calls = await callsDuring(<SeriesSection control={control} />, vi.mocked(StatRowView), () =>
    useStore.getState().series.setCount(7),
  )
  expect(calls).toBe(0)
})

test('a new answer re-renders the series section, which reads the runs', async () => {
  seriesDone()
  const calls = await callsDuring(<SeriesSection control={control} />, vi.mocked(StatRowView), () =>
    useStore
      .getState()
      .series.answered({ seed: 12, outcome: 'complete', pieces: 8, maxLen: 7, genMs: 4, remaining: 0 }),
  )
  expect(calls).toBeGreaterThan(0)
})

test('each colour row shows its own field', async () => {
  const view = useStore.getState().view
  view.setPaper('#111111')
  view.setInk('#222222')
  view.setHighlightColor('#333333')
  const screen = await renderAt(<ColoursSection />)
  const value = (id: string) => screen.container.querySelector<HTMLInputElement>(`input#${id}`)?.value
  expect([value('view-paper'), value('view-ink'), value('view-highlightColor')]).toEqual([
    '#111111',
    '#222222',
    '#333333',
  ])
})

test('a knob that stays broken does not re-render when another knob is edited', async () => {
  useStore.getState().params.set('Lmax', 5)
  const calls = await callsDuring(<ValueKnob spec={specOf('Lmax')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('W', 31),
  )
  expect(calls).toBe(0)
})

test('a valid knob does not re-render when another knob is edited', async () => {
  const calls = await callsDuring(<ValueKnob spec={specOf('W')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('H', 31),
  )
  expect(calls).toBe(0)
})

test('editing a broken knob re-renders it', async () => {
  useStore.getState().params.set('Lmax', 5)
  const calls = await callsDuring(<ValueKnob spec={specOf('Lmax')} />, vi.mocked(KnobTrack), () =>
    useStore.getState().params.set('Lmax', 6),
  )
  expect(calls).toBeGreaterThan(0)
})
