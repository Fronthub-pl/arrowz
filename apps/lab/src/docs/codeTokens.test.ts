import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { describe, expect, test } from 'vitest'
import { cellTokens, type CodeToken, highlightHtml, type TokenClass } from './codeTokens'
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

  // The reconstruction coloured `W` and `H` as types for being capitals; an
  // object key is a property whatever its case.
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
