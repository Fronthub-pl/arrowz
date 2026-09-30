// Advisory checks of Claude Code's memory, measured in docs/jev-guards.md: an item that only restates
// the code or git history (Jev), a MEMORY.md line that carries content instead of a pointer, and
// present-tense lines that went stale. They report and never gate.
import { dirname, join, relative } from '@std/path'
import { type Answers, defaultJudge, type Judge, type Noul } from './jev-client.ts'
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

export type Note = { file: string; text: string }

// A comma ends the clause: in "PR #N (x), zero otwartych" the words after it negate, they do not claim.
const OPEN_PR =
  /(?<!zero )(?<!no )\b(?:PR ?#(\d+)[^.;,\n—]{0,25}?\b(?:otwart\w*|open)\b|(?:otwart\w*|open)\s+(?:mój\s+|my\s+)?PR ?#(\d+))/gi

/** Pull requests that `text` calls open. */
export function openPrClaims(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(OPEN_PR)) out.push(Number(m[1] ?? m[2]))
  return out
}

/** The text of the memory that speaks of the present: every index line, and each description's first clause. */
export function presentSegments(index: string, notes: Note[]): Array<{ where: string; text: string }> {
  const out = index.split('\n').map((text, i) => ({ where: `MEMORY.md:${i + 1}`, text }))
  for (const n of notes) {
    const first = /^description:\s*"?(.*)$/m.exec(n.text)?.[1]?.split(/[;—]|\. /)[0]
    if (first) out.push({ where: `${n.file} description`, text: first })
  }
  return out
}

export type StateInput = {
  index: string
  notes: Note[]
  exists: (file: string) => boolean
  openPrs: Set<number> | null
  tracked: Set<string> | null
}

function trackedPath(tracked: Set<string>, path: string): boolean {
  if (tracked.has(path)) return true
  for (const t of tracked) if (t.startsWith(`${path}/`)) return true
  return false
}

