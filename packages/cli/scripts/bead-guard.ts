// Gates `gh pr create` on a beads task: the PR body must cite an open bead
// (`Bead: <id>`), and once the PR exists the bead is linked to it. Unlike the
// Jev guards this one denies; see docs/bead-guard.md.
import { isAbsolute, join } from '@std/path'
import { messageFromCommand, words } from './jev-guard.ts'

export type Run = (cmd: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string }>
export type Deps = { run: Run; read: (path: string) => string | null }

type Bead = { id: string; title: string; status: string; metadata?: Record<string, unknown> }

const GH_PR_CREATE = /(?:^|[;&|(\n]\s*)(gh\s+pr\s+create)\b/
const HEREDOC = /(<<-?\s*['"]?(\w+)['"]?[^\n]*\n)([\s\S]*?\n[ \t]*\2[ \t]*)(?=\n|$)/g
const QUOTED = /'[^']*'|"(?:\\.|[^"\\])*"/g
const BEAD_LINE = /^Bead:\s*`?([\w.-]+)`?\s*$/im
const PR_URL = /https:\/\/github\.com\/\S+\/pull\/(\d+)/

// `fix`, `feat`, `docs`, `chore` set a bead's type; the other known prefixes become its area label.
const TYPE: Record<string, string> = { fix: 'bug', feat: 'feature', docs: 'chore', chore: 'chore', dependabot: 'chore' }
const AREA = new Set(['lab', 'engine', 'docs', 'board', 'board-element', 'element', 'store', 'cli', 'tools', 'spec'])

/** The value of the first `flag` or `--long=value` among the words after `gh pr create`. */
function flagValue(ws: string[], short: string, long: string): string | null {
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] ?? ''
    if ((w === short || w === long) && ws[i + 1] !== undefined) return ws[i + 1] ?? null
    if (w.startsWith(`${long}=`)) return w.slice(long.length + 1)
  }
  return null
}

/** Where `gh pr create` starts as a command, not inside quotes or a heredoc; -1 when it does not. */
export function createAt(command: string): number {
  const blank = (m: string) => ' '.repeat(m.length)
  const masked = command
    .replace(HEREDOC, (_m, head: string, _tag: string, body: string) => head + blank(body))
    .replace(QUOTED, blank)
  const m = GH_PR_CREATE.exec(masked)
  return m === null ? -1 : m.index + m[0].length - (m[1]?.length ?? 0)
}

async function beads(run: Run, cwd: string, args: string[]): Promise<Bead[] | null> {
  const r = await run('bd', [...args, '--json'], cwd)
  if (r.code !== 0) return null
  const parsed: unknown = JSON.parse(r.stdout)
  return Array.isArray(parsed) ? parsed as Bead[] : [parsed as Bead]
}

async function branchOf(run: Run, cwd: string, ws: string[]): Promise<string> {
  const head = flagValue(ws, '-H', '--head')
  if (head !== null) return head
  const r = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return r.stdout.trim()
}

