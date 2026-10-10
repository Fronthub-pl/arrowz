import { ELEMENT_EVENTS, ELEMENT_MEMBERS, ELEMENT_PROPS } from '@fronthub/arrowz-engine/docs'
import { describe, expect, test } from 'vitest'
import type { Code, Nodes } from 'mdast'
import {
  cellTokens,
  type CodeToken,
  highlight,
  highlightHtml,
  highlightJson,
  highlightSh,
  type TokenClass,
} from './codeTokens'
import { docsPage } from './content'
import { DOCS_PAGES } from './pages'

/** Every fenced block of a page, the ones inside tabs included. */
function codeBlocks(node: Nodes, out: Code[] = []): Code[] {
  if (node.type === 'code') out.push(node)
  if ('children' in node) for (const child of node.children) codeBlocks(child, out)
  return out
}

/** The element page's example, as its Markdown writes it: its first `html` block. */
const ELEMENT_EXAMPLE = codeBlocks(docsPage('en', 'element').root).find((block) => block.lang === 'html')?.value ?? ''

const joined = (tokens: readonly CodeToken[]) => tokens.map((t) => t.text).join('')
/** Every token of one colour, as text: what a reader sees in that colour. */
const inColour = (tokens: readonly CodeToken[], cls: TokenClass) =>
  tokens.filter((t) => t.cls === cls).map((t) => t.text)

describe('the example', () => {
  const tokens = highlightHtml(ELEMENT_EXAMPLE)

  // The cases below would pass on an empty string.
  test('is the element page’s example', () => {
    expect(ELEMENT_EXAMPLE).toContain('<arrowz-board id="board"')
  })

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
      expect.arrayContaining([
        "'@fronthub/arrowz-board'",
        "'@fronthub/arrowz-engine'",
        "'board'",
        "'piece-click'",
        "'piece'",
      ]),
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
    'CARVE_TIMEOUT_S=60 arrowz carve --width=1000 --theme=gruvbox-dark --svg   # stops after a minute\n./carve -h'
  const tokens = highlightSh(SH)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(SH)
  })

  test('colours the variable, the task, the flags, their values and the comment', () => {
    expect(inColour(tokens, 'type')).toEqual(['CARVE_TIMEOUT_S'])
    expect(inColour(tokens, 'fn')).toEqual(['arrowz carve'])
    expect(inColour(tokens, 'attr')).toEqual(['--width', '--theme', '--svg', '-h'])
    expect(inColour(tokens, 'num')).toEqual(['60', '1000'])
    expect(inColour(tokens, 'str')).toEqual(['gruvbox-dark'])
    expect(inColour(tokens, 'com')).toEqual(['# stops after a minute'])
  })

  test('colours a repository task as it colours the program', () => {
    expect(inColour(highlightSh('deno task report --seeds=3\ndeno task carve --width=9'), 'fn')).toEqual([
      'deno task report',
      'deno task carve',
    ])
    // The program without a command is not a known call, and neither is a longer word.
    expect(inColour(highlightSh('arrowz\narrowzz carve'), 'fn')).toEqual([])
  })

  // A colour value starts with `#`, and it is a value, not a comment.
  test('a # inside a value is not a comment', () => {
    expect(inColour(highlightSh('arrowz carve --paper=#f6f6fa'), 'com')).toEqual([])
  })
})

describe('a JSON block', () => {
  const JSON_TEXT = '{\n  "W": 30, "ok": true,\n  "pinned": [],\n  "command": "arrowz carve --width=30"\n}'
  const tokens = highlightJson(JSON_TEXT)

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(JSON_TEXT)
  })

  test('a key is a property, a value a string or a constant', () => {
    expect(inColour(tokens, 'prop')).toEqual(['"W"', '"ok"', '"pinned"', '"command"'])
    expect(inColour(tokens, 'num')).toEqual(['30', 'true'])
    expect(inColour(tokens, 'str')).toEqual(['"arrowz carve --width=30"'])
  })
})

// The promise Copy rests on, for every block a reader can copy.
describe.each(DOCS_PAGES)('every block of the %s page', (page) => {
  test.each(['en', 'pl'] as const)('in %s reads back exactly as written', (lang) => {
    const blocks = codeBlocks(docsPage(lang, page).root)
    // The Arrowz page is prose only; a block added to it must retire this exception.
    expect(blocks.length > 0).toBe(page !== 'arrowz')
    for (const block of blocks) {
      const tokens = highlight(block.lang, block.value)
      if (tokens !== null) expect(joined(tokens), `${block.lang ?? ''} ${block.meta ?? ''}`).toBe(block.value)
    }
  })
})

describe('a TypeScript block', () => {
  const TS = [
    "import type { BoardData } from '@fronthub/arrowz-engine'",
    "declare module 'react' {",
    '  interface X { board?: BoardData | null }',
    '}',
    'export const ok = true',
  ].join('\n')
  const tokens = highlight('ts', TS) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(TS)
  })

  test('colours the words TypeScript adds, its types and its constants', () => {
    expect(inColour(tokens, 'kw')).toEqual([
      'import',
      'type',
      'from',
      'declare',
      'module',
      'interface',
      'export',
      'const',
    ])
    expect(inColour(tokens, 'type')).toEqual(['BoardData', 'X', 'BoardData'])
    expect(inColour(tokens, 'num')).toEqual(['null', 'true'])
    expect(inColour(tokens, 'str')).toEqual(["'@fronthub/arrowz-engine'", "'react'"])
  })
})

