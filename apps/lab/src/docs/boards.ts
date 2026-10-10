/**
 * A live board's command, read the way the CLI reads it: `splitCommand`,
 * `parseArgs`, `drawOf`, the path a command pasted into ⌘K takes. The page's
 * board is then the board its printed command makes. The content guard
 * (`problemsOf` in shape.ts) runs `readBoardCmd` over every page, so a
 * command that does not parse never ships; the renderer reads it again.
 */
import { formatViolation, type Params, validateParams, type View } from '@fronthub/arrowz-engine'
import { boardId, drawOf, parseArgs, type ParsedArgs, problemText, splitCommand } from '@fronthub/arrowz-engine/command'
import { STAT_KEYS, type StatKey } from '@fronthub/arrowz-engine/report'

/** The longest side a board on a page generates by itself; a larger one waits for its button (`manual`). */
export const DOCS_BOARD_MAX = 500

export interface DocsBoardSpec {
  /** The flags as the page writes them; the page shows them after `deno task carve`. */
  readonly cmd: string
  readonly parsed: ParsedArgs
  readonly params: Params
  readonly view: View
  /** The session cache's key: `boardId`, so commands that differ only in the picture share one board. */
  readonly key: string
}

/** Never called: a board on a page refuses `--randomized`, so `drawOf` has nothing to draw. */
const NO_DRAW = (): number => 0

export function readBoardCmd(cmd: string): { spec: DocsBoardSpec | null; problems: string[] } {
  const split = splitCommand(cmd)
  const problems = split.problems.map(problemText)
  if (!/^\s*--/.test(cmd)) problems.push(`holds the flags only, without deno task carve: ${cmd}`)
  const parsed = parseArgs(split.argv)
  problems.push(...parsed.errors)
  if (parsed.choice.random) problems.push('a board on a page is the one its command makes: no --randomized')
  if (parsed.rest.length > 0) problems.push(`no modes on a page: ${parsed.rest.join(' ')}`)
  if (problems.length > 0) return { spec: null, problems }
  const { params } = drawOf(parsed, NO_DRAW)
  const violations = validateParams(params).map(formatViolation)
  if (violations.length > 0) return { spec: null, problems: violations }
  return { spec: { cmd, parsed, params, view: parsed.view, key: boardId(params) }, problems: [] }
}

const isStatKey = (word: string): word is StatKey => STAT_KEYS.some((key) => key === word)

/** The report rows a `stats` attribute names, in its order; a word that is none is dropped (the guard names it). */
export function statKeysOf(value: string | null | undefined): StatKey[] {
  return (value ?? '').split(/\s+/).filter(isStatKey)
}

export function statsProblem(value: string): string | null {
  const words = value.split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return 'stats names at least one report row'
  const unknown = words.filter((word) => !isStatKey(word))
  return unknown.length === 0 ? null : `stats: ${unknown.join(', ')} is not a report row`
}

export function aboutProblem(value: string): string | null {
  return /^[1-9]\d*$/.test(value) ? null : `about="${value}" is not a whole number of seconds`
}

/** The seconds a `manual` board's button promises; null for a board that generates by itself. */
export function aboutOf(attributes: Record<string, string | null | undefined> | null | undefined): number | null {
  if (attributes === null || attributes === undefined || !('manual' in attributes)) return null
  const seconds = Number(attributes['about'])
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null
}
