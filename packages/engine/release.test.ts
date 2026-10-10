// What a release run decides: which versions it stages, which tags it creates
// and where, that the goldens of the consumer smoke are the engine's own, and
// that the workflow file keeps the shape that makes the release safe.
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
const workflowLines = (): string[] => workflow().split('\n')

/** One job, from its key line to the next line indented by exactly two spaces that is not a comment. */
function job(name: string): string {
  const lines = workflowLines()
  const from = lines.indexOf(`  ${name}:`)
  assert(from >= 0, `release.yml has no job ${name}`)
  let to = lines.findIndex((line, i) => i > from && /^ {2}[^ #]/.test(line))
  if (to < 0) to = lines.length
  return lines.slice(from, to).join('\n')
}

const trimmed = (name: string): string[] => job(name).split('\n').map((line) => line.trim())

/** The lines of a top-level block: from its key to the next top-level line that is not a comment. */
function topLevel(key: string): string[] {
  const lines = workflowLines()
  const from = lines.indexOf(`${key}:`)
  assert(from >= 0, `release.yml has no ${key} block`)
  const to = lines.findIndex((line, i) => i > from && /^[^ #]/.test(line))
  return lines.slice(from + 1, to < 0 ? lines.length : to)
}

const ONLY_MAIN = "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'"

Deno.test('the workflow starts only on push, a manual run and a pull request', () => {
  const keys = topLevel('on').filter((line) => /^ {2}[^ #]/.test(line))
  assertEquals(keys, ['  push:', '  workflow_dispatch:', '  pull_request:'])
  for (const word of ['pull_request_target', 'schedule', 'workflow_run', 'workflow_call']) {
    assert(!workflow().includes(word), `release.yml mentions ${word}`)
  }
})

Deno.test('the jobs are exactly tag-published, plan, build, smoke and stage, in that order', () => {
  const keys = topLevel('jobs').filter((line) => /^ {2}[^ #]/.test(line))
  assertEquals(keys, ['  tag-published:', '  plan:', '  build:', '  smoke:', '  stage:'])
})

Deno.test('permissions are none by default, only tag-published writes contents and only stage asks for an identity', () => {
  const lines = workflowLines()
  assertEquals(
    lines.filter((line) => line.includes('permissions')),
    ['permissions: {}', ...Array(5).fill('    permissions:')],
  )
  const granted: string[] = []
  lines.forEach((line, i) => {
    if (line !== '    permissions:') return
    for (const next of lines.slice(i + 1)) {
      if (!next.startsWith('      ')) break
      granted.push(next.trim())
    }
  })
  for (const line of granted) {
    assert(['contents: read', 'contents: write', 'id-token: write'].includes(line), `permission ${line}`)
  }
  assertEquals(granted.filter((line) => line === 'contents: write').length, 1)
  assertEquals(granted.filter((line) => line === 'id-token: write').length, 1)
  assert(trimmed('tag-published').includes('contents: write'))
  assert(trimmed('stage').includes('id-token: write'))
  const scope =
    /^\s*(actions|packages|pull-requests|security-events|attestations|checks|deployments|issues|statuses|pages|discussions):/
  assertEquals(lines.filter((line) => scope.test(line)), [])
  assert(!/write-all|read-all/.test(workflow()))
})

Deno.test('only the stage job names an environment, and it is npm', () => {
  assertEquals(workflowLines().filter((line) => line.includes('environment:')), ['    environment: npm'])
  assert(trimmed('stage').includes('environment: npm'))
})

Deno.test('tag-published runs only on main and never on a pull request, and a release run is never cancelled', () => {
  assertEquals(trimmed('tag-published').filter((line) => line.startsWith('if:')), [ONLY_MAIN])
  assertEquals(topLevel('concurrency'), [
    '  group: release-${{ github.ref }}',
    "  cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    '',
  ])
  assertEquals(workflow().match(/concurrency/g)?.length, 1)
})

Deno.test('no condition can run a job after a failure and nothing continues on error', () => {
  for (const line of workflowLines().filter((l) => l.includes('if:'))) {
    assert(!/always\(\)|failure\(\)|cancelled\(\)/.test(line), line)
  }
  assert(!workflow().includes('continue-on-error'))
})

Deno.test('the workflow has no anchors, aliases, containers or services, and runs on GitHub-hosted runners', () => {
  const anchor = /(^|[\s,[{])[&*][A-Za-z_][\w-]*/
  assert(anchor.test('      - &extra run: echo') && anchor.test('      - *extra'), 'the pattern must catch both')
  assertEquals(workflowLines().filter((line) => anchor.test(line)), [])
  for (const word of ['container:', 'services:']) assert(!workflow().includes(word), word)
  for (const line of workflowLines().filter((l) => l.includes('runs-on:'))) {
    assert(['runs-on: ubuntu-latest', 'runs-on: ${{ matrix.os }}'].includes(line.trim()), line)
  }
})

Deno.test('the repository has two workflows, and the other one asks for neither an identity nor an environment', () => {
  const names = [...Deno.readDirSync(join(here, '..', '..', '.github', 'workflows'))].map((e) => e.name).sort()
  assertEquals(names, ['ci.yml', 'release.yml'])
  const ci = Deno.readTextFileSync(join(here, '..', '..', '.github', 'workflows', 'ci.yml'))
  assert(!ci.includes('id-token') && !ci.includes('environment:'))
})

Deno.test('the stage job has no checkout and only the two actions that fetch Node and the tarballs', () => {
  const uses = job('stage').split('\n').filter((line) => line.includes('uses:')).map((line) => line.trim())
  assertEquals(uses, [
    '- uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
    '- uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2',
  ])
  assert(!job('stage').includes('checkout'))
})

// The whole job is written out: a change to what npm is trusted with is a change to this text, in the same review.
const STAGE = `
  stage:
    needs: [plan, build, smoke]
    if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: npm
    permissions:
      id-token: write
      contents: read
    steps:
      # An exact Node, so the npm that stages is the one this file names (24.21.0 bundles npm 11.19.0).
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24.21.0
          registry-url: https://registry.npmjs.org
          package-manager-cache: false

      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: tarballs
          path: tarballs

      - name: Stage on npm
        env:
          SUMS: \${{ needs.build.outputs.sums }}
        run: |
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
          if printf '%s\\n' "$SUMS" | grep -Evq '^[0-9a-f]{64}  tarballs/fronthub-arrowz-(engine|board|cli)-[0-9A-Za-z.+-]+\\.tgz$'; then
            echo "::error::the digest list names something that is not one of the three tarballs"
            exit 1
          fi
          printf '%s\\n' "$SUMS" | sha256sum --check --strict
          judged=$(printf '%s\\n' "$SUMS" | grep -c .)
          received=$(find tarballs -mindepth 1 | wc -l)
          if [ "$received" -ne "$judged" ]; then
            echo "::error::the artifact holds $received files, the gates judged $judged"
            exit 1
          fi
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
`

Deno.test('the stage job is exactly what it must be', () => {
  assertEquals(job('stage'), STAGE.slice(1))
})

Deno.test('the digests are taken from the files the gates judged, right before they are uploaded', () => {
  const lines = trimmed('build')
  const pack = lines.findIndex((line) => line.includes('pack-check.ts') && line.includes('--out=tarballs'))
  const sums = lines.indexOf('- id: sums')
  const upload = lines.findIndex((line) => line.includes('actions/upload-artifact@'))
  assert(pack >= 0 && pack < sums && sums < upload, 'pack, then digests, then upload')
  const end = lines.indexOf('} >> "$GITHUB_OUTPUT"', sums)
  assertEquals(lines.slice(sums, end + 1), [
    '- id: sums',
    'run: |',
    '{',
    "echo 'sums<<SUMS_END'",
    'sha256sum tarballs/*.tgz',
    "echo 'SUMS_END'",
    '} >> "$GITHUB_OUTPUT"',
  ])
  for (const line of lines.slice(end + 1, upload)) {
    assert(!/run:|uses:/.test(line), `between digests and upload: ${line}`)
  }
  assert(lines.includes('sums: ${{ steps.sums.outputs.sums }}'))
})

Deno.test('every action is pinned to a commit, nothing is cached and no token stays on disk', () => {
  const uses = workflowLines().filter((line) => line.includes('uses:'))
  assert(uses.length > 0)
  for (const line of uses) assert(/uses: [\w./-]+@[0-9a-f]{40} # v\d/.test(line), line)
  assert(!workflow().includes('actions/cache'))
  assert(!workflowLines().some((line) => /^\s*(- )?cache:/.test(line)), 'a cache: key')
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
