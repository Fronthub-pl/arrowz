// Guards the comment rule in CLAUDE.md ("Comments say why, once, in the
// fewest lines") over the lab, the board element and the engine's lab files:
// no history markers in comment text, and no comment block over 12 lines
// outside the file header. Only comment text is scanned, so test names and
// dictionary strings may name a round or a ruling freely.
import { dirname, fromFileUrl, join, relative } from '@std/path'
import { assert, assertEquals } from '@std/assert'

type Line = { comment: string; code: string; inComment: boolean }
export type CommentLine = { line: number; text: string; alone: boolean }

// Characters after which a `/` starts a regex literal rather than a division.
// `<` and `>` are left out on purpose: in TSX `</div>` is a closing tag, and
// reading it as a regex would swallow a `{/* */}` later on the same line.
const REGEX_AFTER = new Set('(,=:[!&|?{};+-*%~^'.split(''))
const REGEX_KEYWORDS = /\b(return|typeof|case|in|of|delete|void|throw|yield|await)$/

/** Splits a TS/TSX (or, with `css`, a CSS) source into per-line comment text. */
export function commentLines(source: string, css = false): CommentLine[] {
  const lines: Line[] = [{ comment: '', code: '', inComment: false }]
  const cur = (): Line => lines[lines.length - 1] ?? { comment: '', code: '', inComment: false }
  const newline = (inComment: boolean) => lines.push({ comment: '', code: '', inComment })
  // Brace depth of each open `${` inside template literals; the top entry is the innermost.
  const templates: number[] = []
  let codeSoFar = ''
  let i = 0
  const n = source.length

  const skipString = (quote: string) => {
    cur().code += quote
    i++
    while (i < n) {
      const c = source[i]
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === '\n') return // an unterminated quote ends with its line (JSX text like "don't")
      i++
      if (c === quote) return
    }
  }
  // Returns true when it closed the template, false when it stopped at `${`.
  const skipTemplate = (): boolean => {
    while (i < n) {
      const c = source[i]
      if (c === '\\') {
        i += 2
        continue
      }
      if (c === '\n') {
        newline(false)
        i++
        continue
      }
      if (c === '`') {
        i++
        return true
      }
      if (c === '$' && source[i + 1] === '{') {
        i += 2
        templates.push(0)
        return false
      }
      cur().code += 'x'
      i++
    }
    return true
  }

  while (i < n) {
    const c = source[i] ?? ''
    const next = source[i + 1]
    if (c === '\n') {
      newline(false)
      i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      cur().inComment = true
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') newline(true)
        else cur().comment += source[i]
        i++
      }
      i += 2
      cur().comment += ' '
      continue
    }
    if (!css && c === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? n : end
      cur().comment += source.slice(i + 2, stop)
      cur().inComment = true
      i = stop
      continue
    }
    if (c === '"' || c === "'") {
      skipString(c)
      codeSoFar += 'x'
      continue
    }
    if (!css && c === '`') {
      i++
      cur().code += '`'
      skipTemplate()
      codeSoFar += 'x'
      continue
    }
    if (!css && c === '{' && templates.length > 0) {
      templates[templates.length - 1] = (templates[templates.length - 1] ?? 0) + 1
    }
    if (!css && c === '}' && templates.length > 0) {
      const depth = templates[templates.length - 1] ?? 0
      if (depth === 0) {
        templates.pop()
        i++
        skipTemplate()
        codeSoFar += 'x'
        continue
      }
      templates[templates.length - 1] = depth - 1
    }
    if (!css && c === '/') {
      const prev = codeSoFar.trimEnd()
      const last = prev.slice(-1)
      if (prev === '' || REGEX_AFTER.has(last) || REGEX_KEYWORDS.test(prev)) {
        // A regex literal: runs to the unescaped `/` outside a class, never past the line.
        let j = i + 1
        let inClass = false
        while (j < n && source[j] !== '\n') {
          const r = source[j]
          if (r === '\\') j++
          else if (r === '[') inClass = true
          else if (r === ']') inClass = false
          else if (r === '/' && !inClass) break
          j++
        }
        if (source[j] === '/') {
          cur().code += 'x'
          codeSoFar += 'x'
          i = j + 1
          continue
        }
      }
    }
    cur().code += c
    codeSoFar += c
    if (codeSoFar.length > 64) codeSoFar = codeSoFar.slice(-32)
    i++
  }

  const out: CommentLine[] = []
  lines.forEach((l, index) => {
    if (!l.inComment) return
    out.push({ line: index + 1, text: l.comment, alone: /^[\s{}]*$/.test(l.code) })
  })
  return out
}

