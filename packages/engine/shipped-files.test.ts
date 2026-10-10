// What the three packages ship: manifests npm can publish and install, licence
// files that are copies of the repository's, and a NOTICE that lists the
// sources the built-in themes record in `look.ts`.
import { assert, assertEquals } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { THEMES } from './look.ts'

const root = join(dirname(fromFileUrl(import.meta.url)), '..', '..')
const read = (...path: string[]): string => Deno.readTextFileSync(join(root, ...path))

/** The packages that carry or re-export the themes, and so ship NOTICE. */
const THEMED = ['engine', 'board-element']
const PACKAGES = [...THEMED, 'cli']

Deno.test('each package ships the repository LICENSE, byte for byte', () => {
  for (const pkg of PACKAGES) assertEquals(read('packages', pkg, 'LICENSE'), read('LICENSE'), pkg)
})

Deno.test('beside a manifest only README.md and LICENSE bear a name the packer always ships', () => {
  // pnpm packs a root file named readme* or licen[cs]e* whatever `files` and .npmignore say.
  for (const pkg of PACKAGES) {
    const names = [...Deno.readDirSync(join(root, 'packages', pkg))].filter((e) => e.isFile).map((e) => e.name)
    assertEquals(names.filter((n) => /^(readme|licen[cs]e)/i.test(n)).sort(), ['LICENSE', 'README.md'], pkg)
  }
})

Deno.test('the packages with themes ship the repository NOTICE, and pack it', () => {
  for (const pkg of THEMED) {
    assertEquals(read('packages', pkg, 'NOTICE'), read('NOTICE'), pkg)
    // npm packs LICENSE by itself, but NOTICE only when `files` names it.
    const { files } = JSON.parse(read('packages', pkg, 'package.json')) as { files: string[] }
    assert(files.includes('NOTICE'), `${pkg}: "files" leaves NOTICE out of the tarball`)
  }
})

interface Manifest {
  name: string
  license?: string
  private?: boolean
  engines?: { node?: string }
  publishConfig?: { access?: string }
  repository?: { url?: string; directory?: string }
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  bin?: Record<string, string>
  files?: string[]
}
const manifest = (pkg: string): Manifest => JSON.parse(read('packages', pkg, 'package.json')) as Manifest

Deno.test('every published manifest names its licence, its home in the repository and public access', () => {
  for (const pkg of PACKAGES) {
    const m = manifest(pkg)
    assertEquals(
      [m.private, m.license, m.engines?.node, m.publishConfig?.access, m.repository?.directory, m.repository?.url],
      [undefined, 'MIT', '>=22.12', 'public', `packages/${pkg}`, 'git+https://github.com/Fronthub-pl/arrowz.git'],
      pkg,
    )
  }
})

Deno.test('a published package installs with scripts off and from the registry alone', () => {
  // npm 12 runs no dependency script and resolves no git or URL dependency unless the consumer allows it.
  for (const pkg of PACKAGES) {
    const m = manifest(pkg)
    const lifecycle = Object.keys(m.scripts ?? {}).filter((s) => /^(pre|post)?install$|^prepare$/.test(s))
    assertEquals(lifecycle, [], pkg)
    for (const [name, range] of Object.entries(m.dependencies ?? {})) {
      assert(/^(workspace:)?[\^~]?\d/.test(range) || range === 'workspace:^', `${pkg}: ${name} is ${range}`)
    }
  }
})

Deno.test('the CLI package is the arrowz command over the published engine', () => {
  const m = manifest('cli')
  assertEquals(m.name, '@fronthub/arrowz-cli')
  assertEquals(m.bin, { arrowz: './dist/arrowz.mjs' })
  assertEquals(m.dependencies, { '@fronthub/arrowz-engine': 'workspace:^' })
  assertEquals(m.files, ['dist', 'LICENSE', 'CHANGELOG.md'])
})

Deno.test('every published package packs its changelog', () => {
  // pnpm packs CHANGELOG.md only when `files` names it; the file arrives with the package's first release.
  for (const pkg of PACKAGES) {
    assert(manifest(pkg).files?.includes('CHANGELOG.md'), `${pkg}: "files" leaves CHANGELOG.md out of the tarball`)
  }
})

Deno.test('only package.json carries the engine version', () => {
  // Changesets bumps package.json alone, so a version in deno.json would go stale at the first release.
  const deno = JSON.parse(read('packages', 'engine', 'deno.json')) as Record<string, unknown>
  assertEquals('version' in deno, false)
})

Deno.test('NOTICE lists the sources of the themes, each with its licence and address', () => {
  const listed = read('NOTICE').split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => line.trim().split(/ {2,}/))
  const sources = new Map(Object.values(THEMES).map((t) => [t.source, [t.source, t.licence, t.url]]))
  assertEquals(listed, [...sources.values()])
})
