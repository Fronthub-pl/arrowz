// Comment text of TS/TSX and CSS sources, line by line: the extractor behind the
// comment guard (`comments.test.ts`) and the Jev comment guard.
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

/** A run of consecutive comment-only lines, 1-based and inclusive. */
export type CommentBlock = { start: number; end: number; text: string }

/** Comment-only lines grouped into blocks, in line order; trailing comments belong to none. */
export function commentBlocks(source: string, css = false): CommentBlock[] {
  const blocks: CommentBlock[] = []
  let cur: CommentBlock | null = null
  for (const c of commentLines(source, css)) {
    if (!c.alone) continue
    if (cur !== null && c.line === cur.end + 1) {
      cur.end = c.line
      cur.text += `\n${c.text}`
      continue
    }
    if (cur !== null) blocks.push(cur)
    cur = { start: c.line, end: c.line, text: c.text }
  }
  if (cur !== null) blocks.push(cur)
  return blocks
}
