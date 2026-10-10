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
    typed: true,
  },
  '@fronthub/arrowz-board': {
    files: [DOCS, /^NOTICE$/, FLAT_DIST],
    required: [...ALWAYS, 'NOTICE'],
    budget: 100_000,
    exports: ['.'],
    typed: true,
  },
  '@fronthub/arrowz-cli': {
    files: [DOCS, /^dist\/arrowz\.mjs$/],
    required: [...ALWAYS, 'dist/arrowz.mjs'],
    budget: 30_000,
    exports: [],
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
    if (/^(pre|post)?install$|^prepare$/.test(script)) {
      out.push(`the script ${script} runs at install time, which npm 12 does not allow a dependency`)
    }
  }
  for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    for (const [name, range] of Object.entries(m[kind] ?? {})) {
      if (!/^[\^~]?\d+\.\d+\.\d+(-[\w.]+)?$/.test(range)) {
        out.push(`${kind}: ${name} is "${range}", not a version range from the registry`)
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
  for (const [command, path] of Object.entries(m.bin ?? {})) {
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
  for (let at = 0; at + 512 <= tar.length;) {
    const name = text(at, 100)
    if (name === '') break
    const size = parseInt(text(at + 124, 12).trim() || '0', 8)
    const type = text(at + 156, 1)
    const prefix = text(at + 345, 155)
    if (type === '0' || type === '') {
      const path = (prefix ? `${prefix}/${name}` : name).replace(/^package\//, '')
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

/** Packs one package into `dest` and returns everything the gates hold against the tarball. */
async function check(dir: string, dest: string): Promise<string[]> {
  const root = fromFileUrl(new URL('../../..', import.meta.url))
  const manifest = JSON.parse(Deno.readTextFileSync(join(dir, 'package.json'))) as { name: string; version: string }
  const packed = run('pnpm', ['pack', '--pack-destination', dest], dir)
  if (!packed.ok) return [`pnpm pack failed:\n${packed.text}`]
  const tgz = join(dest, `${manifest.name.slice(1).replace('/', '-')}-${manifest.version}.tgz`)
  const bytes = Deno.readFileSync(tgz)
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
  const out = Deno.args.find((a) => a.startsWith('--out='))?.slice('--out='.length)
  const dirs = Deno.args.filter((a) => !a.startsWith('--'))
  if (dirs.length === 0) {
    console.error('usage: pack-check.ts [--out=<dir>] <package dir>...')
    Deno.exit(2)
  }
  const dest = resolve(out ?? Deno.makeTempDirSync({ prefix: 'arrowz-pack-' }))
  Deno.mkdirSync(dest, { recursive: true })
  let failed = false
  for (const dir of dirs) {
    const found = await check(resolve(dir), dest)
    console.log(found.length ? `FAIL ${dir}\n${found.map((p) => `  - ${p}`).join('\n')}` : `ok   ${dir}`)
    failed ||= found.length > 0
  }
  if (!out) Deno.removeSync(dest, { recursive: true })
  Deno.exit(failed ? 1 : 0)
}
