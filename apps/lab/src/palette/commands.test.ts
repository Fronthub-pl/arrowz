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
    const catalogueIds = rows.map((row) => row.id)
    expect(matchCommands(rows, '')).toHaveLength(rows.length)
    expect(matchCommands(rows, '   ')).toHaveLength(rows.length)
    // Length alone would pass even if the ranking silently reordered rows;
    // this pins the empty query to the catalogue's own order too.
    expect(matchCommands(rows, '').map((row) => row.id)).toEqual(catalogueIds)
    expect(matchCommands(rows, '   ').map((row) => row.id)).toEqual(catalogueIds)
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

  // The defect this guards: `run-reseed`'s name is "New seed" and its hay is
  // "seed", so before ranking it beat `knob-seed` (whose name simply is
  // "seed") on section order alone. Enter then ran the wrong row. The knob
  // must lead, and the action must still be reachable right behind it.
  it('puts a name that starts with the query ahead of a section that merely contains it', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const matches = matchCommands(rows, 'seed')
    expect(matches[0]?.id).toBe('knob-seed')
    expect(matches.map((row) => row.id)).toContain('run-reseed')
  })

  // Query 'run': it matches note ('run', shared by all five run-section rows)
  // and, incidentally, `knob-giantJitter`'s label ("cutting serpentine runs
  // short"). None of those six names *starts* with "run", so every match
  // lands in the same rank and the ranking must not reshuffle them — the
  // result must read in exactly the catalogue's own order.
  it('keeps the catalogue order among rows that tie in rank', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const catalogueOrder = rows.map((row) => row.id)
    const matches = matchCommands(rows, 'run').map((row) => row.id)
    expect(matches).toEqual(
      ['run-generate', 'run-reseed', 'run-defaults', 'run-abort', 'run-solo', 'knob-giantJitter'],
    )
    // Same order as in the unfiltered catalogue, just filtered down.
    expect(matches).toEqual(catalogueOrder.filter((id) => matches.includes(id)))
  })

  // Query 'docs': both `go-docs-element` ("Docs — Element") and `go-docs-cli`
  // ("Docs — Command line") start with it, and nothing else matches — so both
  // land in the *promoted* rank, the one the previous stability case does not
  // reach. Their relative order must still be the catalogue's.
  it('keeps the catalogue order between two rows that both get promoted', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const catalogueOrder = rows.map((row) => row.id)
    const matches = matchCommands(rows, 'docs').map((row) => row.id)
    expect(matches).toEqual(['go-docs-element', 'go-docs-cli'])
    expect(matches.indexOf('go-docs-element')).toBeLessThan(matches.indexOf('go-docs-cli'))
    expect(catalogueOrder.indexOf('go-docs-element')).toBeLessThan(catalogueOrder.indexOf('go-docs-cli'))
  })
})
