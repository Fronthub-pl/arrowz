// Advisory checks of the repository's written rules, answered by Jev: comments,
// commit messages and PR bodies, and the Polish dictionary. They report and never
// gate; thresholds are measured by jev-eval.ts (see docs/jev-guards.md).
import { commentBlocks, commentLines } from '@arrowz/engine/comment-lines'
import { isAbsolute, join } from '@std/path'
import type { Answers, Judge, Noul } from './jev-client.ts'
import type { InactiveKey, RuleKey } from '@arrowz/engine'

export type Flag = { where: string; question: string; p: number; excerpt: string }

export const MAX_FLAGS = 5
// Longer blocks are the regex guard's (`MAX_BLOCK` in comments.test.ts).
const MAX_LINES = 6
// 120 requests at 16 at a time fit the hook's 10 s timeout at the measured ~0.35 s p95.
export const MAX_COMMENT_REQUESTS = 120
const CONCURRENCY = 16

export type Shipped = { comments: boolean; message: boolean; i18n: boolean }
// Which guards the hook runs; a guard that missed its measured bar stays off (docs/jev-guards.md).
export const SHIPPED: Shipped = { comments: true, message: true, i18n: false }

/** Runs `fn` over `items`, at most `limit` at a time, results in input order. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export function excerpt(text: string, max = 80): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one
}

export function format(title: string, flags: Flag[], note?: string): string | null {
  if (flags.length === 0) return null
  const top = flags.slice().sort((a, b) => b.p - a.p).slice(0, MAX_FLAGS)
  const lines = top.map((f) => `- ${f.where}  ${f.question} p=${f.p.toFixed(2)}  ${excerpt(f.excerpt)}`)
  if (flags.length > top.length) lines.push(`(${flags.length - top.length} more not shown)`)
  if (note !== undefined) lines.push(note)
  return `jev: ${title}:\n${lines.join('\n')}`
}

/** One `## heading` section of a Markdown text, heading included; null when absent. */
export function ruleSection(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`)
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i] ?? '')) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

export type Commented = { line: number; text: string; code: string }

/** Blocks of at most six lines and trailing comments, each with the line of code it sits on or above. */
export function commentsOf(source: string, css: boolean): Commented[] {
  const src = source.split('\n')
  const out: Commented[] = []
  for (const b of commentBlocks(source, css)) {
    if (b.end - b.start + 1 > MAX_LINES) continue
    const code = src.slice(b.end).find((l) => l.trim() !== '') ?? ''
    out.push({ line: b.start, text: b.text, code: code.trim() })
  }
  for (const c of commentLines(source, css)) {
    if (!c.alone) out.push({ line: c.line, text: c.text, code: (src[c.line - 1] ?? '').trim() })
  }
  return out.sort((a, b) => a.line - b.line)
}

export const COMMENT_QUESTIONS: Record<string, Noul> = {
  violates: {
    type: 'noul',
    instructions: 'A reviewer applying `rule` would rewrite or delete the `comment`.',
    criteria: {
      true: 'The comment breaks the rule in some way and would be changed.',
      false: 'The comment already follows the rule and would be kept as it is.',
    },
  },
  history: {
    type: 'noul',
    instructions:
      'The `comment` narrates the history of the work: a pull request, review round, fix round, task number, handoff, ruling, plan step, or how the code used to be.',
    criteria: {
      true: 'It refers to the process or past versions of the code.',
      false: 'It speaks only about the code as it is now.',
    },
  },
  spec_ref: {
    type: 'noul',
    instructions:
      "The `comment` points to a spec or plan section (such as 'spec §5.1' or 'Spec D2') instead of, or in addition to, stating the constraint in its own words.",
  },
}
export const VIOLATES_AT = 0.85
export const HISTORY_AT = 0.9

export function askComment(judge: Judge, rule: string, file: string, c: Commented): Promise<Answers | null> {
  return judge({ rule, file, comment: c.text.trim(), code: c.code }, COMMENT_QUESTIONS)
}

export function commentFlag(where: string, c: Commented, a: Answers): Flag | null {
  const fired: Array<[string, number]> = []
  const violates = a.violates ?? 0
  const history = a.history ?? 0
  const specRef = a.spec_ref ?? 0
  if (violates > VIOLATES_AT) fired.push(['violates', violates])
  if (Math.max(history, specRef) > HISTORY_AT) {
    fired.push(history >= specRef ? ['history', history] : ['spec_ref', specRef])
  }
  const best = fired.sort((x, y) => y[1] - x[1])[0]
  return best === undefined ? null : { where, question: best[0], p: best[1], excerpt: c.text }
}

export async function comments(
  judge: Judge,
  rule: string,
  file: string,
  source: string,
  place: (line: number) => string,
): Promise<{ flags: Flag[]; skipped: number }> {
  const all = commentsOf(source, file.endsWith('.css'))
  const checked = all.slice(0, MAX_COMMENT_REQUESTS)
  const answers = await pool(checked, CONCURRENCY, (c) => askComment(judge, rule, file, c))
  const flags: Flag[] = []
  checked.forEach((c, i) => {
    const a = answers[i]
    const f = a ? commentFlag(place(c.line), c, a) : null
    if (f) flags.push(f)
  })
  return { flags, skipped: all.length - checked.length }
}

export function commentReport(r: { flags: Flag[]; skipped: number }): string | null {
  const n = r.flags.length
  const note = r.skipped > 0 ? `(${r.skipped} further comments were not checked)` : undefined
  return format(`${n} comment${n === 1 ? '' : 's'} may break the comment rule (CLAUDE.md, Comments)`, r.flags, note)
}

export type MessageKind = 'commit' | 'pr'

/** Shell words of `s` up to the first unquoted `;`, `&`, `|` or newline; an unterminated quote ends the list. */
export function words(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let has = false
  let i = 0
  while (i < s.length) {
    const c = s[i] ?? ''
    if (c === "'") {
      const end = s.indexOf("'", i + 1)
      if (end === -1) return out
      cur += s.slice(i + 1, end)
      has = true
      i = end + 1
      continue
    }
    if (c === '"') {
      i++
      let closed = false
      while (i < s.length) {
        const d = s[i] ?? ''
        const e = s[i + 1] ?? ''
        if (d === '\\' && '"\\$`'.includes(e) && e !== '') {
          cur += e
          i += 2
          continue
        }
        i++
        if (d === '"') {
          closed = true
          break
        }
        cur += d
      }
      if (!closed) return out
      has = true
      continue
    }
    if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1] ?? ''
      has = true
      i += 2
      continue
    }
    if (/\s/.test(c) || c === ';' || c === '&' || c === '|') {
      if (has) out.push(cur)
      cur = ''
      has = false
      if (c !== ' ' && c !== '\t') return out
      i++
      continue
    }
    cur += c
    has = true
    i++
  }
  if (has) out.push(cur)
  return out
}

