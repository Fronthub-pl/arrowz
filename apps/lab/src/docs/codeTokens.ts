/**
 * Syntax colours for the documentation: the element page's one example and the
 * machine columns of its three tables, in GitHub Dark's colours (`--code-*`).
 *
 * Tokens, not markup: each is a run of the source text with the class of its
 * colour, or none for plain text. Joining the texts gives back the input
 * exactly, so Copy and a selection read the code as written;
 * `codeTokens.test.ts` holds that for every input the page shows.
 *
 * No library: the example is one fixed snippet and the table cells are short
 * type expressions, so two small scanners cover them. They follow the design
 * mock's `highlight()` and `tsTokens()`, with one correction noted where it is made.
 */

/** A colour the stylesheet knows: `span.tk-<class>`. */
export type TokenClass = 'tag' | 'attr' | 'str' | 'kw' | 'fn' | 'type' | 'prop' | 'num' | 'param' | 'pun' | 'com'

export interface CodeToken {
  readonly cls: TokenClass | null
  readonly text: string
}

/**
 * What a table column holds, which only the table knows: the same word is a
 * property in one column and a type in the next. `sig` is a method's
 * signature, `expr` any other type expression (a default, an event's detail).
 */
export type CellRole = 'prop' | 'method' | 'attr' | 'event' | 'type' | 'sig' | 'expr'

/** Appends a token, merging runs of plain text so the DOM gets one node per run. */
function push(out: CodeToken[], cls: TokenClass | null, text: string): void {
  if (text === '') return
  const last = out[out.length - 1]
  if (cls === null && last !== undefined && last.cls === null)
    out[out.length - 1] = { cls: null, text: last.text + text }
  else out.push({ cls, text })
}

const JS_KEYWORDS = new Set(['import', 'from', 'const', 'let', 'await', 'async', 'return', 'new', 'export', 'function'])

// Sticky, so each match must start where the last one ended. The groups, in
// order: a line comment, a string, a number, a name followed by `(`, any other
// name, punctuation. Whitespace matches none and is taken one character at a
// time as plain text.
const JS_TOKEN =
  /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|(=>|\.\.\.|[{}()[\].,;:=])/y
const TAG_OPEN = /^<(\/?)([a-zA-Z][\w-]*)/
const TAG_PART = /^(\s+)|^([a-zA-Z_:][\w:.-]*)|^(=)|^("[^"]*"|'[^']*')/

/** The next character after `from` that is not whitespace, or '' at the end. */
function nextVisible(code: string, from: number): string {
  return code.slice(from).trimStart().charAt(0)
}

/**
 * An HTML snippet with module scripts in it: markup outside `<script>`, a
 * JavaScript scanner inside. Enough for the page's one example, not a parser —
 * a `>` inside an attribute value would end the tag early, and the example has
 * none.
 */
export function highlightHtml(code: string): CodeToken[] {
  const out: CodeToken[] = []
  let i = 0
  let script = false
  while (i < code.length) {
    if (script) {
      if (code.startsWith('</script', i)) {
        script = false
        continue
      }
      JS_TOKEN.lastIndex = i
      const m = JS_TOKEN.exec(code)
      if (m === null) {
        push(out, null, code.charAt(i))
        i++
        continue
      }
      const [all, comment, str, num, fn, id, pun] = m
      if (comment !== undefined) push(out, 'com', all)
      else if (str !== undefined) push(out, 'str', all)
      else if (num !== undefined) push(out, 'num', all)
      else if (fn !== undefined) push(out, JS_KEYWORDS.has(fn) ? 'kw' : 'fn', all)
      else if (id !== undefined) {
        // The one correction to the mock: a name before `:` is an object key,
        // so `W: 50` colours `W` as a property, not as a type for being a capital.
        const cls = JS_KEYWORDS.has(id)
          ? 'kw'
          : code.charAt(i - 1) === '.' || nextVisible(code, i + all.length) === ':'
            ? 'prop'
            : /^[A-Z]/.test(id)
              ? 'type'
              : null
        push(out, cls, all)
      } else if (pun !== undefined) push(out, 'pun', pun)
      i += all.length
      continue
    }
    const tag = TAG_OPEN.exec(code.slice(i))
    if (tag === null) {
      const next = code.indexOf('<', i + 1)
      const end = next < 0 ? code.length : next
      push(out, null, code.slice(i, end))
      i = end
      continue
    }
    const [open, slash = '', name = ''] = tag
    push(out, 'pun', `<${slash}`)
    push(out, 'tag', name)
    i += open.length
    while (i < code.length && code.charAt(i) !== '>') {
      const part = TAG_PART.exec(code.slice(i))
      if (part === null) {
        push(out, null, code.charAt(i))
        i++
        continue
      }
      const [text, space, attr, eq] = part
      push(out, space !== undefined ? null : attr !== undefined ? 'attr' : eq !== undefined ? 'pun' : 'str', text)
      i += text.length
    }
    if (i < code.length) {
      push(out, 'pun', '>')
      i++
    }
    if (slash === '' && name === 'script') script = true
  }
  return out
}

const TS_BUILTIN = new Set(['boolean', 'number', 'string', 'void', 'object', 'unknown', 'any', 'never'])
const TS_CONSTANT = new Set(['null', 'true', 'false', 'undefined'])
const TS_TOKEN = /('(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d'])/g

/** The dash a table shows for "no attribute": punctuation, not a value. */
const NONE = '—'

/**
 * One machine cell of a reference table. A name column is one token in its
 * role's colour; a type column is scanned: constants and numbers, strings,
 * built-in and capitalised types, punctuation — and inside a signature the
 * method's own name and its parameters, inside `{ }` the detail's fields.
 */
export function cellTokens(text: string, role: CellRole): CodeToken[] {
  if (text === NONE) return [{ cls: 'pun', text }]
  if (role === 'prop') return [{ cls: 'prop', text }]
  if (role === 'method') return [{ cls: 'fn', text }]
  if (role === 'attr') return [{ cls: 'attr', text }]
  // An event name is a string where it is used: `addEventListener('…')`.
  if (role === 'event') return [{ cls: 'str', text }]
  const out: CodeToken[] = []
  let depth = 0
  let first = true
  for (const m of text.matchAll(TS_TOKEN)) {
    const [all, str, num, id, space, pun] = m
    if (str !== undefined) push(out, 'str', all)
    else if (num !== undefined) push(out, 'num', all)
    else if (space !== undefined) push(out, null, all)
    else if (pun !== undefined) {
      if (pun === '{') depth++
      if (pun === '}') depth--
      push(out, 'pun', all)
    } else if (id !== undefined) {
      const next = nextVisible(text, (m.index ?? 0) + all.length)
      let cls: TokenClass | null = TS_CONSTANT.has(id) ? 'num' : TS_BUILTIN.has(id) || /^[A-Z]/.test(id) ? 'type' : null
      if (cls === null && role === 'sig' && first && next === '(') cls = 'fn'
      else if (cls === null && role === 'sig' && next === ':') cls = 'param'
      else if (cls === null && depth > 0) cls = 'prop'
      first = false
      push(out, cls, all)
    }
  }
  return out
}
