// The Jev guards on a pull request in CI: the comments it adds, its commits and its own title and
// body, judged with the questions and thresholds the hooks use, and the docs pages it changes,
// judged with the questions and thresholds of `jev-docs.ts`. Like the hooks it only advises:
// warnings, a job summary, and always exit 0.
// The key comes from the TYPESAFE_API_KEY secret, which a fork's PR never gets,
// so there the run says so once and checks nothing. See docs/jev-guards.md.
import { fromFileUrl, join } from '@std/path'
import { makeJudge } from './jev-client.ts'
import type { Judge } from './jev-client.ts'
import {
  askComment,
  type Commented,
  commentFlag,
  commentsOf,
  excerpt,
  type Flag,
  inScope,
  message,
  pool,
  ruleSection,
  SHIPPED,
} from './jev-guard.ts'
import { checkDocs, docsPagesOf, readDocs } from './jev-docs.ts'

export type PrEvent = { action: string; title: string; body: string; base: string; head: string }
export type Plan = { comments: boolean; commits: boolean; pr: boolean }
export type Finding = { flag: Flag; file?: string; line?: number }
export type Checked = { comments: number; files: number; commits: number; pr: boolean; skipped: number; docs: number }

/** Bounds what one run costs; a larger PR reports the rest as not checked. */
export const CI_MAX_COMMENTS = 400
const CONCURRENCY = 8

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? v as Record<string, unknown> : null
const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** The part of a `pull_request` event payload the guards read; null for any other payload. */
export function prEventOf(json: unknown): PrEvent | null {
  const pr = rec(rec(json)?.pull_request)
  const base = text(rec(pr?.base)?.sha)
  const head = text(rec(pr?.head)?.sha)
  if (pr === null || base === '' || head === '') return null
  return { action: text(rec(json)?.action), title: text(pr.title), body: text(pr.body), base, head }
}

/** An edit changes only the title or body, so only they are asked about again. */
export function planOf(action: string): Plan {
  const all = action !== 'edited'
  return { comments: all, commits: all, pr: true }
}

/** The added lines of a `git diff --unified=0`, by new-side path, for files the comment guard covers. */
export function addedLines(diff: string): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>()
  let file: string | null = null
  let header = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      header = true
      file = null
    } else if (header && line.startsWith('+++ ')) {
      const path = line.slice(4)
      file = path.startsWith('b/') && inScope(path.slice(2)) ? path.slice(2) : null
    } else if (line.startsWith('@@')) {
      header = false
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
      if (file === null || m === null) continue
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      if (count === 0) continue
      const lines = out.get(file) ?? new Set<number>()
      for (let n = start; n < start + count; n++) lines.add(n)
      out.set(file, lines)
    }
  }
  return out
}

/** The comments any of whose lines were added. */
export function touching(comments: Commented[], added: Set<number>): Commented[] {
  return comments.filter((c) => {
    const end = c.line + c.text.split('\n').length - 1
    for (let n = c.line; n <= end; n++) if (added.has(n)) return true
    return false
  })
}

/** Commits from `git log --format=%H%x1f%B%x1e`. */
export function commitsOf(log: string): Array<{ sha: string; message: string }> {
  return log.split('\x1e').map((r) => r.trim()).filter((r) => r !== '').map((r) => {
    const at = r.indexOf('\x1f')
    return { sha: r.slice(0, at), message: r.slice(at + 1).trim() }
  })
}

const escapeData = (s: string) => s.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
const escapeProperty = (s: string) => escapeData(s).replaceAll(':', '%3A').replaceAll(',', '%2C')

/** A docs flag's `where` as a file and a line: `path:line`, `path #section` or `path key`. */
export function docsFinding(flag: Flag): Finding {
  const line = /^(\S+):(\d+)$/.exec(flag.where)
  if (line?.[1] !== undefined && line[2] !== undefined) return { flag, file: line[1], line: Number(line[2]) }
  const file = /^(\S+\.(?:md|ts))\s/.exec(flag.where)?.[1]
  return file === undefined ? { flag } : { flag, file }
}