const GIT_COMMIT = /\bgit\s+(?:-C\s+\S+\s+)?commit\b/
const GH_PR = /\bgh\s+pr\s+(?:create|edit)\b/
// `-m "$(cat <<'EOF' … EOF )"`: the message is the heredoc's body.
const SUBSTITUTED = /^\$\(\s*cat\s+<<-?\s*['"]?(\w+)['"]?\s*\n([\s\S]*?)\n[ \t]*\1[ \t]*\n?\s*\)$/
// `-F - <<'EOF'`: the message arrives on stdin.
const STDIN = /<<-?\s*['"]?(\w+)['"]?[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*(?:\n|$)/

const unwrap = (v: string) => SUBSTITUTED.exec(v)?.[2] ?? v

export function messageFromCommand(
  command: string,
  cwd: string,
  read: (path: string) => string | null,
): { kind: MessageKind; text: string } | null {
  const commit = GIT_COMMIT.exec(command)
  const hit = commit ?? GH_PR.exec(command)
  if (!hit) return null
  const kind: MessageKind = commit ? 'commit' : 'pr'
  const rest = command.slice(hit.index + hit[0].length)
  const ws = words(rest)
  const texts: string[] = []
  const fromFile = (path: string) => {
    if (path === '-') return STDIN.exec(rest)?.[2] ?? null
    return read(isAbsolute(path) ? path : join(cwd, path))
  }
  const textFlag = kind === 'commit'
    ? (w: string) => /^-[a-zA-Z]*m$/.test(w) || w === '--message'
    : (w: string) => w === '--body' || w === '-b'
  const fileFlag = kind === 'commit'
    ? (w: string) => /^-[a-zA-Z]*F$/.test(w) || w === '--file'
    : (w: string) => w === '--body-file' || w === '-F'
  const textEq = kind === 'commit' ? '--message=' : '--body='
  const fileEq = kind === 'commit' ? '--file=' : '--body-file='
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] ?? ''
    const next = ws[i + 1]
    if (textFlag(w) && next !== undefined) {
      texts.push(unwrap(next))
      i++
    } else if (fileFlag(w) && next !== undefined) {
      const t = fromFile(next)
      if (t !== null) texts.push(t)
      i++
    } else if (w.startsWith(textEq)) {
      texts.push(unwrap(w.slice(textEq.length)))
    } else if (w.startsWith(fileEq)) {
      const t = fromFile(w.slice(fileEq.length))
      if (t !== null) texts.push(t)
    }
  }
  const text = texts.join('\n\n').trim()
  return text === '' ? null : { kind, text }
}

export const MESSAGE_QUESTIONS: Record<string, Noul> = {
  not_english: {
    type: 'noul',
    instructions:
      'The `text` is written, fully or partly, in a language other than English, for example Polish with or without diacritics. Code identifiers, file names and quoted interface strings do not count.',
  },
}
// Measured by jev-eval.ts on jev-1.13.0 (docs/jev-guards.md).
export const MESSAGE_AT = { not_english: 0.8 }

// A trailer, or a footer that starts with "Generated with" after only non-letters, not prose that mentions it.
const ATTRIBUTION = /^\s*co-authored-by:.*$|^[^\p{L}\n]*generated with\b.*$/imu
// No Polish-letter rule: messages may quote the Polish dictionary, which a letter regex cannot tell from Polish prose.

const whereOf = (kind: MessageKind) => (kind === 'commit' ? 'commit message' : 'PR body')

export function askMessage(judge: Judge, kind: MessageKind, text: string): Promise<Answers | null> {
  return judge({ kind: kind === 'commit' ? 'commit message' : 'pull request description', text }, MESSAGE_QUESTIONS)
}

export function messageFlags(kind: MessageKind, text: string, a: Answers | null, at = MESSAGE_AT): Flag[] {
  const where = whereOf(kind)
  const first = text.split('\n').find((l) => l.trim() !== '') ?? ''
  const flags: Flag[] = []
  const attribution = ATTRIBUTION.exec(text)
  if (attribution) flags.push({ where, question: 'attribution', p: 1, excerpt: attribution[0] })
  const notEnglish = a?.not_english ?? 0
  if (notEnglish > at.not_english) flags.push({ where, question: 'not_english', p: notEnglish, excerpt: first })
  return flags
}

export async function message(judge: Judge, kind: MessageKind, text: string): Promise<Flag[]> {
  return messageFlags(kind, text, await askMessage(judge, kind, text))
}

export function messageReport(kind: MessageKind, flags: Flag[]): string | null {
  return format(`the ${whereOf(kind)} may break the message rules (CLAUDE.md)`, flags)
}

export type Pair = { key: string; en: string; pl: string }

export function walkPairs(en: unknown, pl: unknown, prefix: string, out: Pair[]): void {
  if (typeof en === 'string') {
    if (typeof pl === 'string') out.push({ key: prefix, en, pl })
    return
  }
  if (typeof en !== 'object' || en === null || typeof pl !== 'object' || pl === null) return
  for (const [k, v] of Object.entries(en)) {
    walkPairs(v, (pl as Record<string, unknown>)[k], prefix === '' ? k : `${prefix}.${k}`, out)
  }
}

/** Every English source text with its Polish translation; identical pairs (units, symbols) left out. */
export async function dictionaryPairs(): Promise<Pair[]> {
  const { EN, PL } = await import('@arrowz/engine/i18n')
  const { PARAM_SPEC, INACTIVE_REASONS, RULE_REASONS } = await import('@arrowz/engine')
  const out: Pair[] = []
  walkPairs(EN, PL, '', out)
  for (const s of PARAM_SPEC) {
    const pl = PL.params[s.key]
    out.push({ key: `params.${s.key}.label`, en: s.label, pl: pl.label })
    out.push({ key: `params.${s.key}.help`, en: s.help, pl: pl.help })
  }
  const reasons: Record<string, string> = { ...INACTIVE_REASONS, ...RULE_REASONS }
  for (const [k, en] of Object.entries(reasons) as Array<[InactiveKey | RuleKey, string]>) {
    out.push({ key: `reasons.${k}`, en, pl: PL.reasons[k] })
  }
  return out.filter((p) => p.en.trim() !== p.pl.trim())
}

export const PAIR_QUESTIONS: Record<string, Noul> = {
  same_meaning: {
    type: 'noul',
    instructions:
      'The Polish text `pl` says the same as the English text `en`: a reader of either learns the same facts, numbers, conditions and instructions.',
    criteria: {
      true: 'The two texts carry the same meaning, even if worded differently.',
      false: 'One text says something the other does not, or contradicts it.',
    },
  },
}
// Provisional; jev-eval.ts measures the final value (docs/jev-guards.md).
export const DIFFERS_AT = 0.7

export function askPair(judge: Judge, pair: Pair): Promise<Answers | null> {
  return judge({ key: pair.key, en: pair.en, pl: pair.pl }, PAIR_QUESTIONS)
}

export function pairFlag(pair: Pair, a: Answers, at = DIFFERS_AT): Flag | null {
  const differs = Math.round((1 - (a.same_meaning ?? 1)) * 1000) / 1000
  return differs > at ? { where: `lab-i18n.ts ${pair.key}`, question: 'differs', p: differs, excerpt: pair.pl } : null
}

export async function i18n(judge: Judge, pairs: Pair[]): Promise<Flag[]> {
  const answers = await pool(pairs, CONCURRENCY, (p) => askPair(judge, p))
  const flags: Flag[] = []
  pairs.forEach((p, i) => {
    const a = answers[i]
    const f = a ? pairFlag(p, a) : null
    if (f) flags.push(f)
  })
  return flags
}

export function i18nReport(flags: Flag[]): string | null {
  const n = flags.length
  return format(`${n} Polish string${n === 1 ? '' : 's'} may not say what the English says`, flags)
}
