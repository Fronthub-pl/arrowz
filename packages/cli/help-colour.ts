// The help in colour on a terminal, so a pipe or a file gets the plain text
// `helpText` returns. Each escape wraps a token after `padEnd` has run, so the
// columns stay where the plain text has them.
// The help decides from FORCE_COLOR, NO_COLOR and the terminal itself, not from
// the runtime's own check: that one reads many more variables (TERM, CI, ...),
// which a Deno grant would have to list. FORCE_COLOR and NO_COLOR need no grant.
import process from 'node:process'
import { styleText } from 'node:util'

/** The two styles the help uses. */
export type Style = (format: 'bold' | 'cyan', text: string) => string

/** A heading: a line at column 0 that ends with a colon. */
const HEADING = /^\S.*:$/
/** A flag row: two spaces, then a first column that starts with a dash and ends at the first double space. */
const FLAG_ROW = /^( {2})(-.*?)(?= {2})/

/** Whether to colour: FORCE_COLOR forces it for '', 1, 2, 3 and true and forbids it for any other value, as in Node, NO_COLOR forbids it, else a terminal gets it. */
export function colourWanted(
  env: { readonly FORCE_COLOR?: string | undefined; readonly NO_COLOR?: string | undefined },
  tty: boolean,
): boolean {
  if (env.FORCE_COLOR !== undefined) return ['', '1', '2', '3', 'true'].includes(env.FORCE_COLOR)
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  return tty
}

function defaultStyle(): Style {
  const on = colourWanted(
    { FORCE_COLOR: process.env.FORCE_COLOR, NO_COLOR: process.env.NO_COLOR },
    process.stdout.isTTY === true,
  )
  return on ? (format, t) => styleText(format, t, { validateStream: false }) : (_, t) => t
}

/** `text` with its headings bold and the first column of its flag rows coloured, as far as stdout takes colour. */
export function colourHelp(text: string, style: Style = defaultStyle()): string {
  return text
    .split('\n')
    .map((line) =>
      HEADING.test(line)
        ? style('bold', line)
        : line.replace(FLAG_ROW, (_, indent: string, flag: string) => indent + style('cyan', flag))
    )
    .join('\n')
}