/** One finding as a `::warning` workflow command, on its line when it has one. */
export function annotation(f: Finding): string {
  const props = [
    ...(f.file === undefined ? [] : [`file=${escapeProperty(f.file)}`]),
    ...(f.line === undefined ? [] : [`line=${f.line}`]),
    `title=${escapeProperty(`Jev: ${f.flag.question}`)}`,
  ]
  const where = f.file === undefined ? `${f.flag.where}: ` : ''
  return `::warning ${props.join(',')}::${escapeData(`${where}p=${f.flag.p.toFixed(2)} ${excerpt(f.flag.excerpt)}`)}`
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const cell = (s: string) => s.replaceAll('|', '\\|')

/** The job summary: what was checked and every finding. */
export function summaryOf(checked: Checked, findings: Finding[]): string {
  const parts = [
    ...(checked.comments > 0
      ? [`${count(checked.comments, 'added comment', 'added comments')} in ${count(checked.files, 'file', 'files')}`]
      : []),
    ...(checked.commits > 0 ? [count(checked.commits, 'commit', 'commits')] : []),
    ...(checked.docs > 0 ? [count(checked.docs, 'docs page', 'docs pages')] : []),
    ...(checked.pr ? ['the PR title and body'] : []),
  ]
  const lines = ['### Jev guards', '', `Checked: ${parts.length > 0 ? parts.join(', ') : 'nothing'}.`]
  if (checked.skipped > 0) {
    lines.push('', `${count(checked.skipped, 'further added comment', 'further added comments')} not checked.`)
  }
  lines.push('')
  if (findings.length === 0) {
    lines.push('Nothing flagged.')
  } else {
    lines.push('| Where | Question | p | Text |', '|---|---|---|---|')
    for (const { flag } of findings) {
      lines.push(`| ${cell(flag.where)} | ${flag.question} | ${flag.p.toFixed(2)} | ${cell(excerpt(flag.excerpt))} |`)
    }
  }
  return `${lines.join('\n')}\n`
}

export type CiDeps = {
  judge: Judge
  event: PrEvent
  git: (args: string[]) => Promise<string>
  /** A file at the PR's head, by repository-relative path. */
  read: (rel: string) => string | null
  rule: string | null
}

export async function runCi(deps: CiDeps): Promise<{ findings: Finding[]; checked: Checked }> {
  const { judge, event } = deps
  const plan = planOf(event.action)
  const findings: Finding[] = []
  const checked: Checked = { comments: 0, files: 0, commits: 0, pr: false, skipped: 0, docs: 0 }
  const range = `${event.base}...${event.head}`

  if (plan.comments && SHIPPED.comments && deps.rule !== null) {
    const rule = deps.rule
    const diff = await deps.git(['diff', '--unified=0', '--no-color', '--no-ext-diff', range])
    const items: Array<{ rel: string; c: Commented }> = []
    for (const [rel, added] of addedLines(diff)) {
      const source = deps.read(rel)
      if (source === null) continue
      for (const c of touching(commentsOf(source, rel.endsWith('.css')), added)) items.push({ rel, c })
    }
    const asked = items.slice(0, CI_MAX_COMMENTS)
    const answers = await pool(asked, CONCURRENCY, ({ rel, c }) => askComment(judge, rule, rel, c))
    asked.forEach(({ rel, c }, i) => {
      const a = answers[i]
      const flag = a ? commentFlag(`${rel}:${c.line}`, c, a) : null
      if (flag) findings.push({ flag, file: rel, line: c.line })
    })
    checked.comments = asked.length
    checked.files = new Set(asked.map((x) => x.rel)).size
    checked.skipped = items.length - asked.length
  }

  if (plan.comments) {
    const pages = docsPagesOf(await deps.git(['diff', '--name-only', range]))
    for (const page of pages) {
      const input = readDocs(page, deps.read)
      if (input !== null) { for (const flag of await checkDocs(judge, input)) findings.push(docsFinding(flag)) }
    }
    checked.docs = pages.length
  }

  if (plan.commits && SHIPPED.message) {
    const log = await deps.git(['log', '--no-merges', '--format=%H%x1f%B%x1e', `${event.base}..${event.head}`])
    const commits = commitsOf(log)
    const flags = await pool(commits, CONCURRENCY, (c) => message(judge, 'commit', c.message))
    commits.forEach((c, i) => {
      for (const flag of flags[i] ?? []) findings.push({ flag: { ...flag, where: `commit ${c.sha.slice(0, 7)}` } })
    })
    checked.commits = commits.length
  }

  if (plan.pr && SHIPPED.message) {
    const prText = [event.title, event.body].map((s) => s.trim()).filter((s) => s !== '').join('\n\n')
    for (const flag of await message(judge, 'pr', prText)) findings.push({ flag })
    checked.pr = true
  }

  return { findings, checked }
}

const ROOT = fromFileUrl(new URL('../../../', import.meta.url))

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path)
  } catch {
    return null
  }
}

async function git(args: string[]): Promise<string> {
  const out = await new Deno.Command('git', { args, cwd: ROOT, stdout: 'piped', stderr: 'piped' }).output()
  if (!out.success) throw new Error(`git ${args[0]} failed: ${new TextDecoder().decode(out.stderr).trim()}`)
  return new TextDecoder().decode(out.stdout)
}

if (import.meta.main) {
  try {
    const key = Deno.env.get('TYPESAFE_API_KEY') ?? ''
    const event = prEventOf(JSON.parse(readOrNull(Deno.env.get('GITHUB_EVENT_PATH') ?? '') ?? 'null'))
    if (event === null) {
      console.log('::notice title=Jev::not a pull_request event; nothing checked')
    } else if (key === '') {
      console.log("::notice title=Jev::no TYPESAFE_API_KEY (a fork's PR gets no secrets); nothing checked")
    } else {
      const rule = ruleSection(readOrNull(join(ROOT, 'CLAUDE.md')) ?? '', 'Comments')
      const r = await runCi({ judge: makeJudge({ key }), event, git, read: (rel) => readOrNull(join(ROOT, rel)), rule })
      for (const f of r.findings) console.log(annotation(f))
      const summary = summaryOf(r.checked, r.findings)
      const path = Deno.env.get('GITHUB_STEP_SUMMARY')
      if (path === undefined) console.log(summary)
      else Deno.writeTextFileSync(path, summary, { append: true })
    }
  } catch (e) {
    console.log(`::notice title=Jev::the guards did not run: ${escapeData(String(e))}`)
  }
  Deno.exit(0)
}
