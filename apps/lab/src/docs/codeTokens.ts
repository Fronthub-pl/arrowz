/**
 * Syntax colours for the documentation: its `html`, `vue`, `svelte`, `ts`,
 * `tsx`, `sh` and `json` blocks and the machine columns of its reference
 * tables, in GitHub Dark's colours (`--code-*`).
 *
 * Tokens, not markup: each is a run of the source text with the class of its
 * colour, or none for plain text. Joining the texts gives back the input
 * exactly, so Copy and a selection read the code as written;
 * `codeTokens.test.ts` holds that for every block the pages show.
 *
 * No library: the blocks are short examples, commands, a little JSON and type
 * expressions in table cells, so a script scanner, a tag scanner and three
 * small ones cover them. The script and type scanners follow the design
 * mock's `highlight()` and `tsTokens()`, with one correction noted where it
 * is made.
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
export type CellRole = 'prop' | 'method' | 'attr' | 'event' | 'slot' | 'type' | 'sig' | 'expr'

/** Appends a token, merging runs of plain text so the DOM gets one node per run. */
function push(out: CodeToken[], cls: TokenClass | null, text: string): void {
  if (text === '') return
  const last = out[out.length - 1]
  if (cls === null && last !== undefined && last.cls === null)
    out[out.length - 1] = { cls: null, text: last.text + text }
  else out.push({ cls, text })
}

const JS_KEYWORDS = new Set(['import', 'from', 'const', 'let', 'await', 'async', 'return', 'new', 'export', 'function'])

/** TypeScript's words on top of JavaScript's, for the framework examples. */
const TS_KEYWORDS = new Set([
  ...JS_KEYWORDS,
  'type',
  'interface',
  'declare',
  'namespace',
  'module',
  'as',
  'satisfies',
  'readonly',
  'if',
  'else',
  'try',
  'catch',
  'throw',
  'typeof',
  'keyof',
  'extends',
  'class',
  'default',
  'void',
  'in',
  'of',
  'instanceof',
])

// Sticky, so each match must start where the last one ended. The groups, in
// order: a line comment, a string, a number, a name followed by `(`, any other
// name, punctuation. Whitespace matches none and is taken one character at a
// time as plain text.
const JS_TOKEN =
  /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|(=>|\.\.\.|[{}()[\].,;:=])/y
const TAG_OPEN = /^<(\/?)([a-zA-Z][\w-]*)/
const TAG_PART = /^(\s+)|^([a-zA-Z_:@][\w:.@-]*)|^(=)|^("[^"]*"|'[^']*')/

/** The next character after `from` that is not whitespace, or '' at the end. */
function nextVisible(code: string, from: number): string {
  return code.slice(from).trimStart().charAt(0)
}

/** Where a script ends short of the end of the code. */
interface ScriptEnd {
  /** Text that ends it, left unread: `</script`, or the quote around an attribute's value. */
  readonly until?: string
  /** An unmatched `}` ends it, left unread: an expression inside markup. */
  readonly brace?: boolean
  /** A `<` where an expression may start opens a JSX element. */
  readonly jsx?: boolean
}

// What may stand right before a `<` that opens JSX rather than compares or
// starts a type argument: `return <p>`, `(<p>`, `=> <p>`, `? <a> : <b>`.
const JSX_AFTER = new Set(['', '(', ',', '=', '=>', '?', ':', '{', '[', '&', '|', 'return'])

/**
 * A name's colour. The one correction to the mock: a name before `:` is an
 * object key, so `W: 50` colours `W` as a property, not as a type for being a capital.
 */
function nameClass(code: string, at: number, id: string, keywords: ReadonlySet<string>): TokenClass | null {
  if (keywords.has(id)) return 'kw'
  if (TS_CONSTANT.has(id)) return 'num'
  if (code.charAt(at - 1) === '.' || nextVisible(code, at + id.length) === ':') return 'prop'
  return /^[A-Z]/.test(id) ? 'type' : null
}

/** Script from `start` until `end` says it stops; returns where it stopped. */
function scanScript(
  code: string,
  start: number,
  out: CodeToken[],
  keywords: ReadonlySet<string>,
  end: ScriptEnd,
): number {
  let i = start
  let depth = 0
  let last = ''
  while (i < code.length) {
    if (end.until !== undefined && code.startsWith(end.until, i)) return i
    const ch = code.charAt(i)
    if (end.brace === true && ch === '}' && depth === 0) return i
    const tag = end.jsx === true && JSX_AFTER.has(last) ? TAG_OPEN.exec(code.slice(i)) : null
    if (tag !== null && tag[1] === '') {
      i = scanJsx(code, i, out, keywords)
      last = ')'
      continue
    }
    JS_TOKEN.lastIndex = i
    const m = JS_TOKEN.exec(code)
    if (m === null) {
      push(out, null, ch)
      if (ch.trim() !== '') last = ch
      i++
      continue
    }
    const [all, comment, str, num, fn, id, pun] = m
    if (comment !== undefined) push(out, 'com', all)
    else if (str !== undefined) push(out, 'str', all)
    else if (num !== undefined) push(out, 'num', all)
    else if (fn !== undefined) push(out, keywords.has(fn) ? 'kw' : 'fn', all)
    else if (id !== undefined) push(out, nameClass(code, i, id, keywords), all)
    else if (pun !== undefined) {
      if (pun === '{') depth++
      if (pun === '}') depth--
      push(out, 'pun', pun)
    }
    if (comment === undefined) last = all
    i += all.length
  }
  return i
}

