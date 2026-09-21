import { PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import type { RunControl } from '../run/useRun'
import { buildCommands, type CommandDeps, matchCommands } from './commands'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {} }

function deps(): CommandDeps & { went: string[] } {
  const went: string[] = []
  return { control, navigate: (path) => went.push(path), dict: dictionary('en'), went }
}

beforeEach(() => {
  useStore.setState((state) => ({ ui: { ...state.ui, mode: 'advanced', entry: 'board', palette: false } }))
  useStore.getState().params.reset()
  useStore.getState().run.reset()
  useStore.getState().result.reset()
})

describe('the catalogue', () => {
  it('opens with the run actions, then navigation, then knobs, then presets', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const sections = [...new Set(rows.map((row) => row.section))]
    expect(sections).toEqual(['run', 'go', 'knob', 'preset'])
  })

  it('carries every knob the engine has, the start pair as one row', () => {
    const rows = buildCommands(deps(), useStore.getState()).filter((row) => row.section === 'knob')
    const starts = PARAM_SPEC.filter((spec) => spec.surface === 'start')
    expect(starts).toHaveLength(2)
    const ids = rows.map((row) => row.id)
    expect(ids).toContain('knob-seed')
    expect(ids).toContain('knob-start')
    for (const start of starts) expect(ids).not.toContain(`knob-${start.key}`)
    // The five preview numbers and the five preview flags travel with them.
    expect(ids).toContain('view-stroke')
    expect(ids).toContain('view-colored')
  })

  it('shows a knob its current value and hides its flag in the search text', () => {
    useStore.getState().params.setMany({ seed: 123 })
    const seed = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'knob-seed')
    expect(seed?.value).toBe('123')
    expect(seed?.hay).toContain('--seed')
  })

  // Spec D7: an unavailable command stays listed and says why, because a
  // command that vanishes is one nobody can find.
  it('lists Abort with a reason while nothing is running, and enables it during a run', () => {
    const idle = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(idle?.disabled).toBe(true)
    expect(idle?.value).toBe('nothing running')
    useStore.getState().run.started(useStore.getState().params.values)
    const running = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(running?.disabled).toBe(false)
  })

  it('refuses Generate against a broken rule, and says which way it is broken', () => {
    // wShort + wMid above 0.9 breaks `sharesSum`, the rule the envelope states.
    // (The brief and plan both write `wMed`; the engine's actual key is `wMid`
    // — see packages/engine/types.ts and the `sharesSum` rule in engine.ts.)
    useStore.getState().params.setMany({ wShort: 0.9, wMid: 0.9 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    const go = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-generate')
    expect(go?.disabled).toBe(true)
    expect(go?.value).toBe('rule broken')
  })

  it('navigates through the deps it was handed, not through the address bar', () => {
    const handed = deps()
    const rows = buildCommands(handed, useStore.getState())
    rows.find((row) => row.id === 'go-boards')?.run()
    expect(handed.went).toEqual(['/boards'])
  })

  it('offers every preset option under its level', () => {
    const rows = buildCommands(deps(), useStore.getState()).filter((row) => row.section === 'preset')
    expect(rows.length).toBe(26)
    expect(rows[0]?.note.length).toBeGreaterThan(0)
  })
})

describe('the matcher', () => {
  it('returns everything for an empty query, which is what the palette opens on', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, '')).toHaveLength(rows.length)
    expect(matchCommands(rows, '   ')).toHaveLength(rows.length)
  })

  it('matches a name, a note and a CLI flag, ignoring case', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, 'SEED').map((row) => row.id)).toContain('knob-seed')
    expect(matchCommands(rows, '--seed').map((row) => row.id)).toContain('knob-seed')
    expect(matchCommands(rows, 'board').length).toBeGreaterThan(0)
  })

  it('returns nothing for a query nothing carries', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(matchCommands(rows, 'zzzzz')).toEqual([])
  })

  // Spec D4: the mock's `slice(0, 40)` is dropped, and this is the assertion
  // that keeps it dropped — at 40 rows exactly, a cap would be invisible.
  it('caps nothing', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(rows.length).toBeGreaterThan(60)
  })
})
