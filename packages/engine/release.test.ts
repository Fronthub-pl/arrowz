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
  manifestOf,
  type Pkg,
  planOf,
  planOutcome,
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
      if ! npm stage publish --ignore-scripts "$tgz"; then
        echo "::error::npm did not stage $tgz"
        failed=1
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
