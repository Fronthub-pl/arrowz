// What a release run decides: which versions it stages, which tags it creates
// and where, and that the goldens of the consumer smoke are the engine's own.
import { assert, assertEquals, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { defaultParams, fingerprint, generate, layoutHash } from './mod.ts'
import {
  changedSince,
  commitOf,
  manifestOf,
  type Pkg,
  planOf,
  refusalsOf,
  releaseCommit,
  type Seen,
  seenOnNpm,
  tagOf,
  tagsDue,
} from './scripts/release.ts'

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
  // npm 12 wraps the version in an array.
  assertEquals(seenOnNpm(0, '[\n  "0.1.0"\n]\n', '0.1.0'), 'published')
})

Deno.test('npm says a version or a whole package is missing with E404', () => {
  assertEquals(seenOnNpm(1, '{\n  "error": { "code": "E404", "summary": "Not Found" }\n}\n', '0.1.0'), 'absent')
})

Deno.test('anything but a clear answer from npm stops the run', () => {
  // Reading a network failure as "not published" would stage a version that is already live.
  assertThrows(() => seenOnNpm(1, '{"error":{"code":"E500"}}', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(1, 'npm error network timeout', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(1, '', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '"0.1.1"', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '["0.1.1"]', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '["0.1.0","0.1.1"]', '0.1.0'), Error, 'did not say')
  assertThrows(() => seenOnNpm(0, '[]', '0.1.0'), Error, 'did not say')
})

Deno.test('a manifest without a name or a version stops the run', () => {
  assertEquals(manifestOf('packages/x', '{"name":"n","version":"1.0.0"}'), {
    dir: 'packages/x',
    name: 'n',
    version: '1.0.0',
  })
  assertThrows(() => manifestOf('packages/x', '{"name":"n"}'), Error, 'packages/x/package.json')
  assertThrows(() => manifestOf('packages/x', '{"name":"n","version":""}'), Error, 'packages/x/package.json')
  assertThrows(() => manifestOf('packages/x', '{"version":"1.0.0"}'), Error, 'packages/x/package.json')
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
  // Bound to the scratch directory, so a GIT_DIR or GIT_INDEX_FILE of the caller (git sets them for hooks) cannot redirect a commit.
  const env = { GIT_DIR: `${cwd}/.git`, GIT_WORK_TREE: cwd, GIT_INDEX_FILE: `${cwd}/.git/index` }
  const child = new Deno.Command('git', {
    args: [...identity, ...args],
    cwd,
    env,
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

/** Commits one file through the index alone: no file is written, so the test needs no write access. */
async function commitFile(repo: string, path: string, content: string, note: string): Promise<string> {
  const blob = await scratch(repo, ['hash-object', '-w', '--stdin'], content)
  await scratch(repo, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`])
  await scratch(repo, ['commit', '-q', '-m', note])
  return await scratch(repo, ['rev-parse', 'HEAD'])
}

function commitManifest(repo: string, version: string, note: string): Promise<string> {
  const manifest = JSON.stringify({ name: '@fronthub/arrowz-engine', version, note })
  return commitFile(repo, 'packages/engine/package.json', manifest, note)
}

/** A new scratch directory; stops the test at once when there is none, so no command can run in the current one. */
function scratchDir(): string {
  const made = new Deno.Command('mktemp', { args: ['-d'], stdout: 'piped' }).outputSync()
  const dir = new TextDecoder().decode(made.stdout).trim()
  if (!made.success || dir === '') throw new Error('mktemp made no scratch directory')
  return dir
}

const removeDir = (dir: string) => new Deno.Command('rm', { args: ['-rf', dir] }).outputSync()

const engine = { dir: 'packages/engine', name: '@fronthub/arrowz-engine', version: '0.2.0' }

Deno.test('in a repository the tag lands on the merge that brought the version to main', async () => {
  const repo = scratchDir()
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    const before = await commitManifest(repo, '0.1.0', 'first release')
    // The version pull request: its commit, then the merge of it into main.
    const inPullRequest = await commitManifest(repo, '0.2.0', 'version packages')
    const tree = await scratch(repo, ['rev-parse', `${inPullRequest}^{tree}`])
    const merge = await scratch(repo, ['commit-tree', tree, '-p', before, '-p', inPullRequest, '-m', 'merge'])
    await scratch(repo, ['update-ref', 'refs/heads/main', merge])
    await commitManifest(repo, '0.2.0', 'a new keyword')

    assertEquals(commitOf(engine, repo), merge)
    assertThrows(() => commitOf({ ...engine, version: '9.9.9' }, repo), Error, 'no commit')
  } finally {
    removeDir(repo)
  }
})

Deno.test('a shallow clone cannot say which commit set the version', async () => {
  const full = scratchDir()
  const shallow = scratchDir()
  try {
    await scratch(full, ['init', '-q', '-b', 'main'])
    await commitManifest(full, '0.1.0', 'first release')
    await commitManifest(full, '0.2.0', 'version packages')
    await scratch(shallow, ['init', '-q', '-b', 'main'])
    await scratch(shallow, ['fetch', '-q', '--depth', '1', `file://${full}`, 'main'])
    await scratch(shallow, ['update-ref', 'refs/heads/main', 'FETCH_HEAD'])
    assertThrows(() => commitOf(engine, shallow), Error, 'shallow')
  } finally {
    removeDir(full)
    removeDir(shallow)
  }
})

Deno.test('what changed since the version commit is the package files that reach the tarball', async () => {
  const repo = scratchDir()
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await commitManifest(repo, '0.2.0', 'version packages')
    assertEquals(changedSince(engine, repo), [])

    await commitFile(repo, 'packages/cli/carve.ts', 'other package', 'cli change')
    await commitFile(repo, 'packages/engine/scripts/release.ts', 'script', 'script change')
    await commitFile(repo, 'packages/engine/x.test.ts', 'test', 'test change')
    await commitFile(repo, 'packages/engine/sub/y.test.tsx', 'test', 'nested test change')
    assertEquals(changedSince(engine, repo), [])

    await commitFile(repo, 'packages/engine/engine.ts', 'source', 'engine change')
    assertEquals(changedSince(engine, repo), ['packages/engine/engine.ts'])
  } finally {
    removeDir(repo)
  }
})

const here = dirname(fromFileUrl(import.meta.url))

Deno.test('a package whose files changed since its version commit is refused, one line each', () => {
  const changed = (p: Pkg) => p === ENGINE ? ['packages/engine/engine.ts', 'packages/engine/look.ts'] : []
  assertEquals(refusalsOf([ENGINE, CLI], changed, () => 'abcdef0123456789'), [
    'refused @fronthub/arrowz-engine@0.1.1: packages/engine/engine.ts, packages/engine/look.ts changed since abcdef0 set the version',
  ])
  assertEquals(refusalsOf([ENGINE, CLI], () => [], () => 'abcdef0123456789'), [])
})

Deno.test('the commit of a package that did not change is not looked up', () => {
  const never = () => {
    throw new Error('no version commit here')
  }
  assertEquals(refusalsOf([CLI], () => [], never), [])
})

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

const workflow = (): string => Deno.readTextFileSync(join(here, '..', '..', '.github', 'workflows', 'release.yml'))

/** The text of one job: from its key to the next key at the same depth. */
function job(name: string): string {
  const text = workflow()
  const from = text.indexOf(`\n  ${name}:\n`)
  assert(from >= 0, `release.yml has no job ${name}`)
  const next = text.slice(from + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? text.slice(from) : text.slice(from, from + 1 + next)
}

Deno.test('only the stage job can ask npm for an identity, and only in the npm environment', () => {
  assertEquals(workflow().match(/id-token: write/g)?.length, 1)
  assert(job('stage').includes('id-token: write'))
  assert(job('stage').includes('environment: npm'))
  assert(workflow().includes('\npermissions: {}\n'), 'a job that names no permission must get none')
})

Deno.test('the stage job runs nothing from the repository and installs nothing', () => {
  for (const word of ['checkout', 'pnpm', 'deno', 'npm install', 'npm i ', 'npm ci', 'npx']) {
    assert(!job('stage').includes(word), `the stage job mentions ${word}`)
  }
  assert(/node-version: 24\.\d+\.\d+\n/.test(job('stage')), 'Node in the stage job is an exact version')
})

Deno.test('a pull request never stages and never tags', () => {
  for (const name of ['stage', 'tag-published']) {
    assert(job(name).includes("if: github.event_name != 'pull_request'"), name)
  }
})

Deno.test('the stage job tries every tarball, the engine first', () => {
  assert(job('stage').includes('for name in engine board cli; do'))
  // A re-run after a partial failure must still reach the packages that were not staged.
  assert(!/\bset -e\b|\|\| exit|&& exit/.test(job('stage')), 'the loop must not stop at the first refusal')
  assert(job('stage').includes('exit "$failed"'))
})

Deno.test('every action is pinned to a commit, nothing is cached and no token stays on disk', () => {
  const uses = workflow().split('\n').filter((line) => line.includes('uses:'))
  assert(uses.length > 0)
  for (const line of uses) assert(/uses: [\w./-]+@[0-9a-f]{40} # v\d/.test(line), line)
  assert(!workflow().includes('actions/cache'))
  assertEquals(
    workflow().match(/setup-node@/g)?.length,
    workflow().match(/package-manager-cache: false/g)?.length,
    'every setup-node turns its cache off',
  )
  for (const name of ['plan', 'build', 'smoke']) {
    assert(job(name).includes('persist-credentials: false'), `${name} keeps the checkout token`)
  }
})

Deno.test('the jobs that read the history fetch all of it', () => {
  // release.ts refuses a shallow clone: a grafted tip would pass for the commit that set a version.
  for (const name of ['plan', 'tag-published']) {
    assert(job(name).includes('fetch-depth: 0'), name)
    assert(!job(name).includes('filter:'), `${name} fetches a partial clone`)
  }
})
