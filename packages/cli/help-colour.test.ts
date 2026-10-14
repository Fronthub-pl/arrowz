import { assertEquals } from '@std/assert'
import { helpText } from '@fronthub/arrowz-engine/command'
import { colourHelp, type Style } from './help-colour.ts'

// A visible stand-in for the escapes, so the rules are tested whatever the test's stdout is.
const tag: Style = (format, text) => `<${format}>${text}</${format}>`
const untag = (text: string): string => text.replace(/<\/?(?:bold|cyan)>/g, '')

Deno.test('colourHelp makes headings bold and colours the first column of a flag row, nothing else', () => {
  const plain = [
    'Usage: arrowz carve --width=N --height=N',
    '',
    'Output:',
    '  (no mode)      one board file',
    '  --help, -h     this text; --help=knobs adds the table',
    '  flag             knob   step',
    '  [board]',
    '  --width=4..1000  width  1',
    '  sharesSum (--wshort, --wmid)  short and medium shares',
    'Environment: ARROWZ_BOARDS_DIR (board store),',
  ].join('\n')
  assertEquals(colourHelp(plain, tag).split('\n'), [
    'Usage: arrowz carve --width=N --height=N',
    '',
    '<bold>Output:</bold>',
    '  (no mode)      one board file',
    '  <cyan>--help, -h</cyan>     this text; --help=knobs adds the table',
    '  flag             knob   step',
    '  [board]',
    '  <cyan>--width=4..1000</cyan>  width  1',
    '  sharesSum (--wshort, --wmid)  short and medium shares',
    'Environment: ARROWZ_BOARDS_DIR (board store),',
  ])
})

Deno.test('colourHelp keeps the columns of both helps and reaches every flag row', () => {
  for (const knobs of [false, true]) {
    const plain = helpText({ knobs })
    const coloured = colourHelp(plain, tag)
    assertEquals(untag(coloured), plain)
    const rows = plain.split('\n').filter((l) => l.startsWith('  -')).length
    assertEquals(coloured.split('\n').filter((l) => l.startsWith('  <cyan>-')).length, rows)
  }
})
