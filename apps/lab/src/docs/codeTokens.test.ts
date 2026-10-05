import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { describe, expect, test } from 'vitest'
import { cellTokens, type CodeToken, highlightHtml, highlightJson, highlightSh, type TokenClass } from './codeTokens'
import { ELEMENT_EXAMPLE } from './elementExample'

const joined = (tokens: readonly CodeToken[]) => tokens.map((t) => t.text).join('')
/** Every token of one colour, as text: what a reader sees in that colour. */
const inColour = (tokens: readonly CodeToken[], cls: TokenClass) =>
  tokens.filter((t) => t.cls === cls).map((t) => t.text)

describe('the example', () => {
  const tokens = highlightHtml(ELEMENT_EXAMPLE)

  // The promise Copy rests on: the spans change the colour, never the text.
  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(ELEMENT_EXAMPLE)
  })

  test('colours the markup', () => {
    expect(inColour(tokens, 'tag')).toEqual(['arrowz-board', 'arrowz-board', 'script', 'script'])
    expect(inColour(tokens, 'attr')).toEqual(['id', 'interactive', 'lang', 'style', 'type'])
    expect(inColour(tokens, 'str')).toContain('"module"')
  })

  // The module script is scanned as JavaScript, not as more markup: its
  // keywords, calls and strings each get their own colour.
  test('colours the script inside it', () => {
    expect(inColour(tokens, 'kw')).toEqual(['import', 'import', 'from', 'const'])
    expect(inColour(tokens, 'fn')).toEqual(['getElementById', 'generate', 'defaultParams', 'addEventListener', 'log'])
    expect(inColour(tokens, 'str')).toEqual(
      expect.arrayContaining(["'@arrowz/board-element'", "'@arrowz/engine'", "'board'", "'piece-click'", "'piece'"]),
    )
    expect(inColour(tokens, 'num')).toEqual(['50', '50', '7'])
  })

  // An object key is a property whatever its case, not a type for being a capital.
  test('an object key is a property, and so is a member after a dot', () => {
    expect(inColour(tokens, 'prop')).toEqual(['board', 'W', 'H', 'seed', 'board', 'detail', 'pieceId'])
    expect(inColour(tokens, 'type')).toEqual([])
  })

  // A closing `</script` ends the JavaScript: the tag after it is markup again.
  test('the script ends at its closing tag', () => {
    const last = tokens.slice(-3)
    expect(last).toEqual([
      { cls: 'pun', text: '</' },
      { cls: 'tag', text: 'script' },
      { cls: 'pun', text: '>' },
    ])
  })
})

describe('a table cell', () => {
  // Every machine cell the page shows, in the role its column gives it.
  const cells: [string, Parameters<typeof cellTokens>[1]][] = [
    ...ELEMENT_PROPS.flatMap((r): [string, Parameters<typeof cellTokens>[1]][] => [
      [r.key, 'prop'],
      [r.type, 'type'],
      [r.attribute ?? '—', 'attr'],
      [r.def, 'expr'],
    ]),
    ...ELEMENT_MEMBERS.flatMap((r): [string, Parameters<typeof cellTokens>[1]][] => [
      [r.key, r.kind === 'getter' ? 'prop' : 'method'],
      [r.signature, r.kind === 'getter' ? 'type' : 'sig'],
    ]),
    ...ELEMENT_EVENTS.flatMap((r): [string, Parameters<typeof cellTokens>[1]][] => [
      [r.key, 'event'],
      [r.detail, 'expr'],
    ]),
  ]

  test.each(cells)('%s reads back exactly as written', (text, role) => {
    expect(joined(cellTokens(text, role))).toBe(text)
  })

  test('a signature colours the method, its parameters and its types', () => {
    const tokens = cellTokens('animateExit(pieceId: number, dir: number): Promise<void>', 'sig')
    expect(inColour(tokens, 'fn')).toEqual(['animateExit'])
    expect(inColour(tokens, 'param')).toEqual(['pieceId', 'dir'])
    expect(inColour(tokens, 'type')).toEqual(['number', 'number', 'Promise', 'void'])
    expect(inColour(tokens, 'pun')).toEqual(['(', ':', ',', ':', ')', ':', '<', '>'])
  })

  test('an event detail colours its fields as properties', () => {
    const tokens = cellTokens('{ pieceId, blockerId, distance }', 'expr')
    expect(inColour(tokens, 'prop')).toEqual(['pieceId', 'blockerId', 'distance'])
  })

  test('constants, numbers and strings each have their colour', () => {
    expect(cellTokens('null', 'expr')).toEqual([{ cls: 'num', text: 'null' }])
    expect(cellTokens('0.06', 'expr')).toEqual([{ cls: 'num', text: '0.06' }])
    expect(cellTokens("'#c9c9d6'", 'expr')).toEqual([{ cls: 'str', text: "'#c9c9d6'" }])
    expect(inColour(cellTokens("'drag' | 'click'", 'type'), 'str')).toEqual(["'drag'", "'click'"])
  })

  test('a missing attribute is punctuation, not a name', () => {
    expect(cellTokens('—', 'attr')).toEqual([{ cls: 'pun', text: '—' }])
  })
})

describe('a shell block', () => {
  const SH =
    'CARVE_TIMEOUT_S=60 deno task carve --width=1000 --theme=gruvbox-dark --svg   # stops after a minute\n./carve -h'
  const tokens = highlightSh(SH)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(SH)
  })

  test('colours the variable, the task, the flags, their values and the comment', () => {
    expect(inColour(tokens, 'type')).toEqual(['CARVE_TIMEOUT_S'])
    expect(inColour(tokens, 'fn')).toEqual(['deno task carve'])
    expect(inColour(tokens, 'attr')).toEqual(['--width', '--theme', '--svg', '-h'])
    expect(inColour(tokens, 'num')).toEqual(['60', '1000'])
    expect(inColour(tokens, 'str')).toEqual(['gruvbox-dark'])
    expect(inColour(tokens, 'com')).toEqual(['# stops after a minute'])
  })

  // A colour value starts with `#`, and it is a value, not a comment.
  test('a # inside a value is not a comment', () => {
    expect(inColour(highlightSh('deno task carve --paper=#f6f6fa'), 'com')).toEqual([])
  })
})

describe('a JSON block', () => {
  const JSON_TEXT = '{\n  "W": 30, "ok": true,\n  "pinned": [],\n  "command": "deno task carve --width=30"\n}'
  const tokens = highlightJson(JSON_TEXT)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(JSON_TEXT)
  })

  test('a key is a property, a value a string or a constant', () => {
    expect(inColour(tokens, 'prop')).toEqual(['"W"', '"ok"', '"pinned"', '"command"'])
    expect(inColour(tokens, 'num')).toEqual(['30', 'true'])
    expect(inColour(tokens, 'str')).toEqual(['"deno task carve --width=30"'])
  })
})
