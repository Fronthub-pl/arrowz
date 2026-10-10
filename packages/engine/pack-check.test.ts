// The gate on the packed tarballs: what it lets through and what it names.
import { assert, assertEquals, assertRejects } from '@std/assert'
import { type Entry, problems, RULES, untar } from './scripts/pack-check.ts'

const enc = new TextEncoder()
const file = (path: string, text = ''): Entry => ({ path, bytes: enc.encode(text) })
const entry = (name: string) => ({ types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` })
const dist = (...names: string[]) => names.flatMap((n) => [`dist/${n}.js`, `dist/${n}.d.ts`])

const ENGINE = {
  name: '@fronthub/arrowz-engine',
  version: '0.1.0',
  exports: { '.': entry('mod'), './command': entry('command'), './simple': entry('lab-simple') },
  scripts: { build: 'tsc', smoke: 'node scripts/node-smoke.mjs' },
}
const ENGINE_FILES = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  ...dist('mod', 'command', 'lab-simple', 'engine'),
]
const BOARD = {
  name: '@fronthub/arrowz-board',
  version: '0.1.0',
  exports: { '.': entry('mod') },
  dependencies: { '@fronthub/arrowz-engine': '^0.1.0', lit: '^3.3.3' },
}
const BOARD_FILES = ['README.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md', ...dist('mod', 'arrowz-board')]
const CLI = {
  name: '@fronthub/arrowz-cli',
  version: '0.1.0',
  bin: { arrowz: './dist/arrowz.mjs' },
  dependencies: { '@fronthub/arrowz-engine': '^0.1.0' },
}
const CLI_FILES = ['README.md', 'LICENSE', 'CHANGELOG.md', 'dist/arrowz.mjs']

/** A tarball as the gate sees it: the manifest, changed where a case needs it, and empty files. */
function packed(base: object, paths: string[], change: object = {}): Entry[] {
  return [file('package.json', JSON.stringify({ ...base, ...change })), ...paths.map((p) => file(p))]
}
const engine = (change: object = {}, paths = ENGINE_FILES) => packed(ENGINE, paths, change)
const without = (paths: string[], gone: string) => paths.filter((p) => p !== gone)

Deno.test('a clean tarball of each package has no problem', () => {
  assertEquals(problems(1, engine()), [])
  assertEquals(problems(1, packed(BOARD, BOARD_FILES)), [])
  assertEquals(problems(1, packed(CLI, CLI_FILES)), [])
})

Deno.test('a file off the package list is named', () => {
  for (const stray of ['dist/engine.test.js', 'dist/engine.ts', 'dist/sub/deep.js', 'binding.gyp', 'engine.ts']) {
    const found = problems(1, engine({}, [...ENGINE_FILES, stray]))
    assertEquals(found.length, 1, stray)
    assert(found[0]?.startsWith(`${stray} is not on the list`), found[0])
  }
  // The CLI ships one file of code: a second one in dist/ is a stale build.
  const stale = problems(1, packed(CLI, [...CLI_FILES, 'dist/lab-page.js']))
  assertEquals(stale.length, 1)
  assert(stale[0]?.startsWith('dist/lab-page.js is not on the list'), stale[0])
})

Deno.test('a tarball over its budget is refused, one at the budget is not', () => {
  const budget = RULES['@fronthub/arrowz-engine']?.budget ?? 0
  assertEquals(budget, 200_000)
  assertEquals(RULES['@fronthub/arrowz-board']?.budget, 100_000)
  assertEquals(RULES['@fronthub/arrowz-cli']?.budget, 30_000)
  assertEquals(problems(budget, engine()), [])
  assertEquals(problems(budget + 1, engine()), ['the tarball is 200001 B, over the budget of 200000 B'])
})

Deno.test('a file the package cannot go without is named', () => {
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'LICENSE'))), ['LICENSE is missing'])
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'NOTICE'))), ['NOTICE is missing'])
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'CHANGELOG.md'))), ['CHANGELOG.md is missing'])
})

Deno.test('before its first release a package has no changelog to ship', () => {
  assertEquals(problems(1, engine({ version: '0.0.0' }, without(ENGINE_FILES, 'CHANGELOG.md'))), [])
})

Deno.test('a manifest that npm 12 would not install as it is gets refused', () => {
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare']) {
    const found = problems(1, engine({ scripts: { [script]: 'node x.js' } }))
    assertEquals(found, [`the script ${script} runs at install time, which npm 12 does not allow a dependency`])
  }
  const specs = [
    'workspace:^',
    'github:lit/lit',
    'git+https://github.com/lit/lit.git',
    'https://x.test/lit.tgz',
    'file:../lit',
  ]
  for (const spec of specs) {
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const found = problems(1, packed(BOARD, BOARD_FILES, { [kind]: { lit: spec } }))
      assertEquals(found, [`${kind}: lit is "${spec}", not a version range from the registry`], `${kind} ${spec}`)
    }
  }
})

Deno.test('the manifest names the published entry points and nothing else', () => {
  const wide = problems(1, engine({ exports: { ...ENGINE.exports, './i18n': entry('lab-simple') } }))
  assertEquals(wide.length, 1)
  assert(wide[0]?.includes('./i18n') && wide[0]?.includes('pnpm'), wide[0])
})

Deno.test('an entry point without its file or without its types is named', () => {
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'dist/command.d.ts'))), [
    './command: ./dist/command.d.ts is not in the tarball',
  ])
  const untyped = { ...ENGINE.exports, './command': { default: './dist/command.js' } }
  assertEquals(problems(1, engine({ exports: untyped })), ['./command names no types'])
  // Neither lint tool objects to types that point at JavaScript.
  const mistyped = { ...ENGINE.exports, './command': { types: './dist/command.js', default: './dist/command.js' } }
  assertEquals(problems(1, engine({ exports: mistyped })), [
    './command: the types ./dist/command.js are not a declaration file',
  ])
})

Deno.test('the command needs the file it runs', () => {
  assertEquals(problems(1, packed(CLI, without(CLI_FILES, 'dist/arrowz.mjs'))), [
    'dist/arrowz.mjs is missing',
    'the command arrowz: ./dist/arrowz.mjs is not in the tarball',
  ])
})

Deno.test('a private manifest, an unknown package and a tarball without a manifest are refused', () => {
  assertEquals(problems(1, engine({ private: true })), ['the manifest is private'])
  assertEquals(problems(1, engine({ name: '@fronthub/arrowz-lab' })), [
    '@fronthub/arrowz-lab is not a package this repository publishes',
  ])
  assertEquals(problems(1, [file('README.md')]), ['the tarball has no package.json'])
})

/** One 512-byte tar header and its padded content, the way a packer writes a member. */
function member(name: string, content: string, type = '0', prefix = ''): Uint8Array {
  const body = enc.encode(content)
  const block = new Uint8Array(512 + Math.ceil(body.length / 512) * 512)
  block.set(enc.encode(name), 0)
  block.set(enc.encode(body.length.toString(8).padStart(11, '0')), 124)
  block.set(enc.encode(type), 156)
  block.set(enc.encode(prefix), 345)
  block.set(body, 512)
  return block
}

async function gzip(...members: Uint8Array[]): Promise<Uint8Array> {
  const tar = new Blob([...members.map((m) => m as BufferSource), new Uint8Array(1024)])
  return new Uint8Array(await new Response(tar.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
}

Deno.test('untar lists the files of a tarball without the package/ prefix', async () => {
  const tgz = await gzip(
    member('package/', '', '5'),
    member('package/package.json', '{"name":"x"}'),
    member('mod.js', 'export {}', '0', 'package/dist'),
  )
  const entries = await untar(tgz)
  assertEquals(entries.map((e) => e.path), ['package.json', 'dist/mod.js'])
  assertEquals(new TextDecoder().decode(entries[0]?.bytes), '{"name":"x"}')
})

Deno.test('untar stops at a member it cannot read instead of skipping it', async () => {
  // A link or an extended header could hide a file from the list the gate judges.
  await assertRejects(async () => await untar(await gzip(member('package/link', '', '2'))), Error, 'type 2')
})
