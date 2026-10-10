// Packs a published package the way the release does and refuses a tarball a
// user should not receive: a file off the package's list, a size over its
// budget, a manifest npm 12 would not install as it is, then whatever publint
// and Are The Types Wrong object to.
//
//   deno run --allow-read --allow-write --allow-run --allow-env \
//     packages/engine/scripts/pack-check.ts [--out=<dir>] <package dir>...
//
// With --out the tarballs stay in that directory: the release stages those
// very files, so the gates have judged exactly what npm receives.

import { fromFileUrl, join, resolve } from '@std/path'

export interface Entry {
  path: string
  bytes: Uint8Array
}

export interface Rule {
  /** Every file of the tarball matches one of these. */
  files: RegExp[]
  /** The files the tarball cannot go without. */
  required: string[]
  /** The packed size in bytes, the number npm shows as the package size. */
  budget: number
  /** The entry points the packed manifest names, and no other. */
  exports: string[]
  /** The commands the packed manifest names, and no other. */
  bin: Record<string, string>
  /** Whether every entry point comes with type declarations. */
  typed: boolean
}

const DOCS = /^(package\.json|README\.md|LICENSE|CHANGELOG\.md)$/
/** tsc emits one flat directory: a nested path or another extension is not ours. */
const FLAT_DIST = /^dist\/[a-z0-9-]+\.(js|d\.ts)$/
const ALWAYS = ['package.json', 'README.md', 'LICENSE']

export const RULES: Record<string, Rule> = {
  '@fronthub/arrowz-engine': {
    files: [DOCS, /^NOTICE$/, FLAT_DIST],
    required: [...ALWAYS, 'NOTICE'],
    budget: 200_000,
    exports: ['.', './command', './simple'],
    bin: {},
    typed: true,
  },
  '@fronthub/arrowz-board': {
    files: [DOCS, /^NOTICE$/, FLAT_DIST],
    required: [...ALWAYS, 'NOTICE'],
    budget: 100_000,
    exports: ['.'],
    bin: {},
    typed: true,
  },
  '@fronthub/arrowz-cli': {
    files: [DOCS, /^dist\/arrowz\.mjs$/],
    required: [...ALWAYS, 'dist/arrowz.mjs'],
    budget: 30_000,
    exports: [],
    bin: { arrowz: './dist/arrowz.mjs' },
    typed: false,
  },
}

