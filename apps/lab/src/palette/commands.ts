import { PARAM_SPEC } from '@arrowz/engine'
import { flagOf, wordFor } from '@arrowz/engine/command'
import type { Dict } from '@arrowz/engine/i18n'
import { PRESETS } from '@arrowz/engine/presets'
import { VIEW_FIELDS, VIEW_FLAGS } from '../console/viewFields'
import { applyPreset, defaults, generate, reseed } from '../run/actions'
import type { RunControl } from '../run/useRun'
import { readBand } from '../state/band'
import { type Store, useStore } from '../state/store'

export type CommandSection = 'run' | 'go' | 'knob' | 'preset'

/**
 * One row of the palette. The three visible columns are the mock's own
 * (`.lab`, `.g`, `.v`); `hay` is text that is searched and not shown, which is
 * how `--seed` finds the seed knob.
 *
 * `disabled` does not remove a row: it is listed with its reason where a
 * value would be, because a command that disappears is one nobody can find.
 */
export interface Command {
  readonly id: string
  readonly section: CommandSection
  readonly name: string
  readonly note: string
  readonly value: string
  readonly hay: string
  readonly disabled: boolean
  run(): void
}

export interface CommandDeps {
  readonly control: RunControl
  readonly navigate: (path: string) => void
  readonly dict: Dict
}

/** A jump: the face, then the panel that holds the control, then the control itself. */
function jumpTo(deps: CommandDeps, entry: Parameters<Store['ui']['select']>[0], id: string): void {
  const ui = useStore.getState().ui
  // ⌘K is bound on every route, but the knobs are the lab face's alone:
  // `/boards` puts the library in the panel slot and `/docs/*` hides the
  // workspace.
  deps.navigate('/')
  // The knobs do not exist in the simple view either, so the jump has to bring
  // the console that has them.
  if (ui.mode === 'simple') ui.setMode('advanced')
  ui.select(entry)
  // The control has to be on screen, not merely in the tree: below 1024 the
  // settings drawer starts closed, and at XS the console is not rendered until
  // its sheet opens. The drawer is remembered open, as pressing `s` would.
  if (readBand() === 'xs') ui.setSheet('settings')
  else if (!ui.settings) ui.setSettings(true)
  ui.requestFocus(id)
  ui.closePalette()
}

function knobRows(deps: CommandDeps, state: Store): Command[] {
  const rows: Command[] = []
  let startDone = false
  for (const spec of PARAM_SPEC) {
    if (spec.surface === 'start') {
      // One control for the pair, exactly as `KnobPanel` draws it.
      if (startDone) continue
      startDone = true
      rows.push({
        id: 'knob-start',
        section: 'knob',
        name: deps.dict.d.start.label,
        note: deps.dict.d.groups[spec.group],
        value: '--start',
        hay: '--start',
        disabled: false,
        run: () => jumpTo(deps, spec.group, 'knob-start'),
      })
      continue
    }
    const { label } = deps.dict.paramText(spec)
    const value = state.params.values[spec.key]
    rows.push({
      id: `knob-${spec.key}`,
      section: 'knob',
      name: label,
      note: deps.dict.d.groups[spec.group],
      // The CLI's word where the value has one, so a slider reading `auto`
      // does not offer a bare 0.
      value: wordFor(spec.key, value) ?? String(value),
      hay: flagOf(spec.key),
      disabled: false,
      run: () => jumpTo(deps, spec.group, `knob-${spec.key}`),
    })
  }
  for (const field of VIEW_FIELDS) {
    rows.push({
      id: `view-${field.field}`,
      section: 'knob',
      name: deps.dict.t(field.label),
      note: deps.dict.t('preview'),
      value: String(state.view[field.field]),
      hay: field.field,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${field.field}`),
    })
  }
  for (const flag of VIEW_FLAGS) {
    rows.push({
      id: `view-${flag.flag}`,
      section: 'knob',
      name: deps.dict.t(flag.label),
      note: deps.dict.t('preview'),
      value: deps.dict.t(state.view[flag.flag] ? 'valueOn' : 'valueOff'),
      hay: flag.flag,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${flag.flag}`),
    })
  }
  return rows
}

function presetRows(deps: CommandDeps): Command[] {
  const levels = deps.dict.d.presets.levels as Partial<Record<string, string>>
  const rows: Command[] = []
  for (const level of PRESETS) {
    for (const option of level.options) {
      const W = option.params.W ?? 0
      const H = option.params.H ?? 0
      rows.push({
        id: `preset-${option.id}`,
        section: 'preset',
        name: deps.dict.d.presets.modes[option.mode],
        note: levels[level.id] ?? level.id,
        value: `${W}×${H}`,
        hay: option.id,
        disabled: false,
        run: () => {
          applyPreset(deps.control, option.params)
          useStore.getState().ui.closePalette()
        },
      })
    }
  }
  return rows
}

