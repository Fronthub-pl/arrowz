import { assertEquals, assertStringIncludes } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import type { Answers, Judge } from './jev-client.ts'
import {
  auditSkips,
  autoMemoryFile,
  type Deps,
  findingsReport,
  longIndexLines,
  manual,
  MAX_INDEX_LINE,
  MAX_MEMORY_REQUESTS,
  MEMORY_AT,
  memoryFlags,
  memoryReport,
  notesOf,
  observations,
  openPrClaims,
  paragraphs,
  presentSegments,
  projectMemoryDir,
  runMemoryHook,
  sessionStart,
  staleState,
} from './memory-guard.ts'

Deno.test('observations: one item per `- [category]` line, continuation lines joined, fences skipped', () => {
  const note = [
    '# Title',
    '## Observations',
    '- [decision] Keep the guard advisory',
    '  because hooks must never block #jev',
    '- [fact] second item',
    '```',
    '- [inside] a fence is not an item',
    '```',
    '- [last] third item',
    '## Relations',
    '- part_of [[Other]]',
  ].join('\n')
  assertEquals(observations(note), [
    '- [decision] Keep the guard advisory because hooks must never block #jev',
    '- [fact] second item',
    '- [last] third item',
  ])
  assertEquals(observations('- [a] item\n```\ncode\n```\nafter the fence'), ['- [a] item'])
})

Deno.test('observations: a link bullet, a checkbox or a wiki link is not an item', () => {
  const note = ['- [T](/x.md)', '- [ ] todo', '- [x] done', '- [[Other note]]', '- [lesson] kept'].join('\n')
  assertEquals(observations(note), ['- [lesson] kept'])
})

Deno.test('paragraphs: body paragraphs of 80+ characters, frontmatter, headings and fences skipped', () => {
  const long = 'x'.repeat(80)
  const file = [
    '---',
    'name: n',
    `description: ${long}`,
    '---',
    '',
    '# Heading',
    long,
    '',
    'short',
    '',
    '```',
    long,
    '```',
    '',
    `${long.slice(0, 40)}`,
    `${long.slice(0, 40)}`,
  ].join('\n')
  assertEquals(paragraphs(file), [long, `${long.slice(0, 40)} ${long.slice(0, 40)}`])
})

Deno.test('longIndexLines: counts characters, not bytes, and only index entries', () => {
  const polish = `- [Ł](a.md) — ${'ż'.repeat(MAX_INDEX_LINE - 14)}`
  assertEquals([...polish].length, MAX_INDEX_LINE)
  assertEquals(longIndexLines(polish, (l) => `MEMORY.md:${l}`), [])
  const over = `${polish}ą`
  const prose = 'x'.repeat(200)
  assertEquals(longIndexLines(`${prose}\n${over}`, (l) => `MEMORY.md:${l}`).map((f) => f.where), ['MEMORY.md:2'])
})

Deno.test('findingsReport: null when empty, capped at five unless all', () => {
  assertEquals(findingsReport('t', []), null)
  const found = Array.from({ length: 7 }, (_, i) => ({ where: `w${i}`, what: 'bad' }))
  const short = findingsReport('t', found) ?? ''
  assertStringIncludes(short, 'memory: t:\n- w0  bad')
  assertStringIncludes(short, '(2 more not shown)')
  assertStringIncludes(findingsReport('t', found, true) ?? '', '- w6  bad')
})

function stubJudge(answer: (state: Record<string, unknown>) => Answers | null) {
  const calls: Record<string, unknown>[] = []
  const judge: Judge = (state) => {
    calls.push(state as Record<string, unknown>)
    return Promise.resolve(answer(state as Record<string, unknown>))
  }
  return { judge, calls }
}

Deno.test('memoryFlags: flags an item strictly above MEMORY_AT and sends only the item', async () => {
  const { judge, calls } = stubJudge((s) => ({ violates: s.memory_item === 'fact' ? MEMORY_AT + 0.01 : MEMORY_AT }))
  const r = await memoryFlags(judge, ['fact', 'reason'], 'x.md')
  assertEquals(r.flags.map((f) => [f.where, f.question, f.excerpt]), [['x.md', 'code_fact', 'fact']])
  assertEquals(calls, [{ memory_item: 'fact' }, { memory_item: 'reason' }])
})

