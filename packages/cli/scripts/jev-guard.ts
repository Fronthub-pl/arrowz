// Advisory checks of the repository's written rules, answered by Jev: comments,
// commit messages and PR bodies, and the Polish dictionary. They report and never
// gate; thresholds are measured by jev-eval.ts (see docs/jev-guards.md).
import { commentBlocks, commentLines } from '@arrowz/engine/comment-lines'
import type { Answers, Judge, Noul } from './jev-client.ts'

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