// `type` is TypeScript's word, but after `.` or before `:` it can only be a name.
test('a keyword used as a property name is a property', () => {
  const tokens = highlight('ts', "if (e.type === 'x') send({ type: 'y', default: ok ? null : 1 })") ?? []
  expect(inColour(tokens, 'kw')).toEqual(['if'])
  expect(inColour(tokens, 'prop')).toEqual(['type', 'type', 'default'])
  // A constant before the `:` of a conditional stays a constant.
  expect(inColour(tokens, 'num')).toEqual(['null', '1'])
})

describe('a TSX block', () => {
  const TSX = [
    'export function Board() {',
    '  if (!ready) return null',
    "  return <arrowz-board board={board} style={{ height: '80vh' }} onpiece-click={(e) => log(e.detail.pieceId)} />",
    '}',
  ].join('\n')
  const tokens = highlight('tsx', TSX) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(TSX)
  })

  test('colours the element as markup and its braces as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['arrowz-board'])
    expect(inColour(tokens, 'attr')).toEqual(['board', 'style', 'onpiece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['export', 'function', 'if', 'return', 'return'])
    expect(inColour(tokens, 'fn')).toEqual(['Board', 'log'])
    expect(inColour(tokens, 'prop')).toEqual(['height', 'detail', 'pieceId'])
    expect(inColour(tokens, 'str')).toEqual(["'80vh'"])
  })

  // A self-closing element ends at its `/>`: the script after it is script again.
  test('a self-closing element ends at its slash', () => {
    const tokens = highlight('tsx', 'const a = <b />\nconst c = 1') ?? []
    expect(inColour(tokens, 'kw')).toEqual(['const', 'const'])
    expect(inColour(tokens, 'num')).toEqual(['1'])
  })

  // A `<` after a name is a type argument, not an element.
  test('a type argument is not an element', () => {
    const generic = highlight('tsx', 'const [a, b] = useState<string | null>(null)') ?? []
    expect(inColour(generic, 'tag')).toEqual([])
    expect(joined(generic)).toBe('const [a, b] = useState<string | null>(null)')
  })
})

describe('a Vue block', () => {
  const VUE = [
    '<script setup lang="ts">',
    "import { ref } from 'vue'",
    'const ready = ref(false)',
    '</script>',
    '',
    '<template>',
    '  <arrowz-board v-if="ready" :board="board" interactive @piece-click="onPiece" />',
    '</template>',
  ].join('\n')
  const tokens = highlight('vue', VUE) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(VUE)
  })

  test('colours the script, the markup, and the bound values as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['script', 'script', 'template', 'arrowz-board', 'template'])
    expect(inColour(tokens, 'attr')).toEqual(['setup', 'lang', 'v-if', ':board', 'interactive', '@piece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['import', 'from', 'const'])
    expect(inColour(tokens, 'fn')).toEqual(['ref'])
    expect(inColour(tokens, 'num')).toEqual(['false'])
    expect(inColour(tokens, 'str')).toEqual(['"ts"', "'vue'"])
  })
})

describe('a Svelte block', () => {
  const SVELTE = [
    '<script lang="ts">',
    "  import { onMount } from 'svelte'",
    '  let { url }: { url: string } = $props()',
    '</script>',
    '',
    '{#if problem}',
    '  <p role="alert">{problem}</p>',
    '{:else}',
    '  <arrowz-board {board} onpiece-click={onPiece}></arrowz-board>',
    '{/if}',
  ].join('\n')
  const tokens = highlight('svelte', SVELTE) ?? []

  test('reads back exactly as written', () => {
    expect(joined(tokens)).toBe(SVELTE)
  })

  test('colours the script, the markup and every brace as script', () => {
    expect(inColour(tokens, 'tag')).toEqual(['script', 'script', 'p', 'p', 'arrowz-board', 'arrowz-board'])
    expect(inColour(tokens, 'attr')).toEqual(['lang', 'role', 'onpiece-click'])
    expect(inColour(tokens, 'kw')).toEqual(['import', 'from', 'let', 'if', 'else', 'if'])
    expect(inColour(tokens, 'fn')).toEqual(['$props'])
    expect(inColour(tokens, 'str')).toEqual(['"ts"', "'svelte'", '"alert"'])
  })
})

// A module script uses TypeScript's word list too: `if` and `catch` are words, not calls.
test("an HTML script's try, catch, if, instanceof and throw are keywords", () => {
  const script =
    highlight(
      'html',
      '<script type="module">\ntry { go() } catch (e) { if (!(e instanceof Err)) throw e }\n</script>',
    ) ?? []
  expect(inColour(script, 'kw')).toEqual(['try', 'catch', 'if', 'instanceof', 'throw'])
})

test('a language the page shows plain has no colours', () => {
  expect(highlight('text', 'x')).toBeNull()
  expect(highlight(undefined, 'x')).toBeNull()
})