Deno.test('memoryFlags: an unanswered item is not flagged, and the cap counts what was skipped', async () => {
  const { judge, calls } = stubJudge(() => null)
  const items = Array.from({ length: MAX_MEMORY_REQUESTS + 3 }, (_, i) => `item ${i}`)
  const r = await memoryFlags(judge, items, 'x.md')
  assertEquals([r.flags.length, r.skipped, calls.length], [0, 3, MAX_MEMORY_REQUESTS])
})

Deno.test('memoryFlags: no items, no request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  assertEquals((await memoryFlags(judge, [], 'x.md')).flags, [])
  assertEquals(calls.length, 0)
})

Deno.test('memoryReport: null without flags, a jev block with them and the skipped note', () => {
  assertEquals(memoryReport({ flags: [], skipped: 4 }), null)
  const out =
    memoryReport({ flags: [{ where: 'x.md', question: 'code_fact', p: 0.9, excerpt: 'fact' }], skipped: 2 }) ?? ''
  assertStringIncludes(out, '- x.md  code_fact p=0.90  fact')
  assertStringIncludes(out, '(2 further items were not checked)')
  const none = memoryReport({ flags: [{ where: 'x.md', question: 'code_fact', p: 0.9, excerpt: 'fact' }], skipped: 0 })
  assertEquals(none?.includes('further items'), false)
})

Deno.test('openPrClaims: both word orders, Polish and English; not a negation, a list or another word', () => {
  assertEquals(openPrClaims('PR #123 otwarty (worktree x)'), [123])
  assertEquals(openPrClaims('otwarty mój PR #132'), [132])
  assertEquals(openPrClaims('open PR #7 and PR #8 open'), [7, 8])
  assertEquals(openPrClaims('PR #90 (x y), `main` = `abc1234`, zero otwartych PR-ów'), [])
  assertEquals(openPrClaims('PR #90 (x), zero otwartych'), [])
  assertEquals(openPrClaims('zero otwartych PR #5'), [])
  assertEquals(openPrClaims('no open PR #4'), [])
  assertEquals(openPrClaims('PR #111, open'), [])
  assertEquals(openPrClaims('reopened PR #5'), [])
})

Deno.test('openPrClaims: a negation after the number, or an open question, is not a claim', () => {
  assertEquals(openPrClaims('PR #3 is not open'), [])
  assertEquals(openPrClaims("PR #3 isn't open"), [])
  assertEquals(openPrClaims('PR #3 is no longer open'), [])
  assertEquals(openPrClaims('PR #3 nie jest otwarty'), [])
  assertEquals(openPrClaims('PR #3 open question'), [])
  assertEquals(openPrClaims('PR #3: otwarte pytanie o kolory'), [])
  assertEquals(openPrClaims('PR #3 still open'), [3])
})

Deno.test('presentSegments: every index line and only the first clause of a description', () => {
  const note = {
    file: 'a.md',
    text: '---\nname: a\ndescription: "now: PR #9 open; 2026-09-01: PR #3 open"\n---\nbody PR #4 open',
  }
  assertEquals(presentSegments('- [A](a.md) — x\n', [note]), [
    { where: 'MEMORY.md:1', text: '- [A](a.md) — x' },
    { where: 'MEMORY.md:2', text: '' },
    { where: 'a.md description', text: 'now: PR #9 open' },
  ])
})

Deno.test('presentSegments: the first clause ends at an em dash or a sentence stop', () => {
  const desc = (d: string) => presentSegments('', [{ file: 'a.md', text: `---\ndescription: ${d}\n---\n` }])[1]?.text
  assertEquals(desc('"PR #9 open — PR #3 open"'), 'PR #9 open ')
  assertEquals(desc('"PR #9 open. PR #3 open"'), 'PR #9 open')
  assertEquals(desc('"v0.9 ships"'), 'v0.9 ships')
})

Deno.test('presentSegments: the description is read from the frontmatter, unquoted, folded blocks joined', () => {
  const desc = (text: string) => presentSegments('', [{ file: 'a.md', text }]).slice(1).map((s) => s.text)
  assertEquals(desc('---\ndescription: "PR #9 open"\n---\n'), ['PR #9 open'])
  assertEquals(desc("---\ndescription: 'PR #9 open'\n---\n"), ['PR #9 open'])
  assertEquals(desc('---\ndescription: >-\n  PR #9\n  open; old\nname: a\n---\n'), ['PR #9 open'])
  assertEquals(desc('---\nname: a\n---\ndescription: PR #4 open\n'), [])
})