/** Every row the palette can show, in the order it shows them. */
export function buildCommands(deps: CommandDeps, state: Store): Command[] {
  const { dict } = deps
  const running = state.run.phase === 'running'
  const broken = state.params.violations.length > 0
  const run: Command[] = [
    {
      id: 'run-generate',
      section: 'run',
      name: dict.t('generate'),
      note: dict.t('cmdSecRun'),
      // The broken rule first: it is the state a person has to do something
      // about, and it is still true while a carve is going.
      value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : 'g',
      hay: 'generate',
      disabled: running || broken,
      run: () => {
        generate(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-reseed',
      section: 'run',
      name: dict.t('reseed'),
      note: dict.t('cmdSecRun'),
      // The hotkey while the row can be used, the reason while it cannot: one
      // column, and the reason wins.
      value: running ? dict.t('cmdRunning') : '[ ]',
      hay: 'seed',
      disabled: running,
      run: () => {
        reseed(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-defaults',
      section: 'run',
      name: dict.t('reset'),
      note: dict.t('cmdSecRun'),
      value: running ? dict.t('cmdRunning') : '',
      hay: 'defaults reset',
      disabled: running,
      run: () => {
        defaults(deps.control)
        state.ui.closePalette()
      },
    },
    {
      id: 'run-abort',
      section: 'run',
      name: dict.t('abort'),
      note: dict.t('cmdSecRun'),
      value: running ? '' : dict.t('cmdNoRun'),
      hay: 'abort stop',
      disabled: !running,
      run: () => {
        deps.control.abort()
        state.ui.closePalette()
      },
    },
    {
      id: 'run-solo',
      section: 'run',
      name: dict.t('fullView'),
      note: dict.t('cmdSecRun'),
      value: 'f',
      hay: 'solo full',
      disabled: false,
      run: () => {
        state.ui.toggleSolo()
        state.ui.closePalette()
      },
    },
  ]
  const go: Command[] = [
    goRow(deps, 'go-lab', dict.t('tabLab'), '/'),
    goRow(deps, 'go-boards', dict.t('tabLibrary'), '/boards'),
    goRow(deps, 'go-docs-element', `${dict.t('tabDocs')} — ${dict.t('docsElement')}`, '/docs/element'),
    goRow(deps, 'go-docs-cli', `${dict.t('tabDocs')} — ${dict.t('docsCli')}`, '/docs/cli'),
    {
      id: 'go-view',
      section: 'go',
      name: state.ui.mode === 'simple' ? dict.t('cmdViewAdvanced') : dict.t('cmdViewSimple'),
      note: dict.t('cmdSecGo'),
      value: '',
      hay: 'view mode simple advanced',
      disabled: false,
      run: () => {
        state.ui.setMode(state.ui.mode === 'simple' ? 'advanced' : 'simple')
        state.ui.closePalette()
      },
    },
    {
      id: 'go-lang',
      section: 'go',
      name: state.lang.lang === 'pl' ? dict.t('cmdLangToEn') : dict.t('cmdLangToPl'),
      note: dict.t('cmdSecGo'),
      value: state.lang.lang === 'pl' ? 'EN' : 'PL',
      hay: 'language polski english',
      disabled: false,
      run: () => {
        state.lang.setLang(state.lang.lang === 'pl' ? 'en' : 'pl')
        state.ui.closePalette()
      },
    },
  ]
  // No export rows: each export is a closure inside `ExportButtons` holding a
  // worker or a per-board hash, reachable only by clicking its button.
  return [...run, ...go, ...knobRows(deps, state), ...presetRows(deps)]
}

function goRow(deps: CommandDeps, id: string, name: string, path: string): Command {
  return {
    id,
    section: 'go',
    name,
    note: deps.dict.t('cmdSecGo'),
    value: '',
    hay: path,
    disabled: false,
    run: () => {
      deps.navigate(path)
      useStore.getState().ui.closePalette()
    },
  }
}

/**
 * A case-insensitive substring over what a row shows and what it hides (the
 * CLI flag, since the live command line is on the same screen).
 *
 * Rows whose name *starts with* the query come first; otherwise section order
 * decides, and "New seed" (`run`) would beat the knob named "seed". The
 * partition is stable within each group.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...commands]
  const matches = commands.filter((command) =>
    `${command.name} ${command.note} ${command.hay}`.toLowerCase().includes(q),
  )
  const startsWithQuery = matches.filter((command) => command.name.toLowerCase().startsWith(q))
  const rest = matches.filter((command) => !command.name.toLowerCase().startsWith(q))
  return [...startsWithQuery, ...rest]
}
