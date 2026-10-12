// What a release run decides: which versions it stages, which tags it creates
// and where, that the goldens of the consumer smoke are the engine's own, and
// that the workflow file keeps the shape that makes the release safe.
import { assert, assertEquals, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { parse } from '@std/yaml'
import { defaultParams, fingerprint, generate, layoutHash } from './mod.ts'
import {
  changedSince,
  commitOf,
  depsMovedSince,
  manifestOf,
  type Pkg,
  planOf,
  planOutcome,
  pushTag,
  refusalsOf,
  type Release,
  releaseCommit,
  releasedOf,
  releasesIn,
  type Seen,
  seenOnNpm,
  tagOf,
  TAGS_COMMAND,
  tagsDue,
  tagsOutcome,
  workflowsChangedSince,
  workspaceDepsOf,
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
  // npm 12.2.0, word for word, for a version a package does not have.
  const npm12 = `{
  "error": {
    "code": "E404",
    "summary": "No match found for version 9.9.9",
    "detail": "The requested resource '@fronthub/arrowz-engine@9.9.9' could not be found or you do not have permission to access it.\\n\\nNote that you can also install from a\\ntarball, folder, http url, or git url."
  }
}
`
  assertEquals(seenOnNpm(1, npm12, '9.9.9'), 'absent')
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

const shaOf = (p: Pkg): string => p === ENGINE ? '1a2b3c4d5e6f' : p === BOARD ? '5e6f7a8b9c0d' : '9c0d1e2f3a4b'
const released = (...pkgs: Pkg[]): Release[] => pkgs.map((p) => ({ pkg: p, sha: shaOf(p) }))

Deno.test('a tag is due for a version that is live and has none, and one npm does not have waits', () => {
  const tags = new Set([tagOf(BOARD)])
  assertEquals(tagOf(ENGINE), '@fronthub/arrowz-engine@0.1.1')
  assertEquals(tagsDue(released(ENGINE, BOARD, CLI), live(ENGINE, BOARD), tags), {
    due: released(ENGINE),
    waiting: [CLI],
  })
})

Deno.test('a version that has its tag is not asked of npm again', () => {
  const never = (): Seen => {
    throw new Error('npm was asked')
  }
  assertEquals(tagsDue(released(ENGINE, BOARD), never, new Set([tagOf(ENGINE), tagOf(BOARD)])), {
    due: [],
    waiting: [],
  })
})

Deno.test('the placeholder 0.0.0 never gets a tag', () => {
  // A tag cannot be moved or deleted, so one for the placeholder would stay for good.
  const placeholder = pkg('engine', '0.0.0')
  assertEquals(tagsDue(released(placeholder), live(placeholder), new Set()), { due: [], waiting: [] })
})

Deno.test('every version since the placeholder is a release, at the oldest commit of its newest stretch', () => {
  // Newest first, as git lists it. The engine's own history has this shape below its placeholder.
  const history = [
    { sha: 'keyword', version: '0.1.2' },
    { sha: 'third', version: '0.1.2' },
    { sha: 'again', version: '0.1.1' },
    { sha: 'reverted', version: '0.1.0' },
    { sha: 'second', version: '0.1.1' },
    { sha: 'readme', version: '0.1.0' },
    { sha: 'first', version: '0.1.0' },
    { sha: 'placeholder', version: '0.0.0' },
    { sha: 'early', version: '0.1.0' },
    { sha: 'alpha', version: '1.0.0-alpha.1' },
  ]
  assertEquals(releasesIn(history), [
    { version: '0.1.2', sha: 'third' },
    { version: '0.1.1', sha: 'again' },
    { version: '0.1.0', sha: 'reverted' },
  ])
  assertEquals(releasesIn([]), [])
  assertEquals(releasesIn([{ sha: 'placeholder', version: '0.0.0' }]), [])
})

Deno.test('a commit whose manifest names no version ends the walk as the placeholder does', () => {
  const history = [
    { sha: 'second', version: '0.1.1' },
    { sha: 'first', version: '0.1.0' },
    { sha: 'unnamed', version: undefined },
    { sha: 'older', version: '0.0.9' },
  ]
  assertEquals(releasesIn(history), [{ version: '0.1.1', sha: 'second' }, { version: '0.1.0', sha: 'first' }])
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

const refusing = (...refused: Pkg[]) => (p: Pkg): void => {
  if (refused.includes(p)) throw new Error(`git push: remote rejected ${tagOf(p)}\n`)
}
const WORKFLOW = '.github/workflows/release.yml'
const explained = (p: Pkg): string =>
  `not tagged ${tagOf(p)}: ${WORKFLOW} changed since ${shaOf(p).slice(0, 7)} set the version, ` +
  "and the workflow's token cannot push a tag across a workflow change"

Deno.test('every tag is pushed at the commit of its version, and the run ends with status 0', () => {
  const pushed: string[] = []
  const push = (p: Pkg, sha: string) => void pushed.push(`${tagOf(p)} ${sha}`)
  assertEquals(tagsOutcome(released(ENGINE, BOARD), [], push, () => [], true), {
    out: ['tagged @fronthub/arrowz-engine@0.1.1 at 1a2b3c4', 'tagged @fronthub/arrowz-board@0.1.0 at 5e6f7a8'],
    err: [],
    code: 0,
  })
  assertEquals(pushed, ['@fronthub/arrowz-engine@0.1.1 1a2b3c4d5e6f', '@fronthub/arrowz-board@0.1.0 5e6f7a8b9c0d'])
})

Deno.test('a run with no tag due says so and ends with status 0', () => {
  assertEquals(tagsOutcome([], [], refusing(), () => [], true), {
    out: ['nothing to tag: no untagged version is live on npm'],
    err: [],
    code: 0,
  })
})

Deno.test('a version npm does not have is named, whether or not a tag was due, and does not change the status', () => {
  assertEquals(tagsOutcome([], [CLI], refusing(), () => [], true), {
    out: [
      'not live on npm, so not tagged: @fronthub/arrowz-cli@0.2.0',
      'nothing to tag: no untagged version is live on npm',
    ],
    err: [],
    code: 0,
  })
  assertEquals(tagsOutcome(released(ENGINE), [CLI], refusing(), () => [], true), {
    out: [
      'not live on npm, so not tagged: @fronthub/arrowz-cli@0.2.0',
      'tagged @fronthub/arrowz-engine@0.1.1 at 1a2b3c4',
    ],
    err: [],
    code: 0,
  })
})

Deno.test('on the runner a refused tag whose workflow files changed is explained, and the command is given once', () => {
  const outcome = tagsOutcome(released(ENGINE, BOARD, CLI), [], refusing(ENGINE, CLI), () => [WORKFLOW], true)
  assertEquals(outcome, {
    out: ['tagged @fronthub/arrowz-board@0.1.0 at 5e6f7a8'],
    err: [
      'error: git push: remote rejected @fronthub/arrowz-engine@0.1.1',
      explained(ENGINE),
      'error: git push: remote rejected @fronthub/arrowz-cli@0.2.0',
      explained(CLI),
      `From an up-to-date checkout of main, run: ${TAGS_COMMAND}`,
    ],
    code: 1,
  })
})

Deno.test('a refused tag whose workflow files are the same keeps the message of git and gets no advice', () => {
  assertEquals(tagsOutcome(released(ENGINE, BOARD), [], refusing(ENGINE), () => [], true), {
    out: ['tagged @fronthub/arrowz-board@0.1.0 at 5e6f7a8'],
    err: ['error: git push: remote rejected @fronthub/arrowz-engine@0.1.1'],
    code: 1,
  })
})

Deno.test('from a checkout a refused tag is never answered with the command that was just run', () => {
  assertEquals(tagsOutcome(released(ENGINE), [], refusing(ENGINE), () => [WORKFLOW], false), {
    out: [],
    err: ['error: git push: remote rejected @fronthub/arrowz-engine@0.1.1'],
    code: 1,
  })
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
    assertThrows(() => releasedOf(engine, shallow), Error, 'shallow')
  } finally {
    removeDir(full)
    removeDir(shallow)
  }
})

Deno.test('in a repository the releases of a package are its versions since the placeholder, oldest first', async () => {
  const repo = scratchDir()
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await commitManifest(repo, '0.1.0', 'a number from before the placeholder')
    await commitManifest(repo, '0.0.0', 'the placeholder')
    const first = await commitManifest(repo, '0.1.0', 'version packages')
    await commitManifest(repo, '0.1.0', 'a new keyword')
    const second = await commitManifest(repo, '0.2.0', 'version packages')

    assertEquals(releasedOf(engine, repo), [
      { pkg: { ...engine, version: '0.1.0' }, sha: first },
      { pkg: engine, sha: second },
    ])
  } finally {
    removeDir(repo)
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

Deno.test('the workflow files that changed since a commit are named, and no other file is', async () => {
  const repo = scratchDir()
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await commitFile(repo, '.github/workflows/ci.yml', 'ci', 'the workflows')
    const version = await commitManifest(repo, '0.2.0', 'version packages')
    assertEquals(workflowsChangedSince(version, repo), [])

    await commitFile(repo, 'packages/engine/engine.ts', 'source', 'engine change')
    await commitFile(repo, '.github/dependabot.yml', 'bumps', 'not a workflow')
    assertEquals(workflowsChangedSince(version, repo), [])

    await commitFile(repo, '.github/workflows/ci.yml', 'ci, bumped', 'an action bump')
    await commitFile(repo, '.github/workflows/release.yml', 'release', 'a new workflow')
    assertEquals(workflowsChangedSince(version, repo), ['.github/workflows/ci.yml', '.github/workflows/release.yml'])
  } finally {
    removeDir(repo)
  }
})

Deno.test('a tag is pushed to origin at the given commit and leaves no tag in the checkout', async () => {
  const repo = scratchDir()
  const origin = scratchDir()
  // Outside the protected pattern of release tags, and on a commit only the scratch repository has.
  const tag = 'scratch-engine@0.2.0'
  try {
    await scratch(origin, ['init', '-q', '-b', 'main'])
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await scratch(repo, ['remote', 'add', 'origin', origin])
    const version = await commitManifest(repo, '0.2.0', 'version packages')
    await commitManifest(repo, '0.2.0', 'a new keyword')

    pushTag(tag, version, repo)
    assertEquals(await scratch(origin, ['rev-parse', `refs/tags/${tag}`]), version)
    // A local tag would stop the next try after a refused push.
    assertEquals(await scratch(repo, ['tag', '--list']), '')
  } finally {
    removeDir(repo)
    removeDir(origin)
  }
})

const here = dirname(fromFileUrl(import.meta.url))

/** An `npm` that answers `view <name>@<version> version --json` from the file `live` beside it, and nothing else. */
const STUB_NPM = `#!/bin/sh
if [ "$1" != view ] || [ "$3" != version ] || [ "$4" != --json ]; then
  echo "stub npm: unexpected arguments: $*" >&2
  exit 64
fi
here=$(dirname "$0")
echo "$2" >> "$here/asked"
if grep -qxF "$2" "$here/live"; then
  printf '"%s"\\n' "\${2##*@}"
else
  printf '{\\n  "error": { "code": "E404", "summary": "No match found for version %s" }\\n}\\n' "\${2##*@}"
  exit 1
fi
`

/** Writes a file through the shell, its directory included, so the tests need no write access of their own. */
function writeFile(path: string, text: string, mode = '644'): void {
  const script = 'mkdir -p "$(dirname "$1")" && printf %s "$3" > "$1" && chmod "$2" "$1"'
  const made = new Deno.Command('sh', { args: ['-c', script, 'sh', path, mode, text] }).outputSync()
  if (!made.success) throw new Error(`could not write ${path}`)
}

/** The shell line that starts a command with `$1` first on PATH, outside a workflow run and outside a git hook. */
const WITH_STUB = 'unset GITHUB_ACTIONS GITHUB_OUTPUT GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE; ' +
  'PATH="$1:$PATH"; shift; exec "$@"'

/** Runs release.ts as a process in a scratch repository, with the stub npm of `bin` first on PATH. */
function releaseRun(repo: string, bin: string, ...args: string[]): { code: number; out: string[]; err: string[] } {
  const permissions = ['--allow-read', '--allow-write', '--allow-run', '--allow-env']
  const command = [Deno.execPath(), 'run', ...permissions, join(here, 'scripts', 'release.ts'), ...args]
  const r = new Deno.Command('sh', {
    args: ['-c', WITH_STUB, 'sh', bin, ...command],
    cwd: repo,
    stdout: 'piped',
    stderr: 'piped',
  }).outputSync()
  const lines = (bytes: Uint8Array) => new TextDecoder().decode(bytes).split('\n').filter((line) => line !== '')
  return { code: r.code, out: lines(r.stdout), err: lines(r.stderr) }
}

/** Puts the stub npm into `bin`, with the versions it answers as published. */
function stubNpm(bin: string, live: string[]): void {
  writeFile(join(bin, 'npm'), STUB_NPM, '755')
  writeFile(join(bin, 'live'), live.map((spec) => `${spec}\n`).join(''))
}

Deno.test('a tags run gives every live version without a tag its tag, superseded ones too, and leaves the rest', async () => {
  const repo = scratchDir()
  const origin = scratchDir()
  const bin = scratchDir()
  // Outside the protected pattern of release tags; main() reads the manifests of these three directories.
  const scratchPkg = (short: string, dir: string) => (version: string, note: string) =>
    commitFile(repo, `packages/${dir}/package.json`, JSON.stringify({ name: `@scratch/${short}`, version }), note)
  const engineAt = scratchPkg('engine', 'engine')
  const boardAt = scratchPkg('board', 'board-element')
  const cliAt = scratchPkg('cli', 'cli')
  try {
    await scratch(origin, ['init', '-q', '-b', 'main'])
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await scratch(repo, ['remote', 'add', 'origin', origin])
    await engineAt('0.0.0', 'the placeholder')
    await boardAt('0.0.0', 'the placeholder')
    await cliAt('0.0.0', 'the placeholder')
    const engine010 = await engineAt('0.1.0', 'version packages')
    const board010 = await boardAt('0.1.0', 'version packages')
    const cli010 = await cliAt('0.1.0', 'version packages')
    const engine011 = await engineAt('0.1.1', 'version packages')
    await engineAt('0.1.2', 'version packages')
    // main() reads the manifests from the working tree.
    await scratch(repo, ['checkout-index', '-a'])
    await scratch(repo, ['push', '-q', 'origin', `${board010}:refs/tags/@scratch/board@0.1.0`])

    // 0.1.2 is staged and not approved: npm does not have it.
    stubNpm(bin, ['@scratch/engine@0.1.0', '@scratch/engine@0.1.1', '@scratch/board@0.1.0', '@scratch/cli@0.1.0'])
    const tagsOnOrigin = async () => {
      const refs = await scratch(origin, ['for-each-ref', '--format=%(refname:strip=2) %(objectname)', 'refs/tags'])
      return refs.split('\n').sort()
    }

    assertEquals(releaseRun(repo, bin, 'tags'), {
      code: 0,
      out: [
        'not live on npm, so not tagged: @scratch/engine@0.1.2',
        `tagged @scratch/engine@0.1.0 at ${engine010.slice(0, 7)}`,
        `tagged @scratch/engine@0.1.1 at ${engine011.slice(0, 7)}`,
        `tagged @scratch/cli@0.1.0 at ${cli010.slice(0, 7)}`,
      ],
      err: [],
    })
    assertEquals(await tagsOnOrigin(), [
      `@scratch/board@0.1.0 ${board010}`,
      `@scratch/cli@0.1.0 ${cli010}`,
      `@scratch/engine@0.1.0 ${engine010}`,
      `@scratch/engine@0.1.1 ${engine011}`,
    ])
    // The version that had its tag was not asked of npm.
    assert(!Deno.readTextFileSync(join(bin, 'asked')).includes('@scratch/board@0.1.0'))

    assertEquals(releaseRun(repo, bin, 'tags'), {
      code: 0,
      out: [
        'not live on npm, so not tagged: @scratch/engine@0.1.2',
        'nothing to tag: no untagged version is live on npm',
      ],
      err: [],
    })
    assertEquals((await tagsOnOrigin()).length, 4)
  } finally {
    removeDir(repo)
    removeDir(origin)
    removeDir(bin)
  }
})

Deno.test('a plan run refuses a package whose workspace dependency moved after its version commit', async () => {
  const repo = scratchDir()
  const bin = scratchDir()
  const manifest = (short: string, version: string, dependencies?: Record<string, string>) =>
    JSON.stringify({ name: `@scratch/${short}`, version, dependencies })
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await commitFile(repo, 'packages/engine/package.json', manifest('engine', '0.1.0'), 'version packages')
    await commitFile(repo, 'packages/cli/package.json', manifest('cli', '0.1.0'), 'version packages')
    const board = manifest('board', '0.1.1', { '@scratch/engine': 'workspace:^' })
    const boardCommit = await commitFile(repo, 'packages/board-element/package.json', board, 'version packages')
    await commitFile(repo, 'packages/engine/package.json', manifest('engine', '0.1.1'), 'version packages')
    await scratch(repo, ['checkout-index', '-a'])
    stubNpm(bin, ['@scratch/cli@0.1.0'])

    assertEquals(releaseRun(repo, bin, 'plan'), {
      code: 1,
      out: [],
      err: [
        `refused @scratch/board@0.1.1: @scratch/engine was 0.1.0 when ${
          boardCommit.slice(0, 7)
        } set the version and is 0.1.1 now`,
        'A version is released from the files of its version commit. If a release of it is still running or waiting for approval, let that finish; otherwise open a new version pull request.',
      ],
    })
    // The dry run plans all three and refuses nothing.
    assertEquals(releaseRun(repo, bin, 'plan', '--all').code, 0)
  } finally {
    removeDir(repo)
    removeDir(bin)
  }
})

Deno.test('no build of a published package takes its input from a scripts/ directory', () => {
  // changedSince leaves scripts/ out, so a build that read from there could change a released version unseen.
  for (const dir of ['engine', 'board-element', 'cli']) {
    const manifest = obj(JSON.parse(Deno.readTextFileSync(join(here, '..', dir, 'package.json'))), dir)
    const build = obj(manifest.scripts, `${dir} scripts`).build
    assert(typeof build === 'string' && build !== '', `${dir} has no build script`)
    assert(!build.includes('scripts/'), `the build of ${dir} names scripts/: ${build}`)
  }
  const config = obj(JSON.parse(Deno.readTextFileSync(join(here, 'tsconfig.build.json'))), 'tsconfig.build.json')
  assert(Array.isArray(config.include) && config.include.length > 0, 'the engine build lists no file')
  for (const path of config.include) {
    assert(!String(path).replace(/^\.\//, '').startsWith('scripts/'), `the engine build includes ${path}`)
  }
})

/** The module specifiers a source text imports or re-exports: static, side-effect and dynamic forms. */
function specifiersOf(source: string): string[] {
  const found = source.matchAll(/\b(?:from\s*|import\s*\(\s*|import\s+)(['"])([^'"\n]+)\1/g)
  return [...found].map((match) => match[2] ?? '')
}

/** The files under a directory that are sources, not tests: `deep` also reads its subdirectories. */
function sourcesIn(dir: string, deep: boolean): string[] {
  const files: string[] = []
  for (const entry of Deno.readDirSync(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory && deep) files.push(...sourcesIn(path, deep))
    else if (entry.isFile && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(path)
  }
  return files.sort()
}

Deno.test('no source of a published package imports from a scripts/ directory', () => {
  // changedSince leaves scripts/ out, and a compiler or a bundler follows an import wherever it points.
  assertEquals(
    specifiersOf(`import a from './a.ts'
import './side.ts'
export { b } from "../scripts/b.ts"
const c = await import('./scripts/c.ts')
import type { D } from './d.ts'`),
    ['./a.ts', './side.ts', '../scripts/b.ts', './scripts/c.ts', './d.ts'],
  )
  const packages = join(here, '..')
  const sources = [
    ...sourcesIn(join(packages, 'engine'), false),
    ...sourcesIn(join(packages, 'cli'), false),
    ...sourcesIn(join(packages, 'board-element', 'src'), true),
  ]
  for (const dir of ['engine', 'cli', 'board-element']) {
    assert(sources.some((path) => path.startsWith(join(packages, dir))), `no source of ${dir} was read`)
  }
  for (const path of sources) {
    const reached = specifiersOf(Deno.readTextFileSync(path)).filter((spec) => spec.split('/').includes('scripts'))
    assertEquals(reached, [], `${path} imports from a scripts/ directory`)
  }
})

Deno.test('a package whose files changed since its version commit is refused, one line each', () => {
  const changed = (p: Pkg) => p === ENGINE ? ['packages/engine/engine.ts', 'packages/engine/look.ts'] : []
  assertEquals(refusalsOf([ENGINE, CLI], changed, () => [], () => 'abcdef0123456789'), [
    'refused @fronthub/arrowz-engine@0.1.1: packages/engine/engine.ts, packages/engine/look.ts changed since abcdef0 set the version',
  ])
  assertEquals(refusalsOf([ENGINE, CLI], () => [], () => [], () => 'abcdef0123456789'), [])
})

Deno.test('a package whose workspace dependency has another version than at its version commit is refused', () => {
  const moved = (p: Pkg) => p === BOARD ? [{ name: ENGINE.name, then: '0.1.0', now: '0.1.1' }] : []
  assertEquals(refusalsOf([ENGINE, BOARD], () => [], moved, () => 'abcdef0123456789'), [
    'refused @fronthub/arrowz-board@0.1.0: @fronthub/arrowz-engine was 0.1.0 when abcdef0 set the version and is 0.1.1 now',
  ])
  // Both reasons at once give both lines.
  const changed = (p: Pkg) => p === BOARD ? ['packages/board-element/src/mod.ts'] : []
  assertEquals(refusalsOf([BOARD], changed, moved, () => 'abcdef0123456789').length, 2)
})

Deno.test('the workspace dependencies of a manifest are the names whose range starts with workspace:', () => {
  const manifest = JSON.stringify({
    dependencies: { '@fronthub/arrowz-engine': 'workspace:^', lit: '^3.3.3' },
    peerDependencies: { '@fronthub/arrowz-board': 'workspace:*', '@fronthub/arrowz-engine': 'workspace:^' },
    devDependencies: { '@fronthub/arrowz-cli': 'workspace:^' },
  })
  // A development dependency is not installed with the package, so its version does not reach a user.
  assertEquals(workspaceDepsOf(manifest), ['@fronthub/arrowz-engine', '@fronthub/arrowz-board'])
  assertEquals(workspaceDepsOf('{"name":"n"}'), [])
})

Deno.test('the commit of a package that did not change is not looked up', () => {
  const never = () => {
    throw new Error('no version commit here')
  }
  assertEquals(refusalsOf([CLI], () => [], () => [], never), [])
})

Deno.test('in a repository a dependency that moved after the version commit is named with both versions', async () => {
  const repo = scratchDir()
  const board = { dir: 'packages/board-element', name: '@fronthub/arrowz-board', version: '0.1.1' }
  const boardManifest = (version: string) =>
    JSON.stringify({
      name: board.name,
      version,
      dependencies: { '@fronthub/arrowz-engine': 'workspace:^', lit: '^3.3.3' },
    })
  try {
    await scratch(repo, ['init', '-q', '-b', 'main'])
    await commitManifest(repo, '0.1.0', 'the engine of the day')
    await commitFile(repo, 'packages/board-element/package.json', boardManifest('0.1.1'), 'version packages')
    assertEquals(depsMovedSince(board, [{ ...engine, version: '0.1.0' }, board], repo), [])

    await commitManifest(repo, '0.1.1', 'version packages')
    assertEquals(depsMovedSince(board, [{ ...engine, version: '0.1.1' }, board], repo), [
      { name: '@fronthub/arrowz-engine', then: '0.1.0', now: '0.1.1' },
    ])
    // The engine depends on nothing in the workspace, so its version commit is not even looked up.
    assertEquals(depsMovedSince({ ...engine, version: '9.9.9' }, [board], repo), [])
  } finally {
    removeDir(repo)
  }
})

Deno.test('a refused plan prints the refusals and the advice, names no directory and ends with status 1', () => {
  const refusal =
    'refused @fronthub/arrowz-engine@0.1.1: packages/engine/engine.ts changed since abcdef0 set the version'
  const outcome = planOutcome([ENGINE, BOARD, CLI], [ENGINE, CLI], [refusal])
  assertEquals(outcome, {
    out: [],
    err: [
      refusal,
      'A version is released from the files of its version commit. If a release of it is still running or waiting for approval, let that finish; otherwise open a new version pull request.',
    ],
    code: 1,
  })
  // An empty `dirs=` would read as "nothing to release"; a refused run must write no such line.
  assert(!('dirs' in outcome))
})

Deno.test('a plan that stands prints one line per package, names the directories to release and ends with status 0', () => {
  assertEquals(planOutcome([ENGINE, BOARD, CLI], [ENGINE, CLI], []), {
    out: [
      'release @fronthub/arrowz-engine@0.1.1',
      'skip    @fronthub/arrowz-board@0.1.0',
      'release @fronthub/arrowz-cli@0.2.0',
    ],
    err: [],
    dirs: 'packages/engine packages/cli',
    code: 0,
  })
  assertEquals(planOutcome([ENGINE, BOARD, CLI], [], []), {
    out: [
      'skip    @fronthub/arrowz-engine@0.1.1',
      'skip    @fronthub/arrowz-board@0.1.0',
      'skip    @fronthub/arrowz-cli@0.2.0',
    ],
    err: [],
    dirs: '',
    code: 0,
  })
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

type Obj = Record<string, unknown>

function obj(value: unknown, what = 'value'): Obj {
  assert(typeof value === 'object' && value !== null && !Array.isArray(value), `${what} is not a mapping`)
  return value as Obj
}

const workflowDir = join(here, '..', '..', '.github', 'workflows')
// A duplicated key or a syntax error throws here, and fails every guard that reads the workflow.
const load = (file: string): Obj => obj(parse(Deno.readTextFileSync(join(workflowDir, file))), file)
const jobsOf = (doc: Obj): Obj => obj(doc.jobs, 'jobs')
const stepsOf = (job: Obj): Obj[] => {
  assert(Array.isArray(job.steps), 'steps is not a list')
  return job.steps.map((step, i) => obj(step, `step ${i}`))
}
const allSteps = (doc: Obj): Obj[] => Object.values(jobsOf(doc)).flatMap((job) => stepsOf(obj(job)))

const ACTIONS = [
  'actions/checkout',
  'actions/setup-node',
  'denoland/setup-deno',
  'pnpm/action-setup',
  'actions/upload-artifact',
  'actions/download-artifact',
]

/** The action a `uses` names. The value must be `<owner>/<repo>@<40 hex>` and nothing more. */
function actionOf(uses: unknown): string {
  const name = /^([\w.-]+\/[\w.-]+)@[0-9a-f]{40}$/.exec(String(uses))?.[1]
  assert(name !== undefined, `${uses} is not an action pinned to a commit`)
  return name
}
const runs = (step: Obj, action: string): boolean => 'uses' in step && actionOf(step.uses) === action

/** A copy of a job or step in which each `uses` keeps the action name and its commit becomes `@pinned`. */
function pinned<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, v) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v) || !('uses' in v)) return v
    return { ...v, uses: `${actionOf(v.uses)}@pinned` }
  })
}

const ONLY_MAIN = "github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"

Deno.test('the workflow starts only on push to main, a manual run and a pull request that touches the release', () => {
  const doc = load('release.yml')
  assertEquals(Object.keys(doc), ['name', 'on', 'permissions', 'concurrency', 'jobs'])
  assertEquals(doc.name, 'Release')
  assertEquals(doc.permissions, {})
  assertEquals(doc.concurrency, {
    group: 'release-${{ github.ref }}',
    'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
  })
  assertEquals(doc.on, {
    push: { branches: ['main'], paths: ['packages/*/CHANGELOG.md'] },
    workflow_dispatch: null,
    pull_request: {
      paths: [
        '.github/workflows/release.yml',
        'packages/engine/scripts/release.ts',
        'packages/engine/scripts/pack-check.ts',
        'packages/engine/scripts/consumer-smoke.mjs',
        'packages/engine/scripts/consumer-golden.json',
      ],
    },
  })
})

Deno.test('the jobs, their keys and their permissions are exactly the expected ones', () => {
  const jobs = jobsOf(load('release.yml'))
  assertEquals(Object.keys(jobs), ['tag-published', 'plan', 'build', 'smoke', 'stage'])
  const expected: Record<string, [string[], Obj]> = {
    'tag-published': [['if', 'runs-on', 'permissions', 'steps'], { contents: 'write' }],
    plan: [['runs-on', 'permissions', 'outputs', 'steps'], { contents: 'read' }],
    build: [['needs', 'if', 'runs-on', 'permissions', 'outputs', 'steps'], { contents: 'read' }],
    smoke: [['needs', 'strategy', 'runs-on', 'permissions', 'steps'], { contents: 'read' }],
    stage: [['needs', 'if', 'runs-on', 'environment', 'permissions', 'steps'], {
      'id-token': 'write',
      contents: 'read',
    }],
  }
  for (const [name, [keys, permissions]] of Object.entries(expected)) {
    const job = obj(jobs[name], name)
    assertEquals(Object.keys(job).sort(), [...keys].sort(), `${name} keys`)
    assertEquals(job.permissions, permissions, `${name} permissions`)
  }
  assertEquals(obj(jobs.build).needs, 'plan')
  assertEquals(obj(jobs.smoke).needs, 'build')
})

const CHECKOUT = { uses: 'actions/checkout@pinned', with: { 'persist-credentials': false } }
const SETUP_DENO = { uses: 'denoland/setup-deno@pinned', with: { 'deno-version': '~2.9' } }
const DOWNLOAD = { uses: 'actions/download-artifact@pinned', with: { name: 'tarballs', path: 'tarballs' } }

Deno.test('tag-published is exactly the job that tags what is live, on main only', () => {
  assertEquals(pinned(jobsOf(load('release.yml'))['tag-published']), {
    if: ONLY_MAIN,
    'runs-on': 'ubuntu-latest',
    permissions: { contents: 'write' },
    steps: [
      { uses: 'actions/checkout@pinned', with: { 'fetch-depth': 0 } },
      SETUP_DENO,
      { run: 'deno run --allow-read --allow-run --allow-env packages/engine/scripts/release.ts tags' },
    ],
  })
})

Deno.test('the command a refused tag is answered with is the one the tag-published job runs', () => {
  const steps = stepsOf(obj(jobsOf(load('release.yml'))['tag-published']))
  assertEquals(steps.at(-1), { run: TAGS_COMMAND })
})

Deno.test('plan is exactly the job that reads the whole history and names the directories to release', () => {
  assertEquals(pinned(jobsOf(load('release.yml')).plan), {
    'runs-on': 'ubuntu-latest',
    permissions: { contents: 'read' },
    outputs: { dirs: '${{ steps.plan.outputs.dirs }}' },
    steps: [
      { uses: 'actions/checkout@pinned', with: { 'fetch-depth': 0, 'persist-credentials': false } },
      SETUP_DENO,
      {
        id: 'plan',
        run:
          "deno run --allow-read --allow-write --allow-run --allow-env packages/engine/scripts/release.ts plan ${{ github.event_name == 'pull_request' && '--all' || '' }}",
      },
    ],
  })
})

// The same text runs in the build job (on every dry run) and in the stage job; the two must not drift.
const CHECK = `
if printf '%s\\n' "$SUMS" | grep -Evq '^[0-9a-f]{64}  tarballs/fronthub-arrowz-(engine|board|cli)-[0-9A-Za-z.+-]+\\.tgz$'; then
  echo "::error::the digest list names something that is not one of the three tarballs"
  exit 1
fi
if ! printf '%s\\n' "$SUMS" | sha256sum --check --strict; then
  echo "::error::the tarballs do not match their digests"
  exit 1
fi
judged=$(printf '%s\\n' "$SUMS" | grep -c .)
received=$(find tarballs -mindepth 1 | wc -l)
if [ "$received" -ne "$judged" ]; then
  echo "::error::the artifact holds $received files, the gates judged $judged"
  exit 1
fi
`.slice(1)

const DIGEST_STEPS = [
  {
    run:
      'deno run --allow-read --allow-write --allow-run --allow-env packages/engine/scripts/pack-check.ts --out=tarballs $DIRS',
    env: { DIRS: '${{ needs.plan.outputs.dirs }}' },
  },
  {
    id: 'sums',
    run: "{\n  echo 'sums<<SUMS_END'\n  sha256sum tarballs/*.tgz\n  echo 'SUMS_END'\n} >> \"$GITHUB_OUTPUT\"\n",
  },
  { name: 'Read the digests back', env: { SUMS: '${{ steps.sums.outputs.sums }}' }, run: CHECK },
  {
    uses: 'actions/upload-artifact@pinned',
    with: {
      name: 'tarballs',
      path: 'tarballs/*.tgz',
      'if-no-files-found': 'error',
      'retention-days': 7,
      overwrite: true,
    },
  },
]

Deno.test('build is exactly the job that runs every gate and packs what passed them', () => {
  assertEquals(pinned(jobsOf(load('release.yml')).build), {
    needs: 'plan',
    if: "needs.plan.outputs.dirs != ''",
    'runs-on': 'ubuntu-latest',
    permissions: { contents: 'read' },
    outputs: { sums: '${{ steps.sums.outputs.sums }}' },
    steps: [
      CHECKOUT,
      SETUP_DENO,
      { uses: 'pnpm/action-setup@pinned' },
      { uses: 'actions/setup-node@pinned', with: { 'node-version': 24, 'package-manager-cache': false } },
      { run: 'pnpm install --frozen-lockfile' },
      { run: 'pnpm --filter @fronthub/arrowz-board exec playwright install --with-deps chromium' },
      { run: 'pnpm nx run-many -t check lint fmt test build smoke pack-check' },
      ...DIGEST_STEPS,
    ],
  })
})

const legsOf = (smoke: Obj): unknown => obj(obj(smoke.strategy, 'strategy').matrix, 'matrix').include

Deno.test('smoke is exactly the job that installs the tarballs as a consumer would, whatever its legs', () => {
  const smoke = obj(jobsOf(load('release.yml')).smoke, 'smoke')
  assertEquals(pinned(smoke), {
    needs: 'build',
    strategy: { 'fail-fast': false, matrix: { include: legsOf(smoke) } },
    'runs-on': '${{ matrix.os }}',
    permissions: { contents: 'read' },
    steps: [
      CHECKOUT,
      {
        uses: 'actions/setup-node@pinned',
        with: { 'node-version': '${{ matrix.node }}', 'package-manager-cache': false },
      },
      { if: 'matrix.npm', run: 'npm install --global npm@${{ matrix.npm }}' },
      { if: 'matrix.deno', ...SETUP_DENO },
      DOWNLOAD,
      {
        run:
          "${{ matrix.deno && 'deno run --no-config --no-lock --allow-all' || 'node' }} packages/engine/scripts/consumer-smoke.mjs tarballs",
      },
    ],
  })
})

const SYSTEMS = [
  'ubuntu-latest',
  'ubuntu-24.04-arm',
  'macos-latest',
  'macos-15-intel',
  'windows-latest',
  'windows-11-arm',
]
// `matrix.npm` is spliced into a script: a version cannot carry a command, and it is never falsy.
const isVersion = (value: unknown): boolean =>
  (typeof value === 'number' || typeof value === 'string') && /^[1-9]\d*(\.\d+){0,2}$/.test(String(value))

Deno.test('the smoke matrix can grow, and keeps its six systems, its oldest Node, an npm leg and a Deno leg', () => {
  const include = legsOf(obj(jobsOf(load('release.yml')).smoke, 'smoke'))
  assert(Array.isArray(include), 'include is not a list')
  const legs = include.map((leg, i) => obj(leg, `leg ${i}`))
  assert(legs.length >= 16, `${legs.length} legs: one was dropped`)
  const distinct = new Set(legs.map((leg) => JSON.stringify(Object.entries(leg).sort())))
  assertEquals(distinct.size, legs.length, 'two legs are the same, so one stands in for a dropped one')
  for (const leg of legs) {
    const said = JSON.stringify(leg)
    assert(Object.keys(leg).every((key) => ['os', 'node', 'npm', 'deno'].includes(key)), said)
    assert(typeof leg.os === 'string' && SYSTEMS.includes(leg.os), said)
    assert(!('npm' in leg) || isVersion(leg.npm), said)
  }
  for (const system of SYSTEMS) assert(legs.some((leg) => leg.os === system), `no leg runs on ${system}`)
  // Without such legs the two conditional steps of the job never run.
  assert(legs.some((leg) => 'npm' in leg), 'no leg installs another npm')
  assert(legs.some((leg) => leg.deno === true), 'no leg runs under Deno')
  const manifest = obj(JSON.parse(Deno.readTextFileSync(join(here, 'package.json'))), 'package.json')
  const oldest = /^>=(\d+\.\d+)$/.exec(String(obj(manifest.engines, 'engines').node))?.[1]
  assert(oldest !== undefined, 'engines.node is not ">=<major>.<minor>"')
  assert(
    legs.some((leg) => leg.node === `${oldest}.0` && !leg.deno),
    `no leg runs Node ${oldest}.0, the oldest the packages promise`,
  )
})

const STAGE_HEAD = `
version=$(npm --version)
echo "npm $version"
major=\${version%%.*}
rest=\${version#*.}
minor=\${rest%%.*}
case "$version" in
  *.*.*) ;;
  *)
    echo "::error::cannot read the npm version '$version'"
    exit 1
    ;;
esac
for part in "$major" "$minor"; do
  case "$part" in
    '' | *[!0-9]*)
      echo "::error::cannot read the npm version '$version'"
      exit 1
      ;;
  esac
done
if [ "$major" -lt 11 ] || { [ "$major" -eq 11 ] && [ "$minor" -lt 15 ]; }; then
  echo "::error::npm $version cannot stage: staged publishing needs 11.15 or newer"
  exit 1
fi
# Only the files the gates judged, and all of them.
if [ -z "$SUMS" ]; then
  echo "::error::the build job handed over no digests"
  exit 1
fi
`.slice(1)

const STAGE_TAIL = `
# Dependencies first. Every tarball is tried: after a partial failure a
# re-run must still reach the packages npm has not staged yet.
failed=0
handed=0
for name in engine board cli; do
  for tgz in tarballs/fronthub-arrowz-"$name"-*.tgz; do
    if [ -e "$tgz" ]; then
      handed=$((handed + 1))
      # npm takes \`tarballs/x.tgz\` for a GitHub repository; a path that starts with ./ is a file.
      if log=$(npm stage publish --ignore-scripts "./$tgz" 2>&1); then
        printf '%s\\n' "$log"
      else
        printf '%s\\n' "$log"
        # A version that is already staged is refused with both of these; any other conflict is a failure.
        held=no
        case "$log" in
          *'npm error code E409'*)
            case "$log" in
              *'Cannot stage previously published version'*) held=yes ;;
            esac
            ;;
        esac
        if [ "$held" = yes ]; then
          echo "::notice::npm already has the version of $tgz, staged earlier or live: nothing was staged for it now"
        else
          echo "::error::npm did not stage $tgz"
          failed=1
        fi
      fi
    fi
  done
done
if [ "$handed" -ne "$judged" ]; then
  echo "::error::$handed of $judged judged tarballs were handed to npm"
  exit 1
fi
exit "$failed"
`.slice(1)

Deno.test('stage is exactly the job that hands the judged tarballs to npm, and nothing else', () => {
  assertEquals(pinned(jobsOf(load('release.yml')).stage), {
    needs: ['plan', 'build', 'smoke'],
    if: ONLY_MAIN,
    'runs-on': 'ubuntu-latest',
    environment: 'npm',
    permissions: { 'id-token': 'write', contents: 'read' },
    steps: [
      {
        uses: 'actions/setup-node@pinned',
        with: {
          'node-version': '24.21.0',
          'registry-url': 'https://registry.npmjs.org',
          'package-manager-cache': false,
        },
      },
      DOWNLOAD,
      {
        name: 'Stage on npm',
        env: { SUMS: '${{ needs.build.outputs.sums }}' },
        run: STAGE_HEAD + CHECK + STAGE_TAIL,
      },
    ],
  })
})

/** What the stub `npm` prints to stderr for each refusal; the tests expect these very lines in the log. */
const NPM_REFUSALS: Record<string, string[]> = {
  held: [
    'npm error code E409',
    'npm error 409 Conflict - POST https://registry.npmjs.org/-/stage/package/@fronthub%2farrowz-x - Cannot stage previously published version "0.1.0".',
  ],
  conflict: ['npm error code E409', 'npm error 409 Conflict - another conflict'],
  sentence: ['npm error code E403', 'npm error 403 Cannot stage previously published version "0.1.0".'],
  down: ['npm error code E500'],
}

/**
 * An `npm` for the stage loop. It takes only a tarball path that starts with ./, and answers as the
 * variable named after the package says: staged when it is empty.
 */
const STUB_STAGE_NPM = `#!/bin/sh
if [ "$1" != stage ] || [ "$2" != publish ] || [ "$3" != --ignore-scripts ]; then
  echo "stub npm: unexpected arguments: $*" >&2
  exit 64
fi
case "$4" in
  ./tarballs/*engine*) answer=$ENGINE ;;
  ./tarballs/*board*) answer=$BOARD ;;
  ./tarballs/*cli*) answer=$CLI ;;
  *)
    echo "stub npm: $4 is not a tarball path that starts with ./" >&2
    exit 64
    ;;
esac
echo "$4" >> "$(dirname "$0")/handed"
case "$answer" in
${
  Object.entries(NPM_REFUSALS).map(([answer, lines]) =>
    `  ${answer})\n${lines.map((line) => `    echo '${line}' >&2\n`).join('')}    exit 1\n    ;;`
  ).join('\n')
}
  *) echo "+ $4 (staged with id 1)" ;;
esac
`

/** Runs the loop of the stage step on three judged tarballs; the workflow's step ends with this very text. */
function stageLoop(answers: { engine?: string; board?: string; cli?: string }): {
  code: number
  out: string[]
  handed: string[]
} {
  const dir = scratchDir()
  try {
    for (const name of ['engine', 'board', 'cli']) {
      writeFile(join(dir, `tarballs/fronthub-arrowz-${name}-0.1.0.tgz`), name)
    }
    writeFile(join(dir, 'bin', 'npm'), STUB_STAGE_NPM, '755')
    const r = new Deno.Command('bash', {
      // A step that names no shell runs as `bash -e`, without pipefail. The two assignments stand in for the part of the step above the loop.
      args: ['-e', '-c', `PATH="$PWD/bin:$PATH"\njudged=3\n${STAGE_TAIL}`],
      cwd: dir,
      env: { ENGINE: answers.engine ?? '', BOARD: answers.board ?? '', CLI: answers.cli ?? '' },
      stdout: 'piped',
      stderr: 'piped',
    }).outputSync()
    return {
      code: r.code,
      out: new TextDecoder().decode(r.stdout).split('\n').filter((line) => line !== ''),
      handed: Deno.readTextFileSync(join(dir, 'bin', 'handed')).trim().split('\n'),
    }
  } finally {
    removeDir(dir)
  }
}

const tarballOf = (name: string) => `tarballs/fronthub-arrowz-${name}-0.1.0.tgz`
const ALL_HANDED = ['engine', 'board', 'cli'].map((name) => `./${tarballOf(name)}`)
const heldNotice = (name: string) =>
  `::notice::npm already has the version of ${tarballOf(name)}, staged earlier or live: nothing was staged for it now`
const notStaged = (name: string) => `::error::npm did not stage ${tarballOf(name)}`
const stagedLine = (name: string) => `+ ./${tarballOf(name)} (staged with id 1)`
const refusedLines = (answer: string) => NPM_REFUSALS[answer] ?? []

Deno.test('the stage loop hands npm every tarball as a ./ path, dependencies first, and ends with status 0', () => {
  assertEquals(stageLoop({}), {
    code: 0,
    out: [stagedLine('engine'), stagedLine('board'), stagedLine('cli')],
    handed: ALL_HANDED,
  })
})

Deno.test('a version that is already staged gets a notice and does not fail the stage loop', () => {
  assertEquals(stageLoop({ engine: 'held' }), {
    code: 0,
    out: [...refusedLines('held'), heldNotice('engine'), stagedLine('board'), stagedLine('cli')],
    handed: ALL_HANDED,
  })
  assertEquals(stageLoop({ engine: 'held', board: 'held', cli: 'held' }), {
    code: 0,
    out: ['engine', 'board', 'cli'].flatMap((name) => [...refusedLines('held'), heldNotice(name)]),
    handed: ALL_HANDED,
  })
})

Deno.test('any other refusal fails the stage loop after every tarball was tried', () => {
  // The code without the sentence, the sentence without the code, and another error: none is a staged version.
  for (const answer of ['conflict', 'sentence', 'down']) {
    assertEquals(stageLoop({ engine: answer }), {
      code: 1,
      out: [...refusedLines(answer), notStaged('engine'), stagedLine('board'), stagedLine('cli')],
      handed: ALL_HANDED,
    }, answer)
  }
  assertEquals(stageLoop({ board: 'down', cli: 'held' }), {
    code: 1,
    out: [
      stagedLine('engine'),
      ...refusedLines('down'),
      notStaged('board'),
      ...refusedLines('held'),
      heldNotice('cli'),
    ],
    handed: ALL_HANDED,
  })
})

// Any case, and a space before the parenthesis: no spelling of a status function may get past.
const STATUS = /(always|failure|cancelled)\s*\(/i

Deno.test('every step is a pinned action from the allowed set or a script, and none can go on after a failure', () => {
  const doc = load('release.yml')
  for (const [name, job] of Object.entries(jobsOf(doc))) {
    const conditions = [obj(job).if, ...stepsOf(obj(job)).map((step) => step.if)]
    for (const condition of conditions) assert(!STATUS.test(String(condition)), `${name}: ${condition}`)
    const runsOn = obj(job)['runs-on']
    assert(runsOn === 'ubuntu-latest' || runsOn === '${{ matrix.os }}', `${name} runs on ${runsOn}`)
  }
  for (const step of allSteps(doc)) {
    assertEquals(Object.keys(step).filter((key) => key === 'uses' || key === 'run').length, 1, JSON.stringify(step))
    assert(!('continue-on-error' in step))
    if ('uses' in step) assert(ACTIONS.includes(actionOf(step.uses)), `${step.uses} is not an allowed action`)
  }
})

Deno.test('no action is given a cache, whatever the case of the input name', () => {
  for (const step of allSteps(load('release.yml')).filter((s) => 'uses' in s)) {
    const input = obj(step.with ?? {}, 'with')
    for (const [key, value] of Object.entries(input)) {
      // GitHub hands an input to the action in upper case, so `Cache` is the input `cache`.
      if (key.toLowerCase() === 'package-manager-cache') assertEquals(value, false, `${step.uses}: ${key}`)
      else assert(!key.toLowerCase().includes('cache'), `${step.uses} is given ${key}`)
    }
    if (runs(step, 'actions/setup-node')) assertEquals(input['package-manager-cache'], false, 'setup-node')
  }
})

Deno.test('every action line names a commit and, in a comment, the tag that commit stands for', () => {
  // A parser drops comments, so this one guard reads the text; a line that is only a comment is prose.
  const text = Deno.readTextFileSync(join(workflowDir, 'release.yml'))
  const lines = text.split('\n').filter((line) => line.includes('uses:') && !line.trimStart().startsWith('#'))
  for (const line of lines) assert(/^ +(- )?uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d[\w.-]*$/.test(line), line)
  // A `uses` spelled so that no line reads `uses:` would escape the pattern above.
  assertEquals(lines.length, allSteps(load('release.yml')).filter((step) => 'uses' in step).length)
})

Deno.test('checkouts keep no token, except where tags are pushed, and the ones that read history fetch all of it', () => {
  const jobs = jobsOf(load('release.yml'))
  for (const [name, job] of Object.entries(jobs)) {
    for (const step of stepsOf(obj(job)).filter((s) => runs(s, 'actions/checkout'))) {
      const input = obj(step.with, 'with')
      if (name !== 'tag-published') assertEquals(input['persist-credentials'], false, name)
      assert(!('filter' in input), `${name} fetches a partial clone`)
      // release.ts refuses a shallow clone: a grafted tip would pass for the commit that set a version.
      if (name === 'plan' || name === 'tag-published') assertEquals(input['fetch-depth'], 0, name)
    }
  }
})

Deno.test('the digests are taken from the packed files, read back on the runner, and only then uploaded', () => {
  const build = obj(jobsOf(load('release.yml')).build)
  assertEquals(build.outputs, { sums: '${{ steps.sums.outputs.sums }}' })
  const steps = stepsOf(build)
  const pack = steps.findIndex((step) =>
    String(step.run).includes('pack-check.ts') && String(step.run).includes('--out=tarballs')
  )
  assert(pack >= 0, 'no step packs into tarballs')
  assertEquals(pinned(steps.slice(pack, pack + 4)), DIGEST_STEPS)
  // Without this, the stage job could keep a weaker copy of the check.
  const stage = stepsOf(obj(jobsOf(load('release.yml')).stage)).map((step) => String(step.run))
  assert(stage.some((script) => script.includes(CHECK)))
})

Deno.test('the repository has two workflows, and the other one asks for neither an identity nor an environment', () => {
  const names = [...Deno.readDirSync(workflowDir)].map((e) => e.name).filter((n) => n !== '.DS_Store').sort()
  assertEquals(names, ['ci.yml', 'release.yml'])
  const ci = load('ci.yml')
  const jobs = Object.values(jobsOf(ci)).map((job) => obj(job, 'job'))
  // Each grant is a mapping: the string `write-all` would hand out the identity without naming it.
  const grants = [ci, ...jobs.filter((job) => 'permissions' in job)].map((at) => obj(at.permissions, 'permissions'))
  const has = (map: Obj, name: string) => Object.keys(map).some((key) => key.toLowerCase() === name)
  for (const grant of grants) assert(!has(grant, 'id-token'))
  for (const job of jobs) assert(!has(job, 'environment'))
})
