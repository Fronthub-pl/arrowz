// The licence files a package ships are copies of the repository's, and NOTICE
// lists the sources the built-in themes record in `look.ts`.
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

Deno.test('NOTICE lists the sources of the themes, each with its licence and address', () => {
  const listed = read('NOTICE').split('\n')
    .filter((line) => line.startsWith('  '))
    .map((line) => line.trim().split(/ {2,}/))
  const sources = new Map(Object.values(THEMES).map((t) => [t.source, [t.source, t.licence, t.url]]))
  assertEquals(listed, [...sources.values()])
})
