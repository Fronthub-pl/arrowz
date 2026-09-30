// Advisory checks of Claude Code's memory, measured in docs/jev-guards.md: an item that only restates
// the code or git history (Jev), a MEMORY.md line that carries content instead of a pointer, and
// present-tense lines that went stale. They report and never gate.
import { excerpt, MAX_FLAGS } from './jev-guard.ts'

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
