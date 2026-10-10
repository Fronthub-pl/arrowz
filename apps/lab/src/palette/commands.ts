import { PARAM_SPEC } from '@fronthub/arrowz-engine'
import { flagOf, wordFor } from '@fronthub/arrowz-engine/command'
import type { Dict } from '@fronthub/arrowz-engine/i18n'
import { PRESETS } from '@fronthub/arrowz-engine/presets'
import { DOCS_PAGE_NAMES, DOCS_PAGES } from '../docs/pages'
import type { PlainUiKey } from '../console/viewFields'
import { VIEW_FLAGS, VIEW_NUMBERS, VIEW_ROWS } from '../console/viewFields'
import { openFilePicker } from '../library/BoardFileInput'
import { saveRefusal, saveShown } from '../library/saveShown'
import { applyPreset, defaults, generate, generateAndSave, reseed } from '../run/actions'
import { inFlight, type RunControl } from '../run/useRun'
import { readBand } from '../state/band'
import { type Store, useStore } from '../state/store'
import { lookOf, PALETTE_CAP } from '../state/view.slice'

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
    // The CLI's word where the value has one, worded as the knob shows it, so
    // a slider reading `auto` does not offer a bare 0.
    const word = wordFor(spec.key, value)
    rows.push({
      id: `knob-${spec.key}`,
      section: 'knob',
      name: label,
      note: deps.dict.d.groups[spec.group],
      value: word === null ? String(value) : deps.dict.choiceText(spec.key, word),
      hay: flagOf(spec.key),
      disabled: false,
      run: () => jumpTo(deps, spec.group, `knob-${spec.key}`),
    })
  }
  for (const field of VIEW_NUMBERS) {
    rows.push({
      id: `view-${field}`,
      section: 'knob',
      name: deps.dict.t(VIEW_ROWS[field].label),
      note: deps.dict.t('preview'),
      value: String(state.view[field]),
      hay: field,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${field}`),
    })
  }
  for (const flag of VIEW_FLAGS) {
    rows.push({
      id: `view-${flag}`,
      section: 'knob',
      name: deps.dict.t(VIEW_ROWS[flag].label),
      note: deps.dict.t('preview'),
      value: deps.dict.t(state.view[flag] ? 'valueOn' : 'valueOff'),
      hay: flag,
      disabled: false,
      run: () => jumpTo(deps, 'preview', `view-${flag}`),
    })
  }
  return rows
}

/**
 * The Preview panel's colour and element fields, in its order. The value is
 * worded as the panel shows it; `hay` carries the CLI's flag, so a word the
 * lab does not show (`paper`, `ink`) still finds its row.
 */
function lookRows(deps: CommandDeps, state: Store): Command[] {
  const { dict } = deps
  const look = lookOf(state.view)
  const colour = (value: string) => (value === '' ? dict.t('valueNotSet') : value)
  const row = (id: string, label: PlainUiKey, value: string, hay: string, target = id): Command => ({
    id,
    section: 'knob',
    name: dict.t(label),
    note: dict.t('preview'),
    value,
    hay,
    disabled: false,
    run: () => jumpTo(deps, 'preview', target),
  })
  return [
    row('view-pad', 'padLabel', String(look.pad), '--pad pad'),
    row('view-pointColor', 'pointColorLabel', look.pointColor, '--point-color'),
    row('view-pointRadius', 'pointRadiusLabel', String(look.pointRadius), '--point-radius'),
    row('view-theme', 'themeLabel', look.theme === '' ? dict.t('viewThemeNone') : look.theme, '--theme theme'),
    row('view-paper', 'paperLabel', colour(look.paper), '--paper paper'),
    row('view-ink', 'inkLabel', colour(look.ink), '--ink ink'),
    row('view-highlightColor', 'highlightColorLabel', colour(look.highlight), '--highlight-color highlight'),
    // At the cap the add button is disabled and cannot take the focus.
    row(
      'view-palette',
      'paletteLabel',
      dict.t('paletteCount', look.palette.length, PALETTE_CAP),
      '--palette palette',
      look.palette.length >= PALETTE_CAP ? 'view-palette-0' : 'view-palette',
    ),
  ]
}

/**
 * A preset row's `run` rewrites every knob before `applyPreset` can refuse a
 * series, so it is off during one; a normal run is replaced, as `PresetStrip` does.
 */
function presetRows(deps: CommandDeps, series: boolean): Command[] {
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
        value: series ? deps.dict.t('cmdRunning') : `${W}×${H}`,
        hay: option.id,
        disabled: series,
        run: () => {
          applyPreset(deps.control, option.params)
          useStore.getState().ui.closePalette()
        },
      })
    }
  }
  return rows
}

/**
 * A run row's `run`: the lab first, then the action. Off the lab the stage
 * shows a stored board or nothing, so a run or a save there would act on a
 * board that is not on screen.
 */
function onLab(deps: CommandDeps, state: Store, act: () => void): () => void {
  return () => {
    deps.navigate('/')
    act()
    state.ui.closePalette()
  }
}

/** Every row the palette can show, in the order it shows them. */
export function buildCommands(deps: CommandDeps, state: Store): Command[] {
  const { dict } = deps
  const running = inFlight(state)
  const broken = state.params.violations.length > 0
  const refusal = saveRefusal(state)
  const run: Command[] = [
    {
      id: 'run-generate',
      section: 'run',
      name: dict.t('generate'),
      note: dict.t('cmdSecRun'),
      // The broken rule first: it is the state a person has to do something
      // about, and it is still true while a carve is going.
      value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : 'G',
      hay: 'generate',
      disabled: running || broken,
      run: onLab(deps, state, () => generate(deps.control)),
    },
    {
      id: 'run-generate-save',
      section: 'run',
      name: dict.t('generateAndSave'),
      note: dict.t('cmdSecRun'),
      value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : '⌘G',
      hay: 'generate save store keep',
      disabled: running || broken,
      run: onLab(deps, state, () => generateAndSave(deps.control)),
    },
    {
      id: 'run-save',
      section: 'run',
      name: dict.t('saveBoard'),
      note: dict.t('cmdSecRun'),
      // The board on screen, so a carve in flight does not stop it.
      value: refusal === null ? '⌘S' : dict.t(refusal),
      hay: 'save store keep',
      disabled: refusal !== null,
      run: onLab(deps, state, () => saveShown()),
    },
    {
      id: 'run-reseed',
      section: 'run',
      name: dict.t('reseed'),
      note: dict.t('cmdSecRun'),
      // No key draws a random seed: `[` and `]` step it (`stepSeed`).
      value: running ? dict.t('cmdRunning') : '',
      hay: 'seed',
      disabled: running,
      run: onLab(deps, state, () => reseed(deps.control)),
    },
    {
      id: 'run-defaults',
      section: 'run',
      name: dict.t('reset'),
      note: dict.t('cmdSecRun'),
      value: running ? dict.t('cmdRunning') : '',
      hay: 'defaults reset',
      disabled: running,
      run: onLab(deps, state, () => defaults(deps.control)),
    },
    {
      id: 'run-abort',
      section: 'run',
      name: state.run.stopping || state.series.stopping ? dict.t('abortDiscard') : dict.t('abort'),
      note: dict.t('cmdSecRun'),
      value: running ? '' : dict.t('cmdNoRun'),
      hay: 'abort stop',
      disabled: !running,
      run: () => {
        deps.control.abort()
        state.ui.closePalette()
      },
    },
    // `RunColumn` hides `SeriesRow` in the simple view, so the row is absent
    // here too rather than disabled, with nothing on screen for it to reach.
    ...(state.ui.mode === 'simple'
      ? []
      : [
          {
            id: 'run-check-seeds',
            section: 'run' as const,
            name: dict.t('checkSeeds'),
            note: dict.t('cmdSecRun'),
            value: broken ? dict.t('cmdBroken') : running ? dict.t('cmdRunning') : '',
            hay: 'check seeds series many rate',
            disabled: running || broken,
            run: onLab(deps, state, () => deps.control.checkSeeds()),
          },
        ]),
    {
      id: 'run-solo',
      section: 'run',
      name: dict.t('fullView'),
      note: dict.t('cmdSecRun'),
      value: 'F',
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
    {
      id: 'go-open-file',
      section: 'go',
      name: dict.t('openFile'),
      note: dict.t('cmdSecGo'),
      value: '',
      hay: 'open file board json load disk',
      disabled: false,
      // Inside the row's own click or Enter: a file dialog opens only on a user gesture.
      run: () => {
        openFilePicker()
        state.ui.closePalette()
      },
    },
    ...DOCS_PAGES.map((page) =>
      goRow(deps, `go-docs-${page}`, `${dict.t('tabDocs')} — ${dict.t(DOCS_PAGE_NAMES[page])}`, `/docs/${page}`),
    ),
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
  return [
    ...run,
    ...go,
    ...knobRows(deps, state),
    ...lookRows(deps, state),
    ...presetRows(deps, state.series.phase === 'running'),
  ]
}

const IDLE: RunControl = { start: () => {}, abort: () => {}, hold: () => {}, checkSeeds: () => {} }

/**
 * The run and go-to rows as the Docs tab lists them: the advanced view, in
 * `dict`'s language, nothing stopping, whatever the lab is doing now. The ⌘K
 * rows change with that state (Check seeds, Discard); a reference table does not.
 */
export function docsPaletteRows(dict: Dict, state: Store): Command[] {
  const fixed: Store = {
    ...state,
    ui: { ...state.ui, mode: 'advanced' },
    lang: { ...state.lang, lang: dict.lang },
    run: { ...state.run, stopping: false },
    series: { ...state.series, stopping: false },
  }
  return buildCommands({ control: IDLE, navigate: () => {}, dict }, fixed).filter(
    (row) => row.section === 'run' || row.section === 'go',
  )
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
      // As the tab does: see `useRememberBoards`.
      deps.navigate(path === '/boards' ? useStore.getState().ui.lastBoards : path)
      useStore.getState().ui.closePalette()
    },
  }
}

/** Whether `q` occurs in `text` where a word starts: `--top` has it, `stop` does not. */
function atWordStart(text: string, q: string): boolean {
  for (let at = text.indexOf(q); at !== -1; at = text.indexOf(q, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(at - 1))) return true
  }
  return false
}

/**
 * A case-insensitive substring over what a row shows and what it hides (the
 * CLI flag, since the live command line is on the same screen).
 *
 * Rows whose name *starts with* the query come first, then rows that carry it
 * at the start of any word, then the rest; otherwise section order decides,
 * and "New seed" (`run`) would beat the knob named "seed". The partition is
 * stable within each group.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...commands]
  const ranked: Command[][] = [[], [], []]
  for (const command of commands) {
    const text = `${command.name} ${command.note} ${command.hay}`.toLowerCase()
    if (!text.includes(q)) continue
    const rank = command.name.toLowerCase().startsWith(q) ? 0 : atWordStart(text, q) ? 1 : 2
    ranked[rank]?.push(command)
  }
  return ranked.flat()
}
