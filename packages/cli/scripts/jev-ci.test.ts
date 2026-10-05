import { assertEquals, assertStringIncludes } from '@std/assert'
import {
  addedLines,
  annotation,
  commitsOf,
  type Finding,
  planOf,
  prEventOf,
  runCi,
  summaryOf,
  touching,
} from './jev-ci.ts'
import type { Answers, Judge } from './jev-client.ts'
import { commentsOf } from './jev-guard.ts'

function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    const s = state as Record<string, unknown>
    calls.push(s)
    return Promise.resolve(answer(s))
  }
  return { judge, calls }
}

const quiet = { violates: 0.1, history: 0.1, spec_ref: 0.1, not_english: 0.1 }

Deno.test('prEventOf reads the action, the text and both ends of a pull_request event', () => {
  const event = {
    action: 'synchronize',
    pull_request: { title: 'Add x', body: null, base: { sha: 'b1' }, head: { sha: 'h1' } },
  }
  assertEquals(prEventOf(event), { action: 'synchronize', title: 'Add x', body: '', base: 'b1', head: 'h1' })
  assertEquals(prEventOf({ action: 'opened' }), null)
  assertEquals(prEventOf('nope'), null)
})

Deno.test('planOf checks only the PR text when the event is an edit of it', () => {
  assertEquals(planOf('edited'), { comments: false, commits: false, pr: true })
  for (const action of ['opened', 'synchronize', 'reopened']) {
    assertEquals(planOf(action), { comments: true, commits: true, pr: true }, action)
  }
})

Deno.test('addedLines takes the new side of each hunk, in scope only', () => {
  const diff = [
    'diff --git a/packages/cli/a.ts b/packages/cli/a.ts',
    '--- a/packages/cli/a.ts',
    '+++ b/packages/cli/a.ts',
    '@@ -3,0 +4,2 @@ const x',
    '+// one',
    '+// two',
    '@@ -10 +12 @@',
    '-old',
    '+new',
    '@@ -20,3 +23,0 @@',
    '-gone',
    'diff --git a/apps/lab/src/new.tsx b/apps/lab/src/new.tsx',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/apps/lab/src/new.tsx',
    '@@ -0,0 +1,3 @@',
    '+a',
    'diff --git a/packages/cli/dead.ts b/packages/cli/dead.ts',
    '--- a/packages/cli/dead.ts',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    'diff --git a/docs/x.md b/docs/x.md',
    '+++ b/docs/x.md',
    '@@ -1 +1 @@',
  ].join('\n')
  assertEquals(
    addedLines(diff),
    new Map([
      ['packages/cli/a.ts', new Set([4, 5, 12])],
      ['apps/lab/src/new.tsx', new Set([1, 2, 3])],
    ]),
  )
})

Deno.test('touching keeps a comment when any of its lines was added', () => {
  const src = '// a\n// b\nconst x = 1\n// c\nconst y = 2 // tail\n'
  const all = commentsOf(src, false)
  assertEquals(touching(all, new Set([2])).map((c) => c.line), [1])
  assertEquals(touching(all, new Set([5])).map((c) => c.line), [5])
  assertEquals(touching(all, new Set([3])), [])
})

Deno.test('commitsOf splits a git log into hash and message', () => {
  const log = 'aaaaaaa1\x1fFirst line\n\nbody\n\x1e\nbbbbbbb2\x1fSecond\n\x1e\n'
  assertEquals(commitsOf(log), [
    { sha: 'aaaaaaa1', message: 'First line\n\nbody' },
    { sha: 'bbbbbbb2', message: 'Second' },
  ])
})

