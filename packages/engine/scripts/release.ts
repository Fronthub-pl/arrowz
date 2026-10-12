// What a release run does, decided from the three manifests, their history and
// npm: `plan` names the packages whose version npm does not have yet, and `tags`
// gives a git tag to every released version that is live on npm and has none,
// unless main set that version more than once: then it names it and fails.
//
//   deno run --allow-read --allow-write --allow-run --allow-env packages/engine/scripts/release.ts plan [--all]
//   deno run --allow-read --allow-run --allow-env packages/engine/scripts/release.ts tags
//
// It imports nothing, so a job runs it straight after checkout, without an install.

/** The published packages, dependencies first: the order they are staged and approved in. */
const DIRS = ['packages/engine', 'packages/board-element', 'packages/cli']

/** The value a manifest carries until its first version PR; it is never released and never tagged. */
const UNRELEASED = '0.0.0'

export interface Pkg {
  dir: string
  name: string
  version: string
}

export type Seen = 'published' | 'absent'

function errorCode(answer: unknown): string | undefined {
  if (typeof answer !== 'object' || answer === null || !('error' in answer)) return undefined
  const { error } = answer
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

/** Reads the answer of `npm view <name>@<version> version --json`; throws unless it is a clear yes or no. */
export function seenOnNpm(code: number, stdout: string, version: string): Seen {
  let answer: unknown
  try {
    answer = JSON.parse(stdout)
  } catch {
    answer = undefined
  }
  // npm 10 and 11 print the version, npm 12 prints it in a one-element array.
  const printed = Array.isArray(answer) && answer.length === 1 ? answer[0] : answer
  if (code === 0 && printed === version) return 'published'
  if (code !== 0 && errorCode(answer) === 'E404') return 'absent'
  throw new Error(`npm view did not say whether ${version} is published (status ${code}): ${stdout.slice(0, 300)}`)
}

/** The packages this run stages: every version npm does not have. */
export function planOf(pkgs: Pkg[], seen: (p: Pkg) => Seen): Pkg[] {
  return pkgs.filter((p) => p.version !== UNRELEASED && seen(p) === 'absent')
}

export function tagOf(p: Pkg): string {
  return `${p.name}@${p.version}`
}

/**
 * A version a package has had on this branch, with the commit that set it. A version that left the manifest
 * and came back (a version pull request reverted, or merged again) was set once per stretch: `sha` began the
 * newest stretch and `earlier` lists the commits that began the older ones, newest first.
 */
export interface Release {
  pkg: Pkg
  sha: string
  earlier: string[]
}

/**
 * Of the released versions without a tag: the ones live on npm, the ones npm does not have, and the live
 * ones the branch set more than once. The history does not say which of their stretches was released, so
 * no tag is due for those.
 */
export function tagsDue(
  released: Release[],
  seen: (p: Pkg) => Seen,
  tags: Set<string>,
): { due: Release[]; waiting: Pkg[]; twice: Release[] } {
  const due: Release[] = []
  const waiting: Pkg[] = []
  const twice: Release[] = []
  for (const release of released) {
    if (release.pkg.version === UNRELEASED || tags.has(tagOf(release.pkg))) continue
    if (seen(release.pkg) !== 'published') waiting.push(release.pkg)
    else if (release.earlier.length > 0) twice.push(release)
    else due.push(release)
  }
  return { due, waiting, twice }
}

/**
 * The versions in a manifest's history, newest commit first, back to the placeholder: each with the oldest
 * commit of its newest stretch as `sha` and the oldest commit of every older stretch in `earlier`, newest
 * first. A commit without a version ends the walk as the placeholder does, so what a manifest carried before
 * its first version pull request is never a release.
 */
export function releasesIn(
  history: Iterable<{ sha: string; version: string | undefined }>,
): { version: string; sha: string; earlier: string[] }[] {
  const found: { version: string; sha: string; earlier: string[] }[] = []
  let stretch: string | undefined
  let open: { version: string; sha: string; earlier: string[] } | undefined
  for (const { sha, version } of history) {
    if (version === undefined || version === UNRELEASED) break
    if (version !== stretch) {
      stretch = version
      open = found.find((release) => release.version === version)
      if (open) open.earlier.push(sha)
      else found.push(open = { version, sha, earlier: [] })
    } else if (open) {
      // One commit further down the stretch the walk is in: the newest one, or the last of the older ones.
      if (open.earlier.length > 0) open.earlier[open.earlier.length - 1] = sha
      else open.sha = sha
    }
  }
  return found
}

/** Of the commits that changed a manifest, newest first, the oldest one since the version became `version`. */
export function releaseCommit(history: { sha: string; version: string }[], version: string): string | undefined {
  let found: string | undefined
  for (const commit of history) {
    if (commit.version !== version) break
    found = commit.sha
  }
  return found
}

function sh(command: string, args: string[], cwd = '.'): { code: number; out: string; err: string } {
  const r = new Deno.Command(command, { args, cwd, stdout: 'piped', stderr: 'piped' }).outputSync()
  const decoder = new TextDecoder()
  return { code: r.code, out: decoder.decode(r.stdout), err: decoder.decode(r.stderr) }
}

function git(cwd: string, ...args: string[]): string {
  const r = sh('git', args, cwd)
  if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.err}`)
  return r.out
}

export function manifestOf(dir: string, text: string): Pkg {
  const { name, version } = JSON.parse(text) as { name?: unknown; version?: unknown }
  if (typeof name !== 'string' || name === '' || typeof version !== 'string' || version === '') {
    throw new Error(`${dir}/package.json needs a name and a version, both non-empty strings`)
  }
  return { dir, name, version }
}

function onNpm(p: Pkg): Seen {
  const r = sh('npm', ['view', tagOf(p), 'version', '--json'])
  return seenOnNpm(r.code, r.out, p.version)
}

/** The first-parent commits that changed a package's manifest, newest first. */
function manifestCommits(dir: string, cwd: string): string[] {
  // A grafted tip looks like the commit that added the manifest.
  if (git(cwd, 'rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error(
      'the history is shallow, so the commit of a version is unknown: fetch the full history (fetch-depth: 0)',
    )
  }
  const log = git(cwd, 'log', '--first-parent', '--format=%H', '--', `${dir}/package.json`)
  return log.trim().split('\n').filter((line) => line !== '')
}

/** What `versionAt` answers for a manifest that is not JSON. */
const NOT_JSON = Symbol('not JSON')

/**
 * The version a manifest carried at a commit. Undefined when the commit has no manifest or its manifest names
 * no version: there the walk ends. `NOT_JSON` for a manifest that cannot be parsed. A git failure throws.
 */
function versionAt(sha: string, dir: string, cwd: string): string | undefined | typeof NOT_JSON {
  const path = `${dir}/package.json`
  // `git show` fails alike for a path the commit lacks and for an object that is gone; `ls-tree` prints nothing for the first.
  if (git(cwd, 'ls-tree', sha, '--', path).trim() === '') return undefined
  let manifest: unknown
  try {
    manifest = JSON.parse(git(cwd, 'show', `${sha}:${path}`))
  } catch (error) {
    if (error instanceof SyntaxError) return NOT_JSON
    throw error
  }
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)) return undefined
  return typeof manifest.version === 'string' && manifest.version !== '' ? manifest.version : undefined
}

/**
 * A manifest's history, newest first, read one commit at a time: nothing below the commit that ends the walk
 * is read. A commit whose manifest is not JSON is left out, so the stretch of a version closes over it; no
 * release run passes on such a commit, so a version that is live was released from the commit that set it.
 */
function* historyOf(dir: string, cwd: string): Generator<{ sha: string; version: string | undefined }> {
  for (const sha of manifestCommits(dir, cwd)) {
    const version = versionAt(sha, dir, cwd)
    if (version !== NOT_JSON) yield { sha, version }
  }
}

/** Every version of a package since its placeholder, oldest first, with the commit that set it. */
export function releasedOf(p: Pkg, cwd = '.'): Release[] {
  return releasesIn(historyOf(p.dir, cwd)).reverse().map(({ version, sha, earlier }) => ({
    pkg: { ...p, version },
    sha,
    earlier,
  }))
}

/**
 * The first-parent commit that set the package's current version: on main, the version PR's merge.
 * It does not know what was built; `plan` checks that.
 */
export function commitOf(p: Pkg, cwd = '.'): string {
  const history: { sha: string; version: string }[] = []
  for (const sha of manifestCommits(p.dir, cwd)) {
    const version = manifestOf(p.dir, git(cwd, 'show', `${sha}:${p.dir}/package.json`)).version
    history.push({ sha, version })
    if (version !== p.version) break
  }
  const sha = releaseCommit(history, p.version)
  if (!sha) throw new Error(`no commit on this branch sets ${tagOf(p)}`)
  return sha
}

/**
 * The files of a package that differ between `sha`, the commit that set its version, and HEAD; neither tests
 * nor anything under `scripts/` is packed or part of a build. Leaving `scripts/` out rests on that: tests
 * hold every build script, the engine's build list and every source file clear of that directory.
 */
export function changedSince(p: Pkg, sha: string, cwd = '.'): string[] {
  const out = git(
    cwd,
    'diff',
    '--name-only',
    sha,
    'HEAD',
    '--',
    p.dir,
    `:(exclude)${p.dir}/scripts`,
    `:(exclude,glob)${p.dir}/**/*.test.ts`,
    `:(exclude,glob)${p.dir}/**/*.test.tsx`,
  )
  return out.split('\n').filter((line) => line !== '')
}

/** A dependency inside the workspace whose version is not the one it had at a package's version commit. */
export interface Moved {
  name: string
  then: string
  now: string
}

/** The names a manifest depends on through the workspace; `pnpm pack` writes each as the version of the day. */
export function workspaceDepsOf(text: string): string[] {
  const manifest = JSON.parse(text) as Record<string, unknown>
  const names: string[] = []
  for (const kind of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = manifest[kind]
    if (typeof deps !== 'object' || deps === null) continue
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:') && !names.includes(name)) names.push(name)
    }
  }
  return names
}

/**
 * The published packages `p` depends on through the workspace whose version at HEAD differs from the one at
 * `sha`, `p`'s version commit: packed today, `p` would carry another range than the version that was reviewed.
 */
export function depsMovedSince(p: Pkg, pkgs: Pkg[], sha: string, cwd = '.'): Moved[] {
  const names = workspaceDepsOf(git(cwd, 'show', `HEAD:${p.dir}/package.json`))
  const deps = pkgs.filter((dep) => names.includes(dep.name))
  if (deps.length === 0) return []
  const moved: Moved[] = []
  for (const dep of deps) {
    const then = manifestOf(dep.dir, git(cwd, 'show', `${sha}:${dep.dir}/package.json`)).version
    if (then !== dep.version) moved.push({ name: dep.name, then, now: dep.version })
  }
  return moved
}

/**
 * One line per reason a package may not be released: its files changed since its version commit, or a
 * workspace dependency has another version than it had then. Empty when the plan stands.
 */
export function refusalsOf(
  release: Pkg[],
  changed: (p: Pkg) => string[],
  moved: (p: Pkg) => Moved[],
  commit: (p: Pkg) => string,
): string[] {
  const lines: string[] = []
  for (const p of release) {
    const files = changed(p)
    if (files.length > 0) {
      lines.push(`refused ${tagOf(p)}: ${files.join(', ')} changed since ${commit(p).slice(0, 7)} set the version`)
    }
    for (const dep of moved(p)) {
      lines.push(
        `refused ${tagOf(p)}: ${dep.name} was ${dep.then} when ${
          commit(p).slice(0, 7)
        } set the version and is ${dep.now} now`,
      )
    }
  }
  return lines
}

const ADVICE = 'A version is released from the files of its version commit. ' +
  'If a release of it is still running or waiting for approval, let that finish; otherwise open a new version pull request.'

/** What a plan run prints and how it ends: a refusal ends it with status 1 and without the list of directories. */
export function planOutcome(
  pkgs: Pkg[],
  release: Pkg[],
  refusals: string[],
): { out: string[]; err: string[]; dirs?: string; code: 0 | 1 } {
  if (refusals.length > 0) return { out: [], err: [...refusals, ADVICE], code: 1 }
  return {
    out: pkgs.map((p) => `${release.includes(p) ? 'release' : 'skip   '} ${tagOf(p)}`),
    err: [],
    dirs: release.map((p) => p.dir).join(' '),
    code: 0,
  }
}

/** The command of the `tag-published` job; a maintainer runs the same one from a checkout of main. */
export const TAGS_COMMAND = 'deno run --allow-read --allow-run --allow-env packages/engine/scripts/release.ts tags'

/** The workflow files that differ between a commit and HEAD. */
export function workflowsChangedSince(sha: string, cwd = '.'): string[] {
  const out = git(cwd, 'diff', '--name-only', sha, 'HEAD', '--', '.github/workflows')
  return out.split('\n').filter((line) => line !== '')
}

/** Creates the tag on origin alone: a local tag would stop the next try after a refused push. */
export function pushTag(tag: string, sha: string, cwd = '.'): void {
  git(cwd, 'push', 'origin', `${sha}:refs/tags/${tag}`)
}

/**
 * What a tags run prints and how it ends: every due tag is tried, and one that could not be pushed ends the
 * run with status 1, as does a version of `twice`, which is named with its commits, oldest first, for a tag
 * made by hand. GitHub refuses a workflow's token a tag on a commit whose workflow files differ from the
 * run's, so on the runner such a refusal is answered with the command to run from a checkout.
 */
export function tagsOutcome(
  due: Release[],
  waiting: Pkg[],
  twice: Release[],
  push: (p: Pkg, sha: string) => void,
  changed: (sha: string) => string[],
  onRunner: boolean,
): { out: string[]; err: string[]; code: 0 | 1 } {
  const out = waiting.map((p) => `not live on npm, so not tagged: ${tagOf(p)}`)
  if (due.length === 0 && twice.length === 0) {
    return { out: [...out, 'nothing to tag: no untagged version is live on npm'], err: [], code: 0 }
  }
  // Named before any refused push: a log that carries the command to run from a checkout ends with it.
  const err = twice.map(({ pkg: p, sha, earlier }) => {
    const commits = [...earlier.toReversed(), sha].map((commit) => commit.slice(0, 7)).join(', ')
    return `not tagged ${tagOf(p)}: the version was set more than once on main (${commits}); tag it by hand`
  })
  let advise = false
  for (const { pkg: p, sha } of due) {
    try {
      push(p, sha)
      out.push(`tagged ${tagOf(p)} at ${sha.slice(0, 7)}`)
    } catch (error) {
      err.push(`error: ${(error instanceof Error ? error.message : String(error)).trimEnd()}`)
      const files = onRunner ? changed(sha) : []
      if (files.length === 0) continue
      err.push(
        `not tagged ${tagOf(p)}: ${files.join(', ')} changed since ${sha.slice(0, 7)} set the version, ` +
          "and the workflow's token cannot push a tag across a workflow change",
      )
      advise = true
    }
  }
  if (advise) err.push(`From an up-to-date checkout of main, run: ${TAGS_COMMAND}`)
  return { out, err, code: err.length > 0 ? 1 : 0 }
}

function main(): void {
  const [command, ...flags] = Deno.args
  const pkgs = DIRS.map((dir) => manifestOf(dir, Deno.readTextFileSync(`${dir}/package.json`)))
  if (command === 'plan') {
    const release = flags.includes('--all') ? pkgs : planOf(pkgs, onNpm)
    // One walk of the history per package, and none for a package no refusal is computed for.
    const commits = new Map<string, string>()
    const commit = (p: Pkg): string => {
      const known = commits.get(p.dir)
      if (known !== undefined) return known
      const sha = commitOf(p)
      commits.set(p.dir, sha)
      return sha
    }
    const changed = (p: Pkg) => changedSince(p, commit(p))
    const moved = (p: Pkg) => depsMovedSince(p, pkgs, commit(p))
    const refusals = flags.includes('--all') ? [] : refusalsOf(release, changed, moved, commit)
    const outcome = planOutcome(pkgs, release, refusals)
    for (const line of outcome.err) console.error(line)
    for (const line of outcome.out) console.log(line)
    const output = Deno.env.get('GITHUB_OUTPUT')
    if (output && outcome.dirs !== undefined) {
      Deno.writeTextFileSync(output, `dirs=${outcome.dirs}\n`, { append: true })
    }
    if (outcome.code !== 0) Deno.exit(outcome.code)
  } else if (command === 'tags') {
    const remote = git('.', 'ls-remote', '--tags', 'origin').split('\n').map((line) => line.split('refs/tags/')[1])
    const tags = new Set(remote.filter((tag): tag is string => tag !== undefined))
    const onRunner = Deno.env.get('GITHUB_ACTIONS') === 'true'
    const push = (p: Pkg, sha: string) => pushTag(tagOf(p), sha)
    const { due, waiting, twice } = tagsDue(pkgs.flatMap((p) => releasedOf(p)), onNpm, tags)
    const outcome = tagsOutcome(due, waiting, twice, push, workflowsChangedSince, onRunner)
    for (const line of outcome.out) console.log(line)
    for (const line of outcome.err) console.error(line)
    if (outcome.code !== 0) Deno.exit(outcome.code)
  } else {
    console.error('usage: release.ts plan [--all] | tags')
    Deno.exit(2)
  }
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
    Deno.exit(1)
  }
}
