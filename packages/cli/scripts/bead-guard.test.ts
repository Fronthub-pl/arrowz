import { assertEquals, assertStringIncludes } from '@std/assert'
import { type Deps, type Run, runHook } from './bead-guard.ts'

type Bead = { id: string; title: string; status: string; metadata?: Record<string, string> }

function stubBd(beads: Bead[], branch = 'lab/thing') {
  const calls: string[][] = []
  const run: Run = (cmd, args) => {
    calls.push([cmd, ...args])
    if (cmd === 'git') return Promise.resolve({ code: 0, stdout: `${branch}\n` })
    if (args[0] === 'show') {
      const hit = beads.filter((b) => b.id === args[1])
      return Promise.resolve(
        hit.length === 0 ? { code: 1, stdout: '{"error":"no issues found"}' } : {
          code: 0,
          stdout: JSON.stringify(hit),
        },
      )
    }
    if (args[0] === 'list') {
      return Promise.resolve({ code: 0, stdout: JSON.stringify(beads.filter((b) => b.status === 'in_progress')) })
    }
    return Promise.resolve({ code: 0, stdout: '' })
  }
  return { calls, run }
}

const files: Record<string, string> = {}
const deps = (run: Run): Deps => ({ run, read: (p) => files[p] ?? null })

const pre = (command: string) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  cwd: '/repo',
  tool_input: { command },
})
const post = (command: string, stdout: string) => ({
  ...pre(command),
  hook_event_name: 'PostToolUse',
  tool_response: { stdout },
})
const decision = (out: string | null) => out === null ? null : JSON.parse(out).hookSpecificOutput

const claimed: Bead = { id: 'arrowz-abc', title: 'Lab thing', status: 'in_progress', metadata: { branch: 'lab/thing' } }

Deno.test('hook: commands other than gh pr create pass without asking bd', async () => {
  const { calls, run } = stubBd([claimed])
  for (const c of ['gh pr view 3', 'gh pr edit 3 --body "x"', 'git commit -m "gh pr create"']) {
    assertEquals(await runHook(pre(c), deps(run)), null)
  }
  assertEquals(calls, [])
})

Deno.test('hook: gh pr create after && is still gated', async () => {
  const { run } = stubBd([claimed])
  const d = decision(await runHook(pre('cd /repo && gh pr create -t T -b "Body"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
})

Deno.test('hook: a PR citing an open bead goes through', async () => {
  const { run } = stubBd([claimed])
  assertEquals(await runHook(pre('gh pr create --title "T" --body "Stuff.\n\nBead: `arrowz-abc`"'), deps(run)), null)
})

Deno.test('hook: the cited bead is read from a heredoc on stdin', async () => {
  const { run } = stubBd([claimed])
  const command = "gh pr create --title T --body-file - <<'EOF'\n## Summary\n\nBead: arrowz-abc\nEOF"
  assertEquals(await runHook(pre(command), deps(run)), null)
})

Deno.test('hook: the cited bead is read from a body file relative to cwd', async () => {
  files['/repo/body.md'] = 'Body\n\nBead: arrowz-abc\n'
  const { run } = stubBd([claimed])
  assertEquals(await runHook(pre('gh pr create -t T -F body.md'), deps(run)), null)
})

Deno.test('hook: a cited bead that does not exist is denied', async () => {
  const { run } = stubBd([claimed])
  const d = decision(await runHook(pre('gh pr create -t T -b "Bead: arrowz-zzz"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
  assertStringIncludes(d.permissionDecisionReason, 'arrowz-zzz does not exist')
})

Deno.test('hook: a cited bead that is already closed is denied', async () => {
  const { run } = stubBd([{ ...claimed, status: 'closed' }])
  const d = decision(await runHook(pre('gh pr create -t T -b "Bead: arrowz-abc"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
  assertStringIncludes(d.permissionDecisionReason, 'arrowz-abc is closed')
})

Deno.test('hook: without a Bead line, the bead claimed for this branch is named, not a new one', async () => {
  const { run } = stubBd([claimed])
  const d = decision(await runHook(pre('gh pr create -t "Lab thing" -b "Body"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
  assertStringIncludes(d.permissionDecisionReason, 'Add `Bead: arrowz-abc`')
  assertEquals(d.permissionDecisionReason.includes('bd create'), false)
})

Deno.test('hook: --head names the branch instead of the checkout', async () => {
  const { calls, run } = stubBd([{ ...claimed, metadata: { branch: 'engine/other' } }])
  const d = decision(await runHook(pre('gh pr create -H engine/other -t T -b "Body"'), deps(run)))
  assertStringIncludes(d.permissionDecisionReason, 'Add `Bead: arrowz-abc`')
  assertEquals(calls.some((c) => c[0] === 'git'), false)
})

Deno.test('hook: with no bead for the branch, it prints the create command typed from the branch', async () => {
  const { run } = stubBd([], 'fix/stuck-heads')
  const d = decision(await runHook(pre('gh pr create --title "Engine: unstick heads" --body "Body"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
  assertStringIncludes(
    d.permissionDecisionReason,
    `bd create "Engine: unstick heads" -t bug --silent`,
  )
  assertStringIncludes(d.permissionDecisionReason, '--claim --set-metadata branch=fix/stuck-heads')
})

Deno.test('hook: beads in progress on other branches are offered before creating one', async () => {
  const { run } = stubBd([{ ...claimed, id: 'arrowz-xyz', metadata: { branch: 'docs/a' } }], 'lab/thing')
  const d = decision(await runHook(pre('gh pr create -t T -b "Body"'), deps(run)))
  assertStringIncludes(d.permissionDecisionReason, 'arrowz-xyz')
  assertStringIncludes(d.permissionDecisionReason, 'bd create "T" -t task -l lab --silent')
})

Deno.test('hook: a bd that cannot run denies instead of letting the PR through', async () => {
  const run: Run = () => Promise.reject(new Error('bd: not found'))
  const d = decision(await runHook(pre('gh pr create -t T -b "Bead: arrowz-abc"'), deps(run)))
  assertEquals(d.permissionDecision, 'deny')
  assertStringIncludes(d.permissionDecisionReason, 'bd: not found')
})

Deno.test('hook: after gh pr create, the cited bead is linked to the PR', async () => {
  const { calls, run } = stubBd([claimed])
  const out = await runHook(
    post('gh pr create -t T -b "Bead: arrowz-abc"', 'https://github.com/Fronthub-pl/arrowz/pull/139\n'),
    deps(run),
  )
  assertEquals(calls.at(-1), [
    'bd',
    'update',
    'arrowz-abc',
    '--external-ref',
    'gh-139',
    '--add-label',
    'pr',
    '--set-metadata',
    'pr=139',
    '--set-metadata',
    'url=https://github.com/Fronthub-pl/arrowz/pull/139',
    '--set-metadata',
    'branch=lab/thing',
  ])
  assertStringIncludes(decision(out).additionalContext, 'arrowz-abc linked to PR #139')
})

Deno.test('hook: after a failed gh pr create nothing is linked', async () => {
  const { calls, run } = stubBd([claimed])
  assertEquals(await runHook(post('gh pr create -t T -b "Bead: arrowz-abc"', 'error: no commits\n'), deps(run)), null)
  assertEquals(calls, [])
})