/** How one markup flavour reads what is not markup inside its tags. */
interface TagScripts {
  readonly keywords: ReadonlySet<string>
  /** `{…}` in a tag is script: JSX and Svelte. */
  readonly braces: boolean
  /** JSX may open inside those braces. */
  readonly jsx: boolean
  /** A quoted value that is script: Vue's `:x`, `@x` and `v-` attributes. */
  readonly quoted: (attr: string) => boolean
}

interface Tag {
  /** Just past the tag's `>`, or the end of the code. */
  readonly end: number
  readonly name: string
  readonly closing: boolean
  /** `<x … />` */
  readonly empty: boolean
}

/** A `{…}` from its `{`; returns just past its `}`, or the end of the code. */
function scanBraces(
  code: string,
  start: number,
  out: CodeToken[],
  keywords: ReadonlySet<string>,
  jsx: boolean,
): number {
  push(out, 'pun', '{')
  const stop = scanScript(code, start + 1, out, keywords, { brace: true, jsx })
  if (code.charAt(stop) !== '}') return stop
  push(out, 'pun', '}')
  return stop + 1
}

/** One tag from its `<`, which `open` (a `TAG_OPEN` match at `start`) has read. */
function scanTag(code: string, start: number, open: RegExpExecArray, out: CodeToken[], scripts: TagScripts): Tag {
  const [whole, slash = '', name = ''] = open
  push(out, 'pun', `<${slash}`)
  push(out, 'tag', name)
  let i = start + whole.length
  let attr = ''
  let empty = false
  while (i < code.length && code.charAt(i) !== '>') {
    const ch = code.charAt(i)
    if (ch === '{' && scripts.braces) {
      i = scanBraces(code, i, out, scripts.keywords, scripts.jsx)
      continue
    }
    if (ch === '/') {
      empty = code.charAt(i + 1) === '>'
      push(out, 'pun', '/')
      i++
      continue
    }
    const part = TAG_PART.exec(code.slice(i))
    if (part === null) {
      push(out, null, ch)
      i++
      continue
    }
    const [text, space, attrName, eq, value] = part
    if (value !== undefined && scripts.quoted(attr)) {
      const quote = value.charAt(0)
      push(out, 'pun', quote)
      const stop = scanScript(code, i + 1, out, scripts.keywords, { until: quote })
      if (code.charAt(stop) === quote) push(out, 'pun', quote)
      i = code.charAt(stop) === quote ? stop + 1 : stop
      continue
    }
    if (attrName !== undefined) attr = attrName
    push(out, space !== undefined ? null : attrName !== undefined ? 'attr' : eq !== undefined ? 'pun' : 'str', text)
    i += text.length
  }
  if (i < code.length) {
    push(out, 'pun', '>')
    i++
  }
  return { end: i, name, closing: slash === '/', empty }
}

/** Plain text from `start` to the next of `stops` after it; returns where it ended. */
function plainText(code: string, start: number, out: CodeToken[], stops: string): number {
  let end = code.length
  for (const stop of stops) {
    const at = code.indexOf(stop, start + 1)
    if (at >= 0 && at < end) end = at
  }
  push(out, null, code.slice(start, end))
  return end
}

/** One JSX element from its `<` past its closing tag: attributes, children and `{…}`. */
function scanJsx(code: string, start: number, out: CodeToken[], keywords: ReadonlySet<string>): number {
  const scripts: TagScripts = { keywords, braces: true, jsx: true, quoted: () => false }
  const first = TAG_OPEN.exec(code.slice(start))
  if (first === null) return plainText(code, start, out, '<{')
  const open = scanTag(code, start, first, out, scripts)
  if (open.closing || open.empty) return open.end
  let i = open.end
  while (i < code.length) {
    const tag = TAG_OPEN.exec(code.slice(i))
    if (tag !== null && tag[1] === '/') return scanTag(code, i, tag, out, scripts).end
    if (tag !== null) i = scanJsx(code, i, out, keywords)
    else if (code.charAt(i) === '{') i = scanBraces(code, i, out, keywords, true)
    else i = plainText(code, i, out, '<{')
  }
  return i
}

type Flavour = 'html' | 'vue' | 'svelte'

const SCRIPTS: Record<Flavour, TagScripts> = {
  // TypeScript's words in HTML too: a module script uses `if`, `try` and `catch` like any other.
  html: { keywords: TS_KEYWORDS, braces: false, jsx: false, quoted: () => false },
  vue: { keywords: TS_KEYWORDS, braces: false, jsx: false, quoted: (attr) => /^(?::|@|v-)/.test(attr) },
  svelte: { keywords: TS_KEYWORDS, braces: true, jsx: false, quoted: () => false },
}