function createCommand(title: string, branch: string): string {
  const prefix = branch.includes('/') ? branch.split('/')[0] ?? '' : ''
  const label = AREA.has(prefix) ? ` -l ${prefix}` : ''
  const safe = title.replace(/["\\$`]/g, '\\$&')
  return `bd create "${safe}" -t ${TYPE[prefix] ?? 'task'}${label} --silent`
}

async function gate(command: string, cwd: string, deps: Deps): Promise<string | null> {
  const ws = words(command.slice(createAt(command)))
  const body = messageFromCommand(command, cwd, (p) => deps.read(isAbsolute(p) ? p : join(cwd, p)))?.text ?? ''
  const cited = BEAD_LINE.exec(body)?.[1]
  if (cited !== undefined) {
    const found = await beads(deps.run, cwd, ['show', cited])
    const bead = found?.[0]
    if (bead === undefined) return `${cited} does not exist. Cite the bead this work came from, or create one.`
    if (bead.status === 'closed') return `${cited} is closed. Cite the open bead of this work, or create one.`
    return null
  }
  const branch = await branchOf(deps.run, cwd, ws)
  const open = await beads(deps.run, cwd, ['list', '--status', 'in_progress'])
  if (open === null) return 'bd list failed; cannot tell which bead this PR belongs to.'
  const mine = open.filter((b) => b.metadata?.branch === branch)
  if (mine.length > 0) {
    const names = mine.map((b) => `${b.id} (${b.title})`).join(', ')
    return `The work on ${branch} is tracked by ${names}. Add \`Bead: ${
      mine[0]?.id
    }\` to the PR body; do not create a new bead.`
  }
  const title = flagValue(ws, '-t', '--title') ?? 'Describe the work'
  const lines = [`No bead is claimed for ${branch}, and the PR body has no \`Bead: <id>\` line.`]
  if (open.length > 0) {
    lines.push(
      `If this work came from one of these beads in progress, cite it instead of creating one: ${
        open.map((b) => `${b.id} (${b.title})`).join(', ')
      }.`,
    )
  }
  lines.push(
    'If it came from an existing open bead, claim that one. Only if no bead covers the work, create it:',
    `  id=$(${createCommand(title, branch)})`,
    `Then: bd update "$id" --claim --set-metadata branch=${branch}; add \`Bead: <id>\` to the PR body and retry.`,
  )
  return lines.join('\n')
}

async function link(command: string, stdout: string, cwd: string, deps: Deps): Promise<string | null> {
  const url = PR_URL.exec(stdout)
  const body = messageFromCommand(command, cwd, (p) => deps.read(isAbsolute(p) ? p : join(cwd, p)))?.text ?? ''
  const cited = BEAD_LINE.exec(body)?.[1]
  if (url === null || cited === undefined) return null
  const n = url[1] ?? ''
  const branch = await branchOf(deps.run, cwd, words(command.slice(createAt(command))))
  const r = await deps.run('bd', [
    'update',
    cited,
    '--external-ref',
    `gh-${n}`,
    '--add-label',
    'pr',
    '--set-metadata',
    `pr=${n}`,
    '--set-metadata',
    `url=${url[0]}`,
    '--set-metadata',
    `branch=${branch}`,
  ], cwd)
  return r.code === 0 ? `bead-guard: ${cited} linked to PR #${n}.` : `bead-guard: could not link ${cited} to PR #${n}.`
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export async function runHook(payload: unknown, deps: Deps): Promise<string | null> {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as {
    hook_event_name?: unknown
    tool_name?: unknown
    tool_input?: unknown
    tool_response?: unknown
    cwd?: unknown
  }
  const input = (typeof p.tool_input === 'object' && p.tool_input !== null ? p.tool_input : {}) as Record<
    string,
    unknown
  >
  const command = str(input.command)
  if (p.tool_name !== 'Bash' || command === null || createAt(command) === -1) return null
  const cwd = str(p.cwd) ?? '.'

  if (p.hook_event_name === 'PreToolUse') {
    let reason: string | null
    try {
      reason = await gate(command, cwd, deps)
    } catch (e) {
      reason = `bead-guard could not check the bead: ${e instanceof Error ? e.message : String(e)}`
    }
    if (reason === null) return null
    return JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    })
  }

  if (p.hook_event_name === 'PostToolUse') {
    const response = (typeof p.tool_response === 'object' && p.tool_response !== null ? p.tool_response : {}) as Record<
      string,
      unknown
    >
    const note = await link(command, str(response.stdout) ?? '', cwd, deps).catch(() => null)
    if (note === null) return null
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: note } })
  }
  return null
}

const run: Run = async (cmd, args, cwd) => {
  const out = await new Deno.Command(cmd, { args, cwd, stdout: 'piped', stderr: 'null' }).output()
  return { code: out.code, stdout: new TextDecoder().decode(out.stdout) }
}

function readOrNull(path: string): string | null {
  try {
    return Deno.readTextFileSync(path)
  } catch {
    return null
  }
}

if (import.meta.main) {
  // Read the payload first: exiting before Claude Code has written it would break its pipe.
  const raw = await new Response(Deno.stdin.readable).text()
  let payload: unknown = null
  try {
    payload = JSON.parse(raw)
  } catch {
    Deno.exit(0)
  }
  const out = await runHook(payload, { run, read: readOrNull })
  if (out !== null) console.log(out)
  Deno.exit(0)
}
