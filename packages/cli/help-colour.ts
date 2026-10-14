// The help in colour on a terminal. `styleText` decides whether stdout takes
// colour (a TTY, NO_COLOR, NODE_DISABLE_COLORS, FORCE_COLOR), so a pipe or a
// file gets the plain text `helpText` returns. Each escape wraps a token after
// `padEnd` has run, so the columns stay where the plain text has them.
import { styleText } from 'node:util'

/** The two styles the help uses. */
export type Style = (format: 'bold' | 'cyan', text: string) => string

/** A heading: a line at column 0 that ends with a colon. */
const HEADING = /^\S.*:$/
/** A flag row: two spaces, then a first column that starts with a dash and ends at the first double space. */
const FLAG_ROW = /^( {2})(-.*?)(?= {2})/

/** `text` with its headings bold and the first column of its flag rows coloured, as far as stdout takes colour. */
export function colourHelp(text: string, style: Style = (format, t) => styleText(format, t)): string {
  return text
    .split('\n')
    .map((line) =>
      HEADING.test(line)
        ? style('bold', line)
        : line.replace(FLAG_ROW, (_, indent: string, flag: string) => indent + style('cyan', flag))
    )
    .join('\n')
}
