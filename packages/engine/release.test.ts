// What a release run decides: which versions it stages, which tags it creates
// and where, and that the goldens of the consumer smoke are the engine's own.
import { assertEquals, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate, layoutHash } from './mod.ts'
import { commitOf, type Pkg, planOf, releaseCommit, type Seen, seenOnNpm, tagOf, tagsDue } from './scripts/release.ts'

const pkg = (short: string, version: string): Pkg => ({
  dir: `packages/${short}`,
  name: `@fronthub/arrowz-${short}`,
  version,
})
const ENGINE = pkg('engine', '0.1.1')
const BOARD = pkg('board', '0.1.0')
const CLI = pkg('cli', '0.2.0')
const live = (...published: Pkg[]) => (p: Pkg): Seen => published.includes(p) ? 'published' : 'absent'

Deno.test('npm says a version is published by printing it', () => {
  assertEquals(seenOnNpm(0, '"0.1.0"\n', '0.1.0'), 'published')
})

Deno.test('npm says a version or a whole package is missing with E404', () => {
  assertEquals(seenOnNpm(1, '{\n  "error": { "code": "E404", "summary": "Not Found" }\n}\n', '0.1.0'), 'absent')
  assertEquals(seenOnNpm(0, '', '0.1.0'), 'absent')
})

Deno.test('anything but a clear answer from npm stops the run', () => {
  // Reading a network failure as "not published" would stage a version that is already live.
  assertThrows(() => seenOnNpm(1, '{"error":{"code":"E500"}}', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(1, 'npm error network timeout', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(1, '', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '"0.1.1"', '0.1.0'), Error, 'did not say')
})

Deno.test('a run releases the versions npm does not have, dependencies first', () => {
  assertEquals(planOf([ENGINE, BOARD, CLI], live(BOARD)), [ENGINE, CLI])
  assertEquals(planOf([ENGINE, BOARD, CLI], live(ENGINE, BOARD, CLI)), [])
})

Deno.test('0.0.0 is never released', () => {
  // The manifests carry it before the first version PR, and npm has no such package then.
  const before = [pkg('engine', '0.0.0'), pkg('board', '0.0.0'), pkg('cli', '0.0.0')]
  assertEquals(planOf(before, live()), [])
})

Deno.test('a tag is due for a version that is live and has none', () => {
  const tags = new Set([tagOf(BOARD)])
  assertEquals(tagOf(ENGINE), '@fronthub/arrowz-engine@0.1.1')
  assertEquals(tagsDue([ENGINE, BOARD, CLI], live(ENGINE, BOARD), tags), [ENGINE])
})

Deno.test('the placeholder 0.0.0 never gets a tag', () => {
  // A tag cannot be moved or deleted, so one for the placeholder would stay for good.
  const placeholder = pkg('engine', '0.0.0')
  assertEquals(tagsDue([placeholder], live(placeholder), new Set()), [])
})

Deno.test('the tag goes on the commit of main that set the version', () => {
  const history = [
    { sha: 'later', version: '0.1.1' },
    { sha: 'version-pr', version: '0.1.1' },
    { sha: 'before', version: '0.1.0' },
    { sha: 'long-ago', version: '0.1.1' },
  ]
  assertEquals(releaseCommit(history, '0.1.1'), 'version-pr')
  assertEquals(releaseCommit(history, '0.3.0'), undefined)
  assertEquals(releaseCommit([], '0.1.1'), undefined)
})

/** Runs git in a scratch repository, with an identity of its own and without the caller's signing setup. */
async function scratch(cwd: string, args: string[], stdin = ''): Promise<string> {
  const identity = ['-c', 'user.name=t', '-c', 'user.email=t@example.test', '-c', 'commit.gpgsign=false']
  const child = new Deno.Command('git', {
    args: [...identity, ...args],
    cwd,
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  }).spawn()
  const writer = child.stdin.getWriter()
  await writer.write(new TextEncoder().encode(stdin))
  await writer.close()
  const { success, stdout, stderr } = await child.output()
  if (!success) throw new Error(`git ${args.join(' ')}: ${new TextDecoder().decode(stderr)}`)
  return new TextDecoder().decode(stdout).trim()
}

/** Commits the engine manifest at a version through the index alone: no file is written, so the test needs no write access. */
async function commitManifest(repo: string, version: string, note: string): Promise<string> {
  const manifest = JSON.stringify({ name: '@fronthub/arrowz-engine', version, note })
  const blob = await scratch(repo, ['hash-object', '-w', '--stdin'], manifest)
  await scratch(repo, ['update-index', '--add', '--cacheinfo', `100644,${blob},packages/engine/package.json`])
  await scratch(repo, ['commit', '-q', '-m', note])
  return await scratch(repo, ['rev-parse', 'HEAD'])
}

Deno.test('in a repository the tag lands on the merge that brought the version to main', async () => {
  const made = new Deno.Command('mktemp', { args: ['-d'], stdout: 'piped' }).outputSync()
  const repo = new TextDecoder().decode(made.stdout).trim()
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    const before = await commitManifest(repo, '0.1.0', 'first release')
    // The version pull request: its commit, then the merge of it into main.
    const inPullRequest = await commitManifest(repo, '0.2.0', 'version packages')
    const tree = await scratch(repo, ['rev-parse', `${inPullRequest}^{tree}`])
    const merge = await scratch(repo, ['commit-tree', tree, '-p', before, '-p', inPullRequest, '-m', 'merge'])
    await scratch(repo, ['update-ref', 'refs/heads/main', merge])
    const later = await commitManifest(repo, '0.2.0', 'a new keyword')

    const engine = { dir: 'packages/engine', name: '@fronthub/arrowz-engine', version: '0.2.0' }
    assertEquals(commitOf(engine, repo), merge)
    assertEquals([inPullRequest, later].includes(commitOf(engine, repo)), false)
    assertThrows(() => commitOf({ ...engine, version: '9.9.9' }, repo), Error, 'no commit')
  } finally {
    new Deno.Command('rm', { args: ['-rf', repo] }).outputSync()
  }
})

const here = dirname(fromFileUrl(import.meta.url))

Deno.test('the goldens of the consumer smoke are what the engine lays today', async () => {
  // A drift is caught here, on the pull request that causes it, not on release day.
  const golden = JSON.parse(Deno.readTextFileSync(join(here, 'scripts', 'consumer-golden.json'))) as {
    fingerprint: string
    pieces: number
    layout: string
  }
  const { board } = generate({ ...defaultParams(), W: 40, H: 40, seed: 1 })
  assertEquals([fingerprint(board), board.pieces.length], [golden.fingerprint, golden.pieces])
  // 7 is the seed `arrowz carve` uses when the command line names none.
  assertEquals(await layoutHash(generate({ ...defaultParams(), W: 25, H: 25, seed: 7 }).board), golden.layout)
})