Deno.test('annotation escapes the message and the properties as workflow commands require', () => {
  const f: Finding = {
    flag: { where: 'x', question: 'violates', p: 0.912, excerpt: '50%, a:b\nnext' },
    file: 'packages/a,b.ts',
    line: 7,
  }
  assertEquals(
    annotation(f),
    '::warning file=packages/a%2Cb.ts,line=7,title=Jev%3A violates::p=0.91 50%25, a:b next',
  )
  const bare: Finding = { flag: { where: 'commit 1234567', question: 'not_english', p: 0.9, excerpt: 'Dodaj' } }
  assertEquals(annotation(bare), '::warning title=Jev%3A not_english::commit 1234567: p=0.90 Dodaj')
})

Deno.test('summaryOf says what was checked, and every flag, with table pipes escaped', () => {
  const findings: Finding[] = [
    { flag: { where: 'a.ts:3', question: 'history', p: 0.95, excerpt: 'a | b' }, file: 'a.ts', line: 3 },
  ]
  const s = summaryOf({ comments: 4, files: 2, commits: 3, pr: true, skipped: 0 }, findings)
  assertStringIncludes(s, '4 added comments in 2 files, 3 commits, the PR title and body')
  assertStringIncludes(s, '| a.ts:3 | history | 0.95 | a \\| b |')
  assertStringIncludes(summaryOf({ comments: 0, files: 0, commits: 0, pr: true, skipped: 0 }, []), 'Nothing flagged.')
})

function fakeGit(diff: string, log: string) {
  const calls: string[][] = []
  const git = (args: string[]) => {
    calls.push(args)
    return Promise.resolve(args[0] === 'diff' ? diff : log)
  }
  return { git, calls }
}

const RULE = '## Comments\nsay why'

Deno.test('runCi judges the added comments, every commit and the PR text', async () => {
  const diff = 'diff --git a/packages/cli/a.ts b/packages/cli/a.ts\n+++ b/packages/cli/a.ts\n@@ -0,0 +1,2 @@\n'
  const source = '// added\nconst a = 1\n// old\nconst b = 2\n'
  const { git } = fakeGit(diff, 'c0ffee11\x1fDodaj plik\n\x1e\n')
  const { judge, calls } = stubJudge((s) =>
    s.comment === 'added' ? { ...quiet, violates: 0.97 } : s.text === 'Dodaj plik' ? { not_english: 0.99 } : quiet
  )
  const event = { action: 'opened', title: 'Add a', body: 'Body', base: 'b', head: 'h' }
  const r = await runCi({ judge, event, git, read: () => source, rule: RULE })
  assertEquals(calls.filter((c) => 'comment' in c).map((c) => c.comment), ['added'])
  assertEquals(calls.filter((c) => 'text' in c).map((c) => c.text), ['Dodaj plik', 'Add a\n\nBody'])
  assertEquals(
    r.findings.map((f) => [f.flag.where, f.flag.question, f.file, f.line]),
    [['packages/cli/a.ts:1', 'violates', 'packages/cli/a.ts', 1], [
      'commit c0ffee1',
      'not_english',
      undefined,
      undefined,
    ]],
  )
  assertEquals(r.checked, { comments: 1, files: 1, commits: 1, pr: true, skipped: 0 })
})

Deno.test('runCi on an edit of the PR text asks git nothing and judges only that text', async () => {
  const { git, calls: gitCalls } = fakeGit('', '')
  const { judge, calls } = stubJudge(() => quiet)
  const event = { action: 'edited', title: 'T', body: '', base: 'b', head: 'h' }
  const r = await runCi({ judge, event, git, read: () => null, rule: RULE })
  assertEquals(gitCalls, [])
  assertEquals(calls.map((c) => c.text), ['T'])
  assertEquals(r.findings, [])
})

Deno.test('runCi flags an attribution trailer in the PR body without Jev', async () => {
  const { git } = fakeGit('', '')
  const { judge } = stubJudge(() => null)
  const event = { action: 'edited', title: 'T', body: 'Text\n\nCo-Authored-By: someone', base: 'b', head: 'h' }
  const r = await runCi({ judge, event, git, read: () => null, rule: RULE })
  assertEquals(r.findings.map((f) => [f.flag.where, f.flag.question]), [['PR body', 'attribution']])
})