Deno.test('staleState: a closed PR called open, a dead link, an untracked path', () => {
  const found = staleState({
    index: '- [A](a.md) — PR #5 open\n- [B](gone.md) — see `packages/cli/nope.ts` and `apps/lab/src`',
    notes: [],
    exists: (f) => f === 'a.md',
    openPrs: new Set([6]),
    tracked: new Set(['apps/lab/src/main.tsx']),
  })
  assertEquals(found, [
    { where: 'MEMORY.md:1', what: 'PR #5 is called open, but it is not open' },
    { where: 'MEMORY.md:2', what: 'links gone.md, which does not exist' },
    { where: 'MEMORY.md:2', what: 'names packages/cli/nope.ts, which git does not track' },
  ])
})

Deno.test('staleState: a path is checked without its :line or trailing slash, and a glob is not a path', () => {
  const found = (index: string) =>
    staleState({ index, notes: [], exists: () => true, openPrs: null, tracked: new Set(['docs/a.md', 'apps/x/y.ts']) })
  assertEquals(found('`docs/a.md:12` and `apps/x/` and `packages/*/z.ts`'), [])
  assertEquals(found('`docs/b.md:12`').map((f) => f.what), ['names docs/b.md, which git does not track'])
})

Deno.test('staleState: only a bare file name is a memory link', () => {
  const found = staleState({
    index: '- [X](docs/x.md) and [Y](https://e.x/y.md)\n- [G](gone.md)',
    notes: [],
    exists: () => false,
    openPrs: null,
    tracked: null,
  })
  assertEquals(found, [{ where: 'MEMORY.md:2', what: 'links gone.md, which does not exist' }])
})

Deno.test('auditSkips: hidden entries, the sesje folder and date-named logs', () => {
  assertEquals(['.x.md', 'sesje', '2026-09-30 log.md', 'a.md', 'x-2026-09-30.md'].map(auditSkips), [
    true,
    true,
    true,
    false,
    false,
  ])
})

Deno.test('staleState: unknown PRs or files check nothing of theirs; an empty set flags every claim', () => {
  const input = { index: '- [A](a.md) — PR #5 open, `docs/x.md`', notes: [], exists: () => true }
  assertEquals(staleState({ ...input, openPrs: null, tracked: null }), [])
  assertEquals(staleState({ ...input, openPrs: new Set<number>(), tracked: null }).map((f) => f.what), [
    'PR #5 is called open, but it is not open',
  ])
})

const HOME = '/h'
const MEM = '/h/.claude/projects/-p/memory'

function deps(
  files: Record<string, string>,
  judge: Judge,
  gh: string | null = '',
  git: string | null = '',
): Deps & { runs: string[]; calls: string[][] } {
  const runs: string[] = []
  const calls: string[][] = []
  return {
    runs,
    calls,
    judge,
    home: HOME,
    read: (p) => files[p] ?? null,
    list: (dir) => {
      const names = Object.keys(files).filter((p) => dirname(p) === dir).map((p) => p.slice(dir.length + 1))
      return names.length === 0 ? null : names
    },
    run: (cmd, args) => {
      runs.push(cmd)
      calls.push([cmd, ...args])
      const out = cmd === 'gh' ? gh : git
      return Promise.resolve(out === null ? { code: 1, stdout: '' } : { code: 0, stdout: out })
    },
  }
}
const context = (
  out: string | null,
) => (out === null ? null : JSON.parse(out).hookSpecificOutput.additionalContext as string)

Deno.test('autoMemoryFile: any project key, only files directly in memory/', () => {
  assertEquals(autoMemoryFile(HOME, `${MEM}/x.md`), { dir: MEM, file: 'x.md' })
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/-other-worktree/memory/MEMORY.md')?.file, 'MEMORY.md')
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/-p/memoryX/x.md'), null)
  assertEquals(autoMemoryFile(HOME, `${MEM}/sub/x.md`), null)
  assertEquals(autoMemoryFile(HOME, '/h/.claude/projects/../x/memory/x.md'), null)
  assertEquals(autoMemoryFile(HOME, '/h/.claude/memory/x.md'), null)
  assertEquals(autoMemoryFile(HOME, '/repo/docs/x.md'), null)
})

