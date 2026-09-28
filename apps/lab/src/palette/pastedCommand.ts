import {
  type ArgProblem,
  COMMAND_PREFIX,
  drawOf,
  ENV_WORD_SOURCE,
  parseArgs,
  type ParsedArgs,
  splitCommand,
} from '@arrowz/engine/command'
import type { Dict } from '@arrowz/engine/i18n'
import { useStore } from '../state/store'
import { viewFieldsOf } from '../state/view.slice'
import type { Command, CommandDeps } from './commands'

// The same prompt-and-environment shape splitCommand drops, so a line copied
// straight from a terminal ($ ..., NAME=value ... deno task carve ...) is
// still recognised as a command rather than searched as a knob.
const CARVE_LINE = new RegExp(
  `^(?:\\$\\s+)?(?:${ENV_WORD_SOURCE}\\s+)*${COMMAND_PREFIX.split(' ').join('\\s+')}(\\s|$)`,
)

/**
 * A query that is a carve line: the prefix (a prompt and environment words
 * allowed ahead of it), or a flag with a value or a second token. A lone flag
 * (`--seed`) is still a search for its knob.
 */
export function isCommandQuery(query: string): boolean {
  const q = query.trimStart()
  return CARVE_LINE.test(q) || /^--[^\s=]*[\s=]/.test(q)
}

export interface ReadCommand {
  readonly parsed: ParsedArgs
  readonly problems: readonly ArgProblem[]
}

/** The line split as a shell would, then parsed; an unclosed quote comes first. */
export function readCommand(query: string): ReadCommand {
  const split = splitCommand(query)
  const parsed = parseArgs(split.argv)
  return { parsed, problems: [...split.problems, ...parsed.problems] }
}

/** A problem as the lab says it; the token as typed is an argument, never part of the words. */
export function problemWords(dict: Dict, p: ArgProblem): string {
  const or = (list: readonly string[]) => list.join(` ${dict.t('cmdOr')} `)
  switch (p.kind) {
    case 'noValue':
      return dict.t('argNoValue', p.arg)
    case 'unexpectedArgument':
      return dict.t('argUnexpected', p.arg)
    case 'retired':
      if (p.why === 'oneMode') return dict.t('argRetiredOneMode', p.arg)
      if (p.why === 'boardAlways') return dict.t('argRetiredBoard', p.arg)
      if (p.why === 'spacingFixed') return dict.t('argRetiredSpacing', p.arg, or(p.use))
      return dict.t('argRetiredUse', p.arg, or(p.use))
    case 'notStart':
      return dict.t('argNotStart', p.arg, p.words.join(', '), p.min, p.max)
    case 'outside':
      return dict.t('argOutside', p.arg, p.min, p.max)
    case 'notNumber':
      return p.words.length ? dict.t('argNotNumberOrWords', p.arg, or(p.words)) : dict.t('argNotNumber', p.arg)
    case 'notWhole':
      return dict.t('argNotWhole', p.arg)
    case 'notTheme':
      return dict.t('argNotTheme', p.arg, p.themes.join(', '))
    case 'notColour':
      return dict.t('argNotColour', p.arg)
    case 'notColourList':
      return dict.t('argNotColourList', p.arg)
    case 'paletteTooLong':
      return dict.t('argPaletteTooLong', p.arg, p.cap)
    case 'unknownFlag':
      return dict.t('argUnknown', p.arg)
    case 'missing':
      return dict.t('argMissing', p.arg)
    case 'unclosedQuote':
      return dict.t('argUnclosedQuote', p.arg)
  }
}

export interface PastedRow {
  readonly command: Command
  readonly problems: readonly string[]
}

/** The palette's one row in command mode, and the problems listed under it. */
export function pastedRow(deps: CommandDeps, query: string): PastedRow {
  const { dict } = deps
  const { parsed, problems } = readCommand(query)
  const { W, H, seed } = parsed.params
  const board = dict.t('boardAnnotation', W, H, seed)
  const ok = problems.length === 0
  return {
    command: {
      id: 'load-command',
      section: 'run',
      name: dict.t('cmdLoad'),
      note: parsed.rest.length > 0 ? dict.t('cmdIgnored', parsed.rest.join(' ')) : dict.t('cmdLoadNote'),
      value: ok
        ? parsed.choice.random
          ? `${board} · ${dict.t('cmdDrawn')}`
          : board
        : dict.t('cmdProblems', problems.length),
      hay: query,
      disabled: !ok,
      run: () => loadCommand(deps, parsed),
    },
    problems: problems.map((p) => problemWords(dict, p)),
  }
}

/**
 * Sets the lab to what the line carves and starts one run. Machine-path
 * setters only, and `start()`, not `generate()`: in the simple view with
 * randomise on, `generate` would draw over the pins just set.
 */
export function loadCommand(deps: CommandDeps, parsed: ParsedArgs): void {
  const { params, view, recipe, ui } = useStore.getState()
  ui.raiseClamped(params.setMany(drawOf(parsed, Math.random).params))
  view.apply(viewFieldsOf(parsed.view))
  const { seed: _seed, ...choice } = parsed.choice
  recipe.apply(choice)
  // The simple view shows no pins, and its randomise would drop them.
  if (parsed.pins.length > 0 && ui.mode === 'simple') ui.setMode('advanced')
  deps.navigate('/')
  ui.closePalette()
  deps.control.start()
}
