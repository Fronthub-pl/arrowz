import { PARAM_SPEC } from '@arrowz/engine'
import { dictionary } from '@arrowz/engine/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { PALETTE_CAP } from '../state/view.slice'
import type { RunControl } from '../run/useRun'
import { buildCommands, type CommandDeps, type CommandSection, matchCommands } from './commands'

const control: RunControl = { start: () => {}, abort: () => {}, hold: () => {}, checkSeeds: () => {} }

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
  it('opens with the run actions, then navigation, then knobs, then presets, and never turns back', () => {
    const order: CommandSection[] = ['run', 'go', 'knob', 'preset']
    const rows = buildCommands(deps(), useStore.getState())
    expect([...new Set(rows.map((row) => row.section))]).toEqual(order)
    // First occurrences alone would pass a preset row dropped among the knobs:
    // the sequence has to be non-decreasing row by row.
    for (let i = 1; i < rows.length; i += 1) {
      const before = rows[i - 1]
      const row = rows[i]
      if (before === undefined || row === undefined) throw new Error('the catalogue is shorter than it says')
      expect(order.indexOf(row.section), `${before.id} then ${row.id}`).toBeGreaterThanOrEqual(
        order.indexOf(before.section),
      )
    }
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

  it('words a view flag row’s value in the page’s language', () => {
    useStore.setState((state) => ({ view: { ...state.view, rounded: true, colored: false } }))
    const rows = buildCommands({ ...deps(), dict: dictionary('pl') }, useStore.getState())
    expect(rows.find((row) => row.id === 'view-rounded')?.value).toBe(dictionary('pl').t('valueOn'))
    expect(rows.find((row) => row.id === 'view-colored')?.value).toBe(dictionary('pl').t('valueOff'))
  })

  it('shows a knob its current value and hides its flag in the search text', () => {
    useStore.getState().params.setMany({ seed: 123 })
    const seed = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'knob-seed')
    expect(seed?.value).toBe('123')
    expect(seed?.hay).toContain('--seed')
  })

  it('words a choice knob’s value as the knob does, and still finds it by its flag', () => {
    useStore.getState().params.setMany({ trapBias: 0 })
    const row = (lang: 'en' | 'pl') =>
      buildCommands({ ...deps(), dict: dictionary(lang) }, useStore.getState()).find((r) => r.id === 'knob-trapBias')
    expect(row('en')?.value).toBe('normal')
    expect(row('pl')?.value).toBe('normalnie')
    expect(row('en')?.hay).toContain('--trapbias')
    const hits = matchCommands(buildCommands(deps(), useStore.getState()), 'giants').map((r) => r.id)
    expect(hits).toContain('knob-giants')
  })

  it('lists Abort with a reason while nothing is running, and enables it during a run', () => {
    const idle = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(idle?.disabled).toBe(true)
    expect(idle?.value).toBe('nothing running')
    useStore.getState().run.started(useStore.getState().params.values)
    const running = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-abort')
    expect(running?.disabled).toBe(false)
  })

  it('renames the abort row to Discard once a stop is requested, keeping it enabled', () => {
    useStore.getState().run.started(useStore.getState().params.values)
    useStore.getState().run.stopRequested()
    const row = buildCommands(deps(), useStore.getState()).find((r) => r.id === 'run-abort')
    expect(row?.name).toBe('Discard')
    expect(row?.disabled).toBe(false)
  })

  it('lists Check seeds under run, disabled only during a run, and runs it through the control it was handed', () => {
    const idle = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-check-seeds')
    expect(idle?.name).toBe('Check seeds')
    expect(idle?.section).toBe('run')
    expect(idle?.disabled).toBe(false)
    useStore.getState().run.started(useStore.getState().params.values)
    const running = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-check-seeds')
    expect(running?.disabled).toBe(true)
    useStore.getState().run.reset()
    const calls: string[] = []
    const control: RunControl = {
      start: () => {},
      abort: () => {},
      hold: () => {},
      checkSeeds: () => calls.push('checkSeeds'),
    }
    useStore.getState().ui.openPalette()
    buildCommands({ ...deps(), control }, useStore.getState())
      .find((row) => row.id === 'run-check-seeds')
      ?.run()
    expect(calls).toEqual(['checkSeeds'])
    expect(useStore.getState().ui.palette).toBe(false)
  })

  it('refuses Generate against a broken rule, and says which way it is broken', () => {
    // wShort + wMid above 0.9 breaks `sharesSum`.
    useStore.getState().params.setMany({ wShort: 0.9, wMid: 0.9 })
    expect(useStore.getState().params.violations.length).toBeGreaterThan(0)
    const go = buildCommands(deps(), useStore.getState()).find((row) => row.id === 'run-generate')
    expect(go?.disabled).toBe(true)
    expect(go?.value).toBe('invalid settings')
  })

  // Over the whole catalogue, so a row added later cannot be disabled in
  // silence; against the dictionary's reasons, not "not empty", because a
  // hotkey such as `[ ]` is not a reason.
  it('never disables a row without giving one of D7’s reasons', () => {
    const dict = dictionary('en')
    const reasons = [dict.t('cmdNoRun'), dict.t('cmdRunning'), dict.t('cmdBroken')]
    const broken = () => useStore.getState().params.setMany({ wShort: 0.9, wMid: 0.9 })
    const running = () => useStore.getState().run.started(useStore.getState().params.values)
    const states: [string, () => void][] = [
      ['idle', () => {}],
      ['a carve going', running],
      ['a broken rule', broken],
      [
        'a carve going against a broken rule',
        () => {
          broken()
          running()
        },
      ],
    ]
    for (const [name, arrange] of states) {
      useStore.getState().params.reset()
      useStore.getState().run.reset()
      arrange()
      const off = buildCommands(deps(), useStore.getState()).filter((row) => row.disabled)
      // Each of these states disables something; a state that disabled nothing
      // would make the loop below vacuous.
      expect(off.length, name).toBeGreaterThan(0)
      for (const row of off) expect(reasons, `${name}: ${row.id}`).toContain(row.value)
    }
  })

  it('navigates through the deps it was handed, not through the address bar', () => {
    const handed = deps()
    const rows = buildCommands(handed, useStore.getState())
    rows.find((row) => row.id === 'go-boards')?.run()
    expect(handed.went).toEqual(['/boards'])
  })

  it('lists Open file… under go, never disabled', () => {
    const row = buildCommands(deps(), useStore.getState()).find((r) => r.id === 'go-open-file')
    expect(row?.name).toBe('Open file…')
    expect(row?.section).toBe('go')
    expect(row?.disabled).toBe(false)
  })

  it('offers every preset option under its level', () => {
    const rows = buildCommands(deps(), useStore.getState()).filter((row) => row.section === 'preset')
    expect(rows.length).toBe(26)
    expect(rows[0]?.note.length).toBeGreaterThan(0)
  })

  it('reaches every colour and element field of the Preview panel, in its order', () => {
    const ids = buildCommands(deps(), useStore.getState())
      .filter((row) => row.section === 'knob')
      .map((row) => row.id)
    const look = [
      'view-pad',
      'view-pointColor',
      'view-pointRadius',
      'view-theme',
      'view-paper',
      'view-ink',
      'view-highlightColor',
      'view-palette',
    ]
    expect(ids.filter((id) => look.includes(id))).toEqual(look)
  })

  it('words an unset colour, an empty palette and no theme, and finds a field by its CLI flag', () => {
    const before = useStore.getState().view
    useStore.getState().view.apply({ theme: '', palette: [], paper: '', ink: '#112233' })
    try {
      const en = dictionary('en')
      const rows = buildCommands(deps(), useStore.getState())
      const value = (id: string) => rows.find((row) => row.id === id)?.value
      expect(value('view-theme')).toBe(en.t('viewThemeNone'))
      expect(value('view-palette')).toBe(en.t('paletteCount', 0, 8))
      expect(value('view-paper')).toBe(en.t('valueNotSet'))
      expect(value('view-ink')).toBe('#112233')
      expect(matchCommands(rows, '--highlight-color').map((row) => row.id)).toContain('view-highlightColor')
      expect(matchCommands(rows, '--pad').map((row) => row.id)).toContain('view-pad')
    } finally {
      useStore
        .getState()
        .view.apply({ theme: before.theme, palette: before.palette, paper: before.paper, ink: before.ink })
    }
  })

  it('sends a full palette to its first colour, since the add button is disabled there', () => {
    const before = useStore.getState().view.palette
    useStore.getState().view.setPalette(Array.from({ length: PALETTE_CAP }, () => '#112233'))
    try {
      const focused: (string | null)[] = []
      const unsubscribe = useStore.subscribe((state) => focused.push(state.ui.focusTarget))
      buildCommands(deps(), useStore.getState())
        .find((row) => row.id === 'view-palette')
        ?.run()
      unsubscribe()
      expect(focused.at(-1)).toBe('view-palette-0')
    } finally {
      useStore.getState().view.setPalette(before)
    }
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

  // The mock capped the list at 40 rows; above 60 such a cap would show.
  it('caps nothing', () => {
    const rows = buildCommands(deps(), useStore.getState())
    expect(rows.length).toBeGreaterThan(60)
  })

  // `run-reseed` ("New seed", hay "seed") comes first in section order; the
  // knob must still lead, and the action stay reachable.
  it('puts a name that starts with the query ahead of a section that merely contains it', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const matches = matchCommands(rows, 'seed')
    expect(matches[0]?.id).toBe('knob-seed')
    expect(matches.map((row) => row.id)).toContain('run-reseed')
  })

  // No name starts with 'top'; "how many longest" carries it as a word, Abort
  // only inside one (its hidden 'stop').
  it('puts a query found at the start of a word ahead of one found inside a word', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const matches = matchCommands(rows, 'top').map((row) => row.id)
    expect(matches).toContain('run-abort')
    expect(matches[0]).toBe('view-top')
  })

  // 'run' matches the six run rows' note, and `knob-giantStep`'s and
  // `knob-giantJitter`'s label; no name starts with it, so all eight share one rank.
  it('keeps the catalogue order among rows that tie in rank', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const catalogueOrder = rows.map((row) => row.id)
    const matches = matchCommands(rows, 'run').map((row) => row.id)
    expect(matches).toEqual([
      'run-generate',
      'run-reseed',
      'run-defaults',
      'run-abort',
      'run-check-seeds',
      'run-solo',
      'knob-giantStep',
      'knob-giantJitter',
    ])
    // Same order as in the unfiltered catalogue, just filtered down.
    expect(matches).toEqual(catalogueOrder.filter((id) => matches.includes(id)))
  })

  // Both docs rows' names start with 'docs': the promoted rank, which the case
  // above does not reach.
  it('keeps the catalogue order between two rows that both get promoted', () => {
    const rows = buildCommands(deps(), useStore.getState())
    const catalogueOrder = rows.map((row) => row.id)
    const matches = matchCommands(rows, 'docs').map((row) => row.id)
    expect(matches).toEqual(['go-docs-element', 'go-docs-cli'])
    expect(matches.indexOf('go-docs-element')).toBeLessThan(matches.indexOf('go-docs-cli'))
    expect(catalogueOrder.indexOf('go-docs-element')).toBeLessThan(catalogueOrder.indexOf('go-docs-cli'))
  })
})