/** Present-tense lines that are no longer true; a null source (gh or git unavailable) checks nothing of its own. */
export function staleState(s: StateInput): Finding[] {
  const out: Finding[] = []
  for (const seg of presentSegments(s.index, s.notes)) {
    if (s.openPrs !== null) {
      for (const n of openPrClaims(seg.text)) {
        if (!s.openPrs.has(n)) out.push({ where: seg.where, what: `PR #${n} is called open, but it is not open` })
      }
    }
    if (seg.where.startsWith('MEMORY.md')) {
      for (const m of seg.text.matchAll(/\]\(([^)\s]+\.md)\)/g)) {
        const file = m[1] ?? ''
        if (!s.exists(file)) out.push({ where: seg.where, what: `links ${file}, which does not exist` })
      }
    }
    if (s.tracked !== null) {
      for (const m of seg.text.matchAll(/`((?:apps|packages|docs)\/[^`\s*<>]+)`/g)) {
        const path = (m[1] ?? '').replace(/:\d.*$/, '').replace(/\/$/, '')
        if (!trackedPath(s.tracked, path)) {
          out.push({ where: seg.where, what: `names ${path}, which git does not track` })
        }
      }
    }
  }
  return out
}

export type Run = (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string } | null>
export type Deps = {
  judge: Judge
  home: string
  read: (path: string) => string | null
  list: (dir: string) => string[] | null
  run: Run
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)
const BASIC_MEMORY_TOOLS = new Set(['mcp__memory-arrowz__write_note', 'mcp__memory-arrowz__edit_note'])
// A session log records what happened, which is its purpose: its folder or its dated title marks it.
const SESSION_LOG = /(^|\/)sesje(\/|$)|^\d{4}-\d{2}-\d{2}\b/

/** The auto-memory file `path` names, under any project key; null for any other path. */
export function autoMemoryFile(home: string, path: string): { dir: string; file: string } | null {
  const rel = relative(join(home, '.claude', 'projects'), path)
  const m = /^([^/.][^/]*)\/memory\/([^/]+\.md)$/.exec(rel)
  return m === null ? null : { dir: dirname(path), file: m[2] ?? '' }
}

const lines = (r: { code: number; stdout: string } | null) =>
  r !== null && r.code === 0 ? r.stdout.split('\n').filter((l) => l !== '') : null

export async function sessionStart(memoryDir: string, cwd: string, deps: Deps, all = false): Promise<string | null> {
  const index = deps.read(join(memoryDir, 'MEMORY.md'))
  if (index === null) return null
  const listed = deps.list(memoryDir)
  const notes: Note[] = []
  for (const file of listed ?? []) {
    if (file === 'MEMORY.md' || !file.endsWith('.md')) continue
    const text = deps.read(join(memoryDir, file))
    if (text !== null) notes.push({ file, text })
  }
  const [prs, files] = await Promise.all([
    deps.run('gh', ['pr', 'list', '--state', 'open', '--json', 'number', '-q', '.[].number'], cwd),
    deps.run('git', ['ls-files'], cwd),
  ])
  const open = lines(prs)
  const tracked = lines(files)
  const found = staleState({
    index,
    notes,
    exists: (f) => listed === null || listed.includes(f),
    openPrs: open === null ? null : new Set(open.map(Number)),
    tracked: tracked === null ? null : new Set(tracked),
  })
  return findingsReport(
    'present-tense memory that is no longer true (fix the line, or move it into a dated entry)',
    found,
    all,
  )
}

export async function runMemoryHook(payload: unknown, deps: Deps): Promise<string | null> {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as {
    hook_event_name?: unknown
    tool_name?: unknown
    tool_input?: unknown
    cwd?: unknown
    transcript_path?: unknown
  }
  const input = (typeof p.tool_input === 'object' && p.tool_input !== null ? p.tool_input : {}) as Record<
    string,
    unknown
  >
  const event = str(p.hook_event_name)
  const tool = str(p.tool_name)
  let out: string | null = null

  if (event === 'SessionStart') {
    const transcript = str(p.transcript_path)
    if (transcript !== null) out = await sessionStart(join(dirname(transcript), 'memory'), str(p.cwd) ?? '.', deps)
  } else if (event === 'PostToolUse' && (tool === 'Write' || tool === 'Edit')) {
    const path = str(input.file_path)
    const target = path === null ? null : autoMemoryFile(deps.home, path)
    const written = tool === 'Edit' ? str(input.new_string) : str(input.content)
    if (target !== null && written !== null && target.file === 'MEMORY.md') {
      const where = tool === 'Edit' ? () => 'MEMORY.md (edit)' : (l: number) => `MEMORY.md:${l}`
      const title = `MEMORY.md lines over ${MAX_INDEX_LINE} characters (the index points; the file holds the content)`
      out = findingsReport(title, longIndexLines(written, where))
    } else if (target !== null && written !== null) {
      out = memoryReport(await memoryFlags(deps.judge, paragraphs(written), target.file))
    }
  } else if (event === 'PostToolUse' && tool !== null && BASIC_MEMORY_TOOLS.has(tool)) {
    const place = str(input.directory) ?? str(input.identifier) ?? ''
    const content = str(input.content)
    if (content !== null && !SESSION_LOG.test(place)) {
      out = memoryReport(await memoryFlags(deps.judge, observations(content), `note "${str(input.title) ?? place}"`))
    }
  }
  if (out === null || event === null) return null
  return JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: out } })
}

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path)
  } catch {
    return null
  }
}

function listOrNull(dir: string): string[] | null {
  try {
    return Array.from(Deno.readDirSync(dir)).filter((e) => e.isFile).map((e) => e.name)
  } catch {
    return null
  }
}

const run: Run = async (cmd, args, cwd) => {
  try {
    const o = await new Deno.Command(cmd, { args, cwd, stdout: 'piped', stderr: 'null' }).output()
    return { code: o.code, stdout: new TextDecoder().decode(o.stdout) }
  } catch {
    return null
  }
}

function manual(mode: string | undefined, _args: string[]): Promise<number> {
  console.error(`usage: memory-guard.ts hook | audit (got ${mode ?? 'nothing'})`)
  return Promise.resolve(2)
}

if (import.meta.main) {
  const [mode, ...args] = Deno.args
  if (mode === 'hook') {
    let out: string | null = null
    try {
      const raw = await new Response(Deno.stdin.readable).text()
      // The key is read only when M1 asks: a locked 1Password would cost 2 s on every write.
      let real: Promise<Judge | null> | null = null
      const judge: Judge = async (state, questions) => {
        real ??= defaultJudge()
        const j = await real
        return j === null ? null : j(state, questions)
      }
      const home = Deno.env.get('HOME') ?? ''
      out = await runMemoryHook(JSON.parse(raw), { judge, home, read: readOrNull, list: listOrNull, run })
    } catch {
      out = null
    }
    if (out !== null) console.log(out)
    Deno.exit(0)
  }
  Deno.exit(await manual(mode, args))
}