/**
 * Markup with scripts in it: tags outside `<script>`, script inside, and in
 * Vue and Svelte the expressions their attributes and braces hold. Enough for
 * the pages' examples, not a parser — a `>` inside a quoted attribute value
 * would end the tag early, and the examples have none.
 */
function highlightMarkup(code: string, flavour: Flavour): CodeToken[] {
  const scripts = SCRIPTS[flavour]
  const out: CodeToken[] = []
  let i = 0
  while (i < code.length) {
    if (scripts.braces && code.charAt(i) === '{') {
      i = scanBraces(code, i, out, scripts.keywords, false)
      continue
    }
    const open = TAG_OPEN.exec(code.slice(i))
    if (open === null) {
      i = plainText(code, i, out, scripts.braces ? '<{' : '<')
      continue
    }
    const tag = scanTag(code, i, open, out, scripts)
    i = tag.end
    if (!tag.closing && !tag.empty && tag.name === 'script')
      i = scanScript(code, i, out, scripts.keywords, { until: '</script' })
  }
  return out
}

/** The page's HTML example: markup, and JavaScript inside its module script. */
export function highlightHtml(code: string): CodeToken[] {
  return highlightMarkup(code, 'html')
}

const TS_BUILTIN = new Set(['boolean', 'number', 'string', 'void', 'object', 'unknown', 'any', 'never'])
const TS_CONSTANT = new Set(['null', 'true', 'false', 'undefined'])
const TS_TOKEN = /('(?:[^'\\]|\\.)*')|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|(\s+)|([^\sA-Za-z_$\d'])/g

/** The dash a table shows for "no attribute": punctuation, not a value. */
export const NONE = '—'

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
  // Event and slot names are strings where they are used: `addEventListener('…')`, `slot="…"`.
  if (role === 'event' || role === 'slot') return [{ cls: 'str', text }]
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

// Sticky. The groups, in order: a comment, `deno task <name>`, a variable with
// `=` and its value, a flag with an optional `=` and value, a quoted string,
// whitespace, any other word. A token starts where the last one ended, so `#`
// opens a comment only at the start of a word.
const SH_TOKEN =
  /(#.*)|(deno task [a-z]+)|([A-Z_][A-Z0-9_]*)(=)(\S*)|(--?[a-z][\w-]*)(?:(=)(\S*))?|('[^']*'|"[^"]*")|(\s+)|(\S+)/y
const NUMBER = /^-?\d+(?:\.\d+)?$/

const valueClass = (value: string): TokenClass => (NUMBER.test(value) ? 'num' : 'str')

/** Shell lines as the CLI's pages write them. Not a shell parser: commands of one line each. */
export function highlightSh(code: string): CodeToken[] {
  const out: CodeToken[] = []
  let i = 0
  while (i < code.length) {
    SH_TOKEN.lastIndex = i
    const m = SH_TOKEN.exec(code)
    if (m === null) {
      push(out, null, code.charAt(i))
      i++
      continue
    }
    const [all, comment, task, env, envEq = '', envValue = '', flag, flagEq = '', flagValue = '', str] = m
    if (comment !== undefined) push(out, 'com', all)
    else if (task !== undefined) push(out, 'fn', all)
    else if (env !== undefined) {
      push(out, 'type', env)
      push(out, 'pun', envEq)
      push(out, valueClass(envValue), envValue)
    } else if (flag !== undefined) {
      push(out, 'attr', flag)
      push(out, 'pun', flagEq)
      push(out, valueClass(flagValue), flagValue)
    } else if (str !== undefined) push(out, 'str', all)
    else push(out, null, all)
    i += all.length
  }
  return out
}

// The groups, in order: a string and, when a colon follows, the colon that
// makes it a key; a number; a constant; punctuation; whitespace; any other
// character. The last one matches anywhere, so the matches tile the input.
const JSON_TOKEN =
  /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])|(\s+)|([\s\S])/g

/** JSON as the CLI prints it, in the colours `cellTokens` gives a type's constants. */
export function highlightJson(code: string): CodeToken[] {
  const out: CodeToken[] = []
  for (const m of code.matchAll(JSON_TOKEN)) {
    const [all, str, colon, num, constant, pun] = m
    if (str !== undefined && colon !== undefined) {
      push(out, 'prop', str)
      push(out, null, colon.slice(0, -1))
      push(out, 'pun', ':')
    } else if (str !== undefined) push(out, 'str', str)
    else if (num !== undefined || constant !== undefined) push(out, 'num', all)
    else if (pun !== undefined) push(out, 'pun', all)
    else push(out, null, all)
  }
  return out
}

/** A fenced block's colours by its language, or null for a language the page shows plain (`text`). */
export function highlight(lang: string | null | undefined, code: string): CodeToken[] | null {
  if (lang === 'html' || lang === 'vue' || lang === 'svelte') return highlightMarkup(code, lang)
  if (lang === 'ts' || lang === 'tsx') {
    const out: CodeToken[] = []
    scanScript(code, 0, out, TS_KEYWORDS, { jsx: lang === 'tsx' })
    return out
  }
  if (lang === 'sh') return highlightSh(code)
  if (lang === 'json') return highlightJson(code)
  return null
}
