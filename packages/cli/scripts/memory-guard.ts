// Advisory checks of Claude Code's memory, measured in docs/jev-guards.md: an item that only restates
// the code or git history (Jev), a MEMORY.md line that carries content instead of a pointer, and
// present-tense lines that went stale. They report and never gate.
import type { Answers, Judge, Noul } from './jev-client.ts'
import { excerpt, type Flag, format, MAX_FLAGS, pool } from './jev-guard.ts'

export const MAX_INDEX_LINE = 130

/** One deterministic finding: where it is and what is wrong. */
export type Finding = { where: string; what: string }

/** Observation lines `- [category] text` of a basic-memory note; a following plain line continues its item. */
export function observations(text: string): string[] {
  const out: string[] = []
  let cur: string | null = null
  let fence = false
  const flush = () => {
    if (cur !== null) out.push(cur)
    cur = null
  }
  for (const l of text.split('\n')) {
    if (/^\s*```/.test(l)) {
      fence = !fence
      flush()
      continue
    }
    if (fence) continue
    if (/^- \[[^\]]+\]/.test(l)) {
      flush()
      cur = l.trim()
    } else if (cur !== null && l.trim() !== '' && !/^(- |#)/.test(l)) {
      cur += ` ${l.trim()}`
    } else {
      flush()
    }
  }
  flush()
  return out
}

/** Body paragraphs of at least 80 characters, the unit M1 was measured on; frontmatter, headings and fences skipped. */
export function paragraphs(text: string): string[] {
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  const out: string[] = []
  let fence = false
  let buf: string[] = []
  const flush = () => {
    const p = buf.join(' ').trim()
    if (p.length >= 80) out.push(p)
    buf = []
  }
  for (const l of body.split('\n')) {
    if (/^\s*```/.test(l)) {
      fence = !fence
      flush()
      continue
    }
    if (fence) continue
    if (l.trim() === '' || /^#/.test(l)) flush()
    else buf.push(l.trim())
  }
  flush()
  return out
}

/** Index entries longer than MAX_INDEX_LINE code points, so a Polish letter counts once. */
export function longIndexLines(text: string, where: (line: number) => string): Finding[] {
  const out: Finding[] = []
  text.split('\n').forEach((line, i) => {
    const n = Array.from(line).length
    if (line.startsWith('- [') && n > MAX_INDEX_LINE) {
      out.push({ where: where(i + 1), what: `${n} characters: ${excerpt(line)}` })
    }
  })
  return out
}

export function findingsReport(title: string, found: Finding[], all = false): string | null {
  if (found.length === 0) return null
  const shown = all ? found : found.slice(0, MAX_FLAGS)
  const lines = shown.map((f) => `- ${f.where}  ${f.what}`)
  if (found.length > shown.length) lines.push(`(${found.length - shown.length} more not shown)`)
  return `memory: ${title}:\n${lines.join('\n')}`
}

export const MEMORY_QUESTIONS: Record<string, Noul> = {
  violates: {
    type: 'noul',
    instructions:
      'A reviewer applying this rule would delete the `memory_item`: "A memory note records a decision with its reason, a lesson, a gotcha or a non-obvious constraint — not a fact that is plainly readable from the code or the git history."',
    criteria: {
      true: 'The item is a plain fact about the code or git history and teaches nothing else.',
      false:
        'The item records a reason, a lesson, a gotcha, a measurement, a user decision or a non-obvious constraint.',
    },
  },
}
// Held out: 0.4 % false alarms and a third of real violations found; see docs/jev-guards.md.
export const MEMORY_AT = 0.64
// 40 requests at 16 at a time fit the hook's 10 s at the measured ~0.35 s p95.
export const MAX_MEMORY_REQUESTS = 40
const CONCURRENCY = 16

export function askMemory(judge: Judge, item: string): Promise<Answers | null> {
  return judge({ memory_item: item }, MEMORY_QUESTIONS)
}

export async function memoryFlags(
  judge: Judge,
  items: string[],
  where: string,
  cap = MAX_MEMORY_REQUESTS,
): Promise<{ flags: Flag[]; skipped: number }> {
  const asked = items.slice(0, cap)
  const answers = await pool(asked, CONCURRENCY, (item) => askMemory(judge, item))
  const flags: Flag[] = []
  answers.forEach((a, i) => {
    const p = a?.violates ?? 0
    if (p > MEMORY_AT) flags.push({ where, question: 'code_fact', p, excerpt: asked[i] ?? '' })
  })
  return { flags, skipped: items.length - asked.length }
}

export function memoryReport(r: { flags: Flag[]; skipped: number }): string | null {
  const note = r.skipped > 0 ? `(${r.skipped} further items were not checked)` : undefined
  return format(
    'memory items that may only restate the code or git history (keep a reason, a lesson or a trap)',
    r.flags,
    note,
  )
}
