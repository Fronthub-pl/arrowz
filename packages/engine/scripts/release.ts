// What a release run does, decided from the three manifests and from npm:
// `plan` names the packages whose version npm does not have yet, and `tags`
// gives a git tag to each version that is live on npm and has none.
//
//   deno run --allow-read --allow-write --allow-run --allow-env packages/engine/scripts/release.ts plan [--all]
//   deno run --allow-read --allow-run --allow-env packages/engine/scripts/release.ts tags
//
// It imports nothing, so a job runs it straight after checkout, without an install.

/** The published packages, dependencies first: the order they are staged and approved in. */
const DIRS = ['packages/engine', 'packages/board-element', 'packages/cli']

/** The value a manifest carries until its first version PR; on npm it is only ever a placeholder. */
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

/** The current versions that are live on npm and have no tag yet. */
export function tagsDue(pkgs: Pkg[], seen: (p: Pkg) => Seen, tags: Set<string>): Pkg[] {
  return pkgs.filter((p) => p.version !== UNRELEASED && !tags.has(tagOf(p)) && seen(p) === 'published')
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

/**
 * The first-parent commit that set the package's current version: on main, the version PR's merge.
 * It does not know what was built; `plan` checks that.
 */
export function commitOf(p: Pkg, cwd = '.'): string {
  // A grafted tip looks like the commit that added the manifest.
  if (git(cwd, 'rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error(
      'the history is shallow, so the commit of a version is unknown: fetch the full history (fetch-depth: 0)',
    )
  }
  const history: { sha: string; version: string }[] = []
  const log = git(cwd, 'log', '--first-parent', '--format=%H', '--', `${p.dir}/package.json`)
  for (const sha of log.trim().split('\n').filter((line) => line !== '')) {
    const version = manifestOf(p.dir, git(cwd, 'show', `${sha}:${p.dir}/package.json`)).version
    history.push({ sha, version })
    if (version !== p.version) break
  }
  const sha = releaseCommit(history, p.version)
  if (!sha) throw new Error(`no commit on this branch sets ${tagOf(p)}`)
  return sha
}

/**
 * The files of a package that differ between the commit that set its version and HEAD; neither tests nor
 * anything under `scripts/` is packed or part of a build. Leaving `scripts/` out rests on that: a test holds
 * every build script and the engine's build list clear of that directory.
 */
export function changedSince(p: Pkg, cwd = '.'): string[] {
  const out = git(
    cwd,
    'diff',
    '--name-only',
    commitOf(p, cwd),
    'HEAD',
    '--',
    p.dir,
    `:(exclude)${p.dir}/scripts`,
    `:(exclude,glob)${p.dir}/**/*.test.ts`,
    `:(exclude,glob)${p.dir}/**/*.test.tsx`,
  )
  return out.split('\n').filter((line) => line !== '')
}

/** One line per package that may not be released because its files changed since its version commit; empty when the plan stands. */
export function refusalsOf(release: Pkg[], changed: (p: Pkg) => string[], commit: (p: Pkg) => string): string[] {
  const lines: string[] = []
  for (const p of release) {
    const files = changed(p)
    if (files.length > 0) {
      lines.push(`refused ${tagOf(p)}: ${files.join(', ')} changed since ${commit(p).slice(0, 7)} set the version`)
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

function main(): void {
  const [command, ...flags] = Deno.args
  const pkgs = DIRS.map((dir) => manifestOf(dir, Deno.readTextFileSync(`${dir}/package.json`)))
  if (command === 'plan') {
    const release = flags.includes('--all') ? pkgs : planOf(pkgs, onNpm)
    const refusals = flags.includes('--all') ? [] : refusalsOf(release, changedSince, commitOf)
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
    const due = tagsDue(pkgs, onNpm, tags)
    for (const p of due) {
      const sha = commitOf(p)
      git('.', 'tag', tagOf(p), sha)
      git('.', 'push', 'origin', `refs/tags/${tagOf(p)}`)
      console.log(`tagged ${tagOf(p)} at ${sha.slice(0, 7)}`)
    }
    if (due.length === 0) console.log('no version went live since the last run')
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