Deno.test('hook: Write of an auto-memory file asks Jev per paragraph and reports flags', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9 }))
  const body = `---\nname: x\n---\n\n${'fact '.repeat(20)}\n`
  const out = await runMemoryHook(
    { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: `${MEM}/x.md`, content: body } },
    deps({}, judge),
  )
  assertEquals(calls.length, 1)
  assertStringIncludes(context(out) ?? '', '- x.md  code_fact p=0.90')
  const edit = await runMemoryHook(
    {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: `${MEM}/x.md`, old_string: 'a', new_string: 'fact '.repeat(20) },
    },
    deps({}, judge),
  )
  assertEquals(calls.length, 2)
  assertStringIncludes(context(edit) ?? '', '- x.md  code_fact p=0.90')
})

Deno.test('hook: an Edit of MEMORY.md is checked by length only, no Jev request', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  const line = `- [T](t.md) — ${'x'.repeat(MAX_INDEX_LINE)}`
  const out = await runMemoryHook(
    {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: `${MEM}/MEMORY.md`, new_string: line },
    },
    deps({}, judge),
  )
  assertEquals(calls.length, 0)
  assertStringIncludes(context(out) ?? '', '- MEMORY.md (edit)  ')
})

Deno.test('hook: a Write of MEMORY.md reports over-long lines with their line number', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  const content = `- [T](t.md) — short\n- [U](u.md) — ${'x'.repeat(MAX_INDEX_LINE)}\n`
  const out = await runMemoryHook(
    { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: `${MEM}/MEMORY.md`, content } },
    deps({}, judge),
  )
  assertEquals(calls.length, 0)
  assertStringIncludes(context(out) ?? '', '- MEMORY.md:2  ')
})

Deno.test('hook: an edit with no memory item makes no request and no output', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 1 }))
  const out = await runMemoryHook(
    {
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: `${MEM}/x.md`, new_string: '## Heading\nshort' },
    },
    deps({}, judge),
  )
  assertEquals([out, calls.length], [null, 0])
})

Deno.test('hook: basic-memory notes are checked, session logs and other servers are not', async () => {
  const { judge, calls } = stubJudge(() => ({ violates: 0.9 }))
  const content = '## Observations\n- [fact] the file lives in engine.ts'
  const ask = (tool_name: string, tool_input: Record<string, unknown>) =>
    runMemoryHook({ hook_event_name: 'PostToolUse', tool_name, tool_input }, deps({}, judge))
  assertStringIncludes(
    context(await ask('mcp__memory-arrowz__write_note', { title: 'T', directory: 'wiedza', content })) ?? '',
    'note "T"',
  )
  assertEquals(await ask('mcp__memory-arrowz__write_note', { title: 'T', directory: 'sesje', content }), null)
  assertEquals(
    await ask('mcp__memory-arrowz__edit_note', { identifier: 'arrowz/sesje/x', operation: 'append', content }),
    null,
  )
  assertEquals(
    await ask('mcp__memory-arrowz__edit_note', { identifier: '2026-09-30 — log', operation: 'append', content }),
    null,
  )
  assertEquals(
    await ask('mcp__memory-arrowz__write_note', { title: '2026-09-30 — log', directory: 'wiedza', content }),
    null,
  )
  assertEquals(await ask('mcp__basic-memory__write_note', { title: 'T', directory: 'wiedza', content }), null)
  assertEquals(await ask('Write', { file_path: '/repo/docs/x.md', content }), null)
  assertEquals(calls.length, 1)
})

Deno.test('session start: reads the memory beside the transcript, one gh and one git call', async () => {
  const { judge } = stubJudge(() => null)
  const files = {
    [`${MEM}/MEMORY.md`]: '- [A](a.md) — PR #5 open\n- [G](gone.md) — x',
    [`${MEM}/a.md`]: '---\ndescription: "PR #6 open; old"\n---\n',
  }
  const d = deps(files, judge, '6\n', 'docs/x.md\n')
  const out = context(
    await runMemoryHook({
      hook_event_name: 'SessionStart',
      transcript_path: '/h/.claude/projects/-p/s.jsonl',
      cwd: '/repo',
    }, d),
  ) ?? ''
  assertStringIncludes(out, '- MEMORY.md:1  PR #5 is called open, but it is not open')
  assertStringIncludes(out, '- MEMORY.md:2  links gone.md, which does not exist')
  assertEquals(out.includes('PR #6'), false)
  assertEquals(d.runs.sort(), ['gh', 'git'])
  const git = d.calls.find((c) => c[0] === 'git') ?? []
  const gh = d.calls.find((c) => c[0] === 'gh') ?? []
  assertEquals(git.slice(1), ['ls-files', '--full-name', ':/'])
  assertEquals(gh.join(' ').includes('--limit 200'), true)
})

