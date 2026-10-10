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
  if (code === 0 && answer === version) return 'published'
  if (code === 0 && stdout.trim() === '') return 'absent'
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

/** The versions that went live since the last run: on npm, and without a tag yet. */
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

function manifestOf(dir: string, text: string): Pkg {
  const { name, version } = JSON.parse(text) as { name: string; version: string }
  return { dir, name, version }
}

function onNpm(p: Pkg): Seen {
  const r = sh('npm', ['view', tagOf(p), 'version', '--json'])
  return seenOnNpm(r.code, r.out, p.version)
}

/** The first-parent commit that set the package's current version: on main, the merge the release was built from. */
export function commitOf(p: Pkg, cwd = '.'): string {
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

if (import.meta.main) {
  const [command, ...flags] = Deno.args
  const pkgs = DIRS.map((dir) => manifestOf(dir, Deno.readTextFileSync(`${dir}/package.json`)))
  if (command === 'plan') {
    const release = flags.includes('--all') ? pkgs : planOf(pkgs, onNpm)
    for (const p of pkgs) console.log(`${release.includes(p) ? 'release' : 'skip   '} ${tagOf(p)}`)
    const output = Deno.env.get('GITHUB_OUTPUT')
    if (output) Deno.writeTextFileSync(output, `dirs=${release.map((p) => p.dir).join(' ')}\n`, { append: true })
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