export const MARKERS = [
  /\bPR ?#?\d/,
  /\b[Rr]ound \d/,
  /\bRuling [0-9A-Z]/,
  /harness fact|\(fact \d/,
  /[Rr]eview round/,
  /\b[\w-]+\.(ts|tsx|css|mjs):\d+/,
]
export const MAX_BLOCK = 12

/** Offences of one file, each as `line pattern`, in line order. */
export function offences(source: string, css: boolean): { line: number; what: string }[] {
  const found: { line: number; what: string }[] = []
  const comments = commentLines(source, css)
  for (const c of comments) {
    for (const re of MARKERS) if (re.test(c.text)) found.push({ line: c.line, what: `${re} ${c.text.trim()}` })
  }
  // A block is a run of consecutive comment-only lines; the first block of the file is its header.
  let blockStart = -1
  let blockEnd = -1
  let firstBlock = true
  const close = () => {
    if (blockStart === -1) return
    const size = blockEnd - blockStart + 1
    if (!firstBlock && size > MAX_BLOCK) {
      found.push({ line: blockStart, what: `block of ${size} lines (max ${MAX_BLOCK})` })
    }
    firstBlock = false
    blockStart = -1
  }
  for (const c of comments) {
    if (!c.alone) continue
    if (blockStart !== -1 && c.line === blockEnd + 1) {
      blockEnd = c.line
      continue
    }
    close()
    blockStart = c.line
    blockEnd = c.line
  }
  close()
  return found.sort((a, b) => a.line - b.line)
}

const here = dirname(fromFileUrl(import.meta.url))
const root = join(here, '..', '..')

function walk(dir: string, exts: string[], out: string[]) {
  for (const e of Deno.readDirSync(dir)) {
    const path = join(dir, e.name)
    if (e.isDirectory && e.name !== 'node_modules') walk(path, exts, out)
    else if (e.isFile && exts.some((x) => e.name.endsWith(x))) out.push(path)
  }
}

function scopedFiles(): string[] {
  const files: string[] = []
  walk(join(root, 'apps', 'lab', 'src'), ['.ts', '.tsx', '.css'], files)
  walk(join(root, 'packages', 'board-element', 'src'), ['.ts'], files)
  for (const e of Deno.readDirSync(here)) {
    if (e.isFile && /^lab-.*\.ts$/.test(e.name)) files.push(join(here, e.name))
  }
  return files.sort()
}

function report(kind: 'marker' | 'block'): string[] {
  const lines: string[] = []
  for (const file of scopedFiles()) {
    const found = offences(Deno.readTextFileSync(file), file.endsWith('.css'))
    for (const o of found) {
      if (o.what.startsWith('block of') !== (kind === 'block')) continue
      lines.push(`${relative(root, file)}:${o.line} ${o.what}`)
    }
  }
  return lines
}

const guardOn = Deno.permissions.querySync({ name: 'env', variable: 'COMMENT_GUARD' }).state === 'granted' &&
  Deno.env.get('COMMENT_GUARD') === '1'

Deno.test('the comment guard walks the lab, the board element and the engine lab files', () => {
  const files = scopedFiles()
  assert(files.length > 150, `only ${files.length} files found: the walk is wrong`)
  assert(files.some((f) => f.endsWith('.css')), 'no stylesheet found: the walk is wrong')
  assert(files.some((f) => f.endsWith(join('engine', 'lab-i18n.ts'))), 'lab-i18n.ts not found: the walk is wrong')
})

Deno.test({
  name: 'comments carry no history markers',
  ignore: !guardOn,
  fn: () => {
    const found = report('marker')
    assert(found.length === 0, `${found.length} comment markers:\n${found.join('\n')}`)
  },
})

Deno.test({
  name: `comment blocks stay within ${MAX_BLOCK} lines outside the file header`,
  ignore: !guardOn,
  fn: () => {
    const found = report('block')
    assert(found.length === 0, `${found.length} long comment blocks:\n${found.join('\n')}`)
  },
})

Deno.test('extractor: a // inside a string or a URL is not a comment', () => {
  assertEquals(commentLines('const a = \'// PR 5\'\nconst u = "https://x.dev/PR 5"'), [])
  assertEquals(offences("it('Ruling 6 and round 3', () => {})", false), [])
})

Deno.test('extractor: a trailing comment counts, and only its comment part', () => {
  assertEquals(commentLines("const a = 'round 1' // PR 5 fixed this"), [
    { line: 1, text: ' PR 5 fixed this', alone: false },
  ])
  assertEquals(offences("const a = 'round 1' // PR 5", false).length, 1)
})

Deno.test('extractor: template literals, including nested ones, are code', () => {
  assertEquals(commentLines('const t = `a ${f(`// PR 5`)} // round 2 ${x}`\n'), [])
  assertEquals(commentLines('const t = `${a}` // PR 5\n').map((c) => c.line), [1])
})

Deno.test('extractor: regex literals with quotes or slashes are code', () => {
  assertEquals(commentLines("const r = /'/\nconst s = /https:\\/\\//g // round 4"), [
    { line: 2, text: ' round 4', alone: false },
  ])
  assertEquals(commentLines('const half = a / 2 // Ruling A').map((c) => c.text), [' Ruling A'])
})

Deno.test('extractor: JSX {/* */} and CSS /* */ are comments, CSS // is not', () => {
  assertEquals(offences('<div>\n  {/* PR 5 */}\n</div>', false).map((o) => o.line), [2])
  assertEquals(offences('</div> {/* round 2 */}', false).length, 1)
  assertEquals(offences('a { b: url(https://x/PR 5); }\n/* see shell.css:12 */', true).map((o) => o.line), [2])
})

Deno.test('extractor: a block over 12 lines fails unless it is the file header', () => {
  const block = (k: number) => Array.from({ length: k }, () => '// why').join('\n')
  assertEquals(offences(`${block(20)}\ncode()\n${block(12)}\ncode()`, false), [])
  assertEquals(offences(`${block(2)}\ncode()\n${block(13)}\ncode()`, false).map((o) => o.line), [4])
  // A blank line ends a block, so two runs of 7 are two blocks.
  assertEquals(offences(`// h\ncode()\n${block(7)}\n\n${block(7)}`, false), [])
  const star = ['/**', ...Array.from({ length: 12 }, () => ' * why'), ' */'].join('\n')
  assertEquals(offences(`// h\ncode()\n${star}`, false).map((o) => o.line), [3])
})