interface Packed {
  name?: string
  version?: string
  private?: boolean
  scripts?: Record<string, string>
  exports?: Record<string, { types?: string; default?: string }>
  bin?: Record<string, string>
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/** The value a manifest carries until its first version PR. */
const UNRELEASED = '0.0.0'
const inTarball = (paths: Set<string>, target: string) => paths.has(target.replace(/^\.\//, ''))

/** What is wrong with a packed tarball, one sentence per fault; empty when a user can receive it. */
export function problems(packedBytes: number, entries: Entry[]): string[] {
  const raw = entries.find((e) => e.path === 'package.json')
  if (!raw) return ['the tarball has no package.json']
  const m = JSON.parse(new TextDecoder().decode(raw.bytes)) as Packed
  const rule = RULES[m.name ?? '']
  if (!rule) return [`${m.name} is not a package this repository publishes`]

  const out: string[] = []
  const paths = new Set(entries.map((e) => e.path))
  for (const path of paths) {
    if (!rule.files.some((allowed) => allowed.test(path))) {
      out.push(`${path} is not on the list of files ${m.name} ships (a stale build? delete dist/ and build again)`)
    }
  }
  const required = m.version === UNRELEASED ? rule.required : [...rule.required, 'CHANGELOG.md']
  for (const path of required) if (!paths.has(path)) out.push(`${path} is missing`)
  if (packedBytes > rule.budget) out.push(`the tarball is ${packedBytes} B, over the budget of ${rule.budget} B`)
  if (m.private) out.push('the manifest is private')

  for (const script of Object.keys(m.scripts ?? {})) {
    if (/^(pre|post)?install$/.test(script)) {
      out.push(`the script ${script} runs at install time, which npm 12 does not allow a dependency`)
    }
  }
  for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    for (const [name, range] of Object.entries(m[kind] ?? {})) {
      if (!/^[\^~]?\d+\.\d+\.\d+(-[\w.]+)?$/.test(range)) {
        out.push(`${kind}: ${name} is "${range}"; a published dependency is x.y.z, ^x.y.z or ~x.y.z from the registry`)
      }
    }
  }

  const named = Object.keys(m.exports ?? {})
  if (named.join(' ') !== rule.exports.join(' ')) {
    out.push(
      `the manifest exports ${named.join(', ') || 'nothing'}, but ${m.name} publishes ${
        rule.exports.join(', ') || 'no entry point'
      } (pack with pnpm: it applies publishConfig.exports)`,
    )
  }
  for (const [name, target] of Object.entries(m.exports ?? {})) {
    for (const kind of rule.typed ? ['types', 'default'] as const : ['default'] as const) {
      const path = target[kind]
      if (!path) out.push(`${name} names no ${kind}`)
      else if (!inTarball(paths, path)) out.push(`${name}: ${path} is not in the tarball`)
      else if (kind === 'types' && !path.endsWith('.d.ts')) {
        out.push(`${name}: the types ${path} are not a declaration file`)
      }
    }
  }
  const commands = Object.entries(m.bin ?? {})
  const wanted = Object.entries(rule.bin)
  if (JSON.stringify(commands) !== JSON.stringify(wanted)) {
    const spell = (list: [string, string][]) => list.map(([c, p]) => `${c} (${p})`).join(', ') || 'no command'
    out.push(`the manifest has ${spell(commands)}, but ${m.name} publishes ${spell(wanted)}`)
  }
  for (const [command, path] of commands) {
    if (!inTarball(paths, path)) out.push(`the command ${command}: ${path} is not in the tarball`)
  }
  return out
}

/** The regular files of a gzipped tar, without the `package/` directory npm tarballs keep them in. */
export async function untar(tgz: Uint8Array): Promise<Entry[]> {
  const stream = new Blob([tgz as BufferSource]).stream().pipeThrough(new DecompressionStream('gzip'))
  const tar = new Uint8Array(await new Response(stream).arrayBuffer())
  const text = (from: number, length: number) =>
    new TextDecoder().decode(tar.subarray(from, from + length)).replace(/\0.*$/s, '')
  const entries: Entry[] = []
  const seen = new Set<string>()
  for (let at = 0; at + 512 <= tar.length;) {
    const name = text(at, 100)
    if (name === '') break
    const sizeField = text(at + 124, 12).trim() || '0'
    if (!/^[0-7]+$/.test(sizeField)) {
      throw new Error(`tar member ${name} has the size "${sizeField}", not an octal number`)
    }
    const size = parseInt(sizeField, 8)
    if (at + 512 + size > tar.length) throw new Error(`tar member ${name} runs past the end of the archive`)
    const type = text(at + 156, 1)
    const prefix = text(at + 345, 155)
    if (type === '0' || type === '') {
      const full = prefix ? `${prefix}/${name}` : name
      if (!full.startsWith('package/')) throw new Error(`tar member ${full} is not under package/`)
      const path = full.slice('package/'.length)
      if (seen.has(path)) throw new Error(`tar member ${full} appears twice`)
      seen.add(path)
      entries.push({ path, bytes: tar.subarray(at + 512, at + 512 + size) })
    } else if (type !== '5') {
      throw new Error(`tar member ${name} has type ${type}, which the gate does not read`)
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return entries
}

function run(command: string, args: string[], cwd: string): { ok: boolean; text: string } {
  const r = new Deno.Command(command, { args, cwd, stdout: 'piped', stderr: 'piped' }).outputSync()
  const decoder = new TextDecoder()
  return { ok: r.success, text: decoder.decode(r.stdout) + decoder.decode(r.stderr) }
}

interface Manifest {
  name: string
  version: string
}

function removeIfThere(path: string): void {
  try {
    Deno.removeSync(path)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
  }
}

/** The file `pnpm pack` writes for a manifest; throws when the name or the version would make it a path. */
export function tarballName(dir: string, manifest: Manifest): string {
  const file = `${manifest.name.slice(1).replace('/', '-')}-${manifest.version}.tgz`
  if (/[/\\]/.test(file)) throw new Error(`the name or version in ${dir}/package.json does not make a file name`)
  return file
}

/** Packs one package into `dest` as `file` and returns everything the gates hold against the tarball. */
async function check(dir: string, dest: string, manifest: Manifest, file: string): Promise<string[]> {
  const root = fromFileUrl(new URL('../../..', import.meta.url))
  const tgz = join(dest, file)
  // A tarball left by an earlier run must not pass for one this run packed.
  removeIfThere(tgz)
  const packed = run('pnpm', ['pack', '--pack-destination', dest], dir)
  if (!packed.ok) return [`pnpm pack failed:\n${packed.text}`]
  let bytes: Uint8Array
  try {
    bytes = Deno.readFileSync(tgz)
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [`pnpm pack wrote no ${file}`]
    throw error
  }
  const found = problems(bytes.length, await untar(bytes))

  const lint = run('pnpm', ['exec', 'publint', 'run', tgz, '--strict'], root)
  if (!lint.ok) found.push(`publint:\n${lint.text}`)
  if (RULES[manifest.name]?.typed) {
    const types = run('pnpm', ['exec', 'attw', tgz, '--profile', 'esm-only'], root)
    if (!types.ok) found.push(`Are The Types Wrong:\n${types.text}`)
  }
  return found
}

if (import.meta.main) {
  const flags = Deno.args.filter((a) => a.startsWith('--'))
  const dirs = Deno.args.filter((a) => !a.startsWith('--'))
  const out = flags.find((a) => a.startsWith('--out='))?.slice('--out='.length)
  if (dirs.length === 0 || out === '' || flags.some((a) => !a.startsWith('--out='))) {
    console.error('usage: pack-check.ts [--out=<dir>] <package dir>...')
    Deno.exit(2)
  }
  const dest = resolve(out ?? Deno.makeTempDirSync({ prefix: 'arrowz-pack-' }))
  let failed = false
  try {
    Deno.mkdirSync(dest, { recursive: true })
    for (const dir of dirs) {
      let label = dir
      let found: string[]
      try {
        const manifest = JSON.parse(Deno.readTextFileSync(join(resolve(dir), 'package.json'))) as Manifest
        label = manifest.name
        found = await check(resolve(dir), dest, manifest, tarballName(dir, manifest))
      } catch (error) {
        found = [error instanceof Error ? error.message : String(error)]
      }
      console.log(found.length ? `FAIL ${label}\n${found.map((p) => `  - ${p}`).join('\n')}` : `ok   ${label}`)
      failed ||= found.length > 0
    }
  } finally {
    if (out === undefined) Deno.removeSync(dest, { recursive: true })
  }
  Deno.exit(failed ? 1 : 0)
}