Deno.test('session start: gh failing skips only the PR part; zero open PRs flags every claim', async () => {
  const { judge } = stubJudge(() => null)
  const files = { [`${MEM}/MEMORY.md`]: '- [A](a.md) — PR #5 open', [`${MEM}/a.md`]: 'x' }
  assertEquals(await sessionStart(MEM, '/repo', deps(files, judge, null)), null)
  assertStringIncludes(await sessionStart(MEM, '/repo', deps(files, judge, '')) ?? '', 'PR #5 is called open')
})

Deno.test('session start: no MEMORY.md, nothing to say', async () => {
  const { judge } = stubJudge(() => null)
  assertEquals(await sessionStart(MEM, '/repo', deps({}, judge)), null)
})

Deno.test('the committed settings run memory-guard on memory writes and at session start', () => {
  const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..', '..')
  const hooks = JSON.parse(Deno.readTextFileSync(join(root, '.claude', 'settings.json'))).hooks
  type Entry = { matcher?: string; hooks: Array<{ command: string }> }
  const uses = (event: string) =>
    (hooks[event] as Entry[]).filter((e) =>
      e.hooks.some((h) => h.command.includes('memory-guard.ts') && h.command.endsWith(' hook'))
    )
  const post = uses('PostToolUse')
  assertEquals(post.length, 1)
  for (const tool of ['Edit', 'Write', 'mcp__memory-arrowz__write_note', 'mcp__memory-arrowz__edit_note']) {
    assertEquals(new RegExp(`^(?:${post[0]?.matcher})$`).test(tool), true, tool)
  }
  const start = uses('SessionStart')
  assertEquals(start.length, 1)
  assertEquals(start[0]?.matcher, '')
  const cmdPost = post[0]?.hooks[0]?.command ?? ''
  const cmdStart = start[0]?.hooks[0]?.command ?? ''
  assertStringIncludes(cmdPost, '--allow-net=api.typesafe.ai')
  assertEquals(cmdPost.includes('--allow-run') || cmdPost.includes('.claude/projects'), false)
  assertStringIncludes(cmdStart, '--allow-run=gh,git')
  assertStringIncludes(cmdStart, '--allow-read="$HOME/.claude/projects" ')
  assertEquals(cmdStart.includes('--allow-net'), false)
})

Deno.test('notesOf: Markdown notes in nested folders, skipping what auditSkips names', async () => {
  const dir = await Deno.makeTempDir()
  try {
    for (const f of ['wiedza/a.md', 'wiedza/b.txt', 'sesje/s.md', '.hidden/h.md', '2026-09-30 log.md', 'top.md']) {
      await Deno.mkdir(join(dir, dirname(f)), { recursive: true })
      await Deno.writeTextFile(join(dir, f), 'x')
    }
    const out: string[] = []
    notesOf(dir, out)
    assertEquals(out.map((p) => p.slice(dir.length + 1)).sort(), ['top.md', 'wiedza/a.md'])
  } finally {
    await Deno.remove(dir, { recursive: true })
  }
})

Deno.test('manual: audit takes the memory directory argument and fails without its MEMORY.md; unknown mode is usage', async () => {
  const dir = await Deno.makeTempDir()
  const errors: string[] = []
  const error = console.error
  console.error = (msg: string) => errors.push(msg)
  try {
    assertEquals(await manual('audit', [dir]), 1)
    assertEquals(await manual('nope', []), 2)
  } finally {
    console.error = error
    await Deno.remove(dir)
  }
  assertEquals(errors[0], `memory: no MEMORY.md in ${dir}`)
  assertStringIncludes(errors[1] ?? '', 'usage: memory-guard.ts')
})

Deno.test('projectMemoryDir: the project key replaces every character outside [A-Za-z0-9-] with a dash', () => {
  assertEquals(projectMemoryDir('/h', '/Users/t/dev/.a b'), '/h/.claude/projects/-Users-t-dev--a-b/memory')
  assertEquals(projectMemoryDir('/h', '/Users/t/dev/.a b/'), '/h/.claude/projects/-Users-t-dev--a-b/memory')
})
