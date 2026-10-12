// The gate on the packed tarballs: what it lets through and what it names.
import { assert, assertEquals, assertRejects, assertThrows } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { ENGINE_MODULES, type Entry, problems, RULES, tarballName, untar } from './scripts/pack-check.ts'

const enc = new TextEncoder()
const file = (path: string, text = ''): Entry => ({ path, bytes: enc.encode(text) })
const entry = (name: string) => ({ types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` })
const dist = (...names: string[]) => names.flatMap((n) => [`dist/${n}.js`, `dist/${n}.d.ts`])

/** What the three manifests share. */
const COMMON = { type: 'module', engines: { node: '>=22.12' } }

const ENGINE = {
  name: '@fronthub/arrowz-engine',
  version: '0.1.0',
  ...COMMON,
  sideEffects: false,
  exports: { '.': entry('mod'), './command': entry('command'), './simple': entry('lab-simple') },
  scripts: { build: 'tsc', smoke: 'node scripts/node-smoke.mjs' },
}
const ENGINE_FILES = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  ...dist(...ENGINE_MODULES),
]
const BOARD = {
  name: '@fronthub/arrowz-board',
  version: '0.1.0',
  ...COMMON,
  sideEffects: ['./dist/arrowz-board.js', './dist/mod.js'],
  exports: { '.': entry('mod') },
  dependencies: { '@fronthub/arrowz-engine': '^0.1.0', lit: '^3.3.3' },
}
const BOARD_FILES = ['README.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md', ...dist('mod', 'arrowz-board')]
const CLI = {
  name: '@fronthub/arrowz-cli',
  version: '0.1.0',
  ...COMMON,
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
  // The build emits these for the lab, and no published entry point reaches them.
  for (const lab of ['dist/lab-docs.js', 'dist/lab-docs.d.ts', 'dist/lab-report.js', 'dist/lab-report.d.ts']) {
    const found = problems(1, engine({}, [...ENGINE_FILES, lab]))
    assertEquals(found.length, 1, lab)
    assert(found[0]?.startsWith(`${lab} is not on the list`), found[0])
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
  // No entry point names these two, so only the list of modules can miss them.
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'dist/lab-i18n.js'))), ['dist/lab-i18n.js is missing'])
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'dist/types.d.ts'))), ['dist/types.d.ts is missing'])
})

const here = dirname(fromFileUrl(import.meta.url))

/** The engine modules reached from `entries` through relative imports, type-only ones included. */
function reachedFrom(entries: string[]): string[] {
  const seen = new Set<string>()
  const queue = [...entries]
  for (let module = queue.pop(); module !== undefined; module = queue.pop()) {
    if (seen.has(module)) continue
    seen.add(module)
    const source = Deno.readTextFileSync(join(here, `${module}.ts`))
    for (const found of source.matchAll(/\b(?:from\s+|import\s*\(\s*|import\s+)'\.\/([\w-]+)\.ts'/g)) {
      if (found[1] !== undefined) queue.push(found[1])
    }
  }
  return [...seen].sort()
}

Deno.test('the engine ships exactly the modules its published entry points import', () => {
  const manifest = JSON.parse(Deno.readTextFileSync(join(here, 'package.json'))) as {
    publishConfig: { exports: Record<string, { default: string }> }
  }
  const entries = Object.values(manifest.publishConfig.exports).map((e) => e.default.replace(/^\.\/dist\/|\.js$/g, ''))
  assertEquals(entries, ['mod', 'command', 'lab-simple'])
  assertEquals([...ENGINE_MODULES].sort(), reachedFrom(entries))
})

Deno.test('the engine manifest keeps out of the tarball the modules it builds for the lab alone', () => {
  const { files } = JSON.parse(Deno.readTextFileSync(join(here, 'package.json'))) as { files: string[] }
  const build = JSON.parse(Deno.readTextFileSync(join(here, 'tsconfig.build.json'))) as { include: string[] }
  const built = reachedFrom(build.include.map((f) => f.replace(/\.ts$/, '')))
  const labOnly = built.filter((m) => !ENGINE_MODULES.includes(m))
  assertEquals(labOnly, ['lab-docs', 'lab-report'])
  assertEquals(files.filter((f) => f.startsWith('!')), labOnly.map((m) => `!dist/${m}.*`))
})

Deno.test('before its first release a package has no changelog to ship', () => {
  assertEquals(problems(1, engine({ version: '0.0.0' }, without(ENGINE_FILES, 'CHANGELOG.md'))), [])
})

Deno.test('a manifest that npm 12 would not install as it is gets refused', () => {
  for (const script of ['preinstall', 'install', 'postinstall']) {
    const found = problems(1, engine({ scripts: { [script]: 'node x.js' } }))
    assertEquals(found, [`the script ${script} runs at install time, which npm 12 does not allow a dependency`])
  }
  const specs = [
    'workspace:^',
    'github:lit/lit',
    'git+https://github.com/lit/lit.git',
    'https://x.test/lit.tgz',
    'file:../lit',
    'npm:lit@^3.0.0',
    '*',
    'latest',
    '>=1.0.0',
    'link:../lit',
    'catalog:',
  ]
  for (const spec of specs) {
    const range = (kind: string) =>
      `${kind}: lit is "${spec}"; a published dependency is x.y.z, ^x.y.z or ~x.y.z from the registry`
    const own = problems(1, packed(BOARD, BOARD_FILES, { dependencies: { ...BOARD.dependencies, lit: spec } }))
    assertEquals(own, [range('dependencies')], spec)
    for (const kind of ['optionalDependencies', 'peerDependencies']) {
      const found = problems(1, packed(BOARD, BOARD_FILES, { [kind]: { lit: spec } }))
      assertEquals(found, [range(kind), `${kind}: lit is listed, and @fronthub/arrowz-board publishes none`], spec)
    }
  }
})

Deno.test('the manifest is an ES module package for the Node the packages promise', () => {
  assertEquals(problems(1, engine({ type: undefined })), ['the manifest has the type nothing, not "module"'])
  assertEquals(problems(1, engine({ type: 'commonjs' })), ['the manifest has the type "commonjs", not "module"'])
  assertEquals(problems(1, engine({ engines: undefined })), ['engines is nothing, not {"node":">=22.12"}'])
  assertEquals(problems(1, packed(CLI, CLI_FILES, { engines: { node: '>=20' } })), [
    'engines is {"node":">=20"}, not {"node":">=22.12"}',
  ])
  assertEquals(problems(1, engine({ engines: { node: '>=22.12', npm: '>=11' } })), [
    'engines is {"node":">=22.12","npm":">=11"}, not {"node":">=22.12"}',
  ])
})

Deno.test('a key that changes how a package resolves or where it installs is named', () => {
  const keys = [
    'main',
    'module',
    'browser',
    'types',
    'typings',
    'os',
    'cpu',
    'libc',
    'bundledDependencies',
    'bundleDependencies',
  ]
  for (const key of keys) {
    assertEquals(problems(1, packed(BOARD, BOARD_FILES, { [key]: './dist/mod.js' })), [
      `the manifest has ${key}, which no package of this repository publishes`,
    ])
  }
})

Deno.test('sideEffects is what the package publishes, and names files of the tarball', () => {
  assertEquals(problems(1, engine({ sideEffects: undefined })), [
    'sideEffects is nothing, but @fronthub/arrowz-engine publishes false',
  ])
  assertEquals(problems(1, packed(CLI, CLI_FILES, { sideEffects: false })), [
    'sideEffects is false, but @fronthub/arrowz-cli publishes nothing',
  ])
  // Without the list a bundler drops the import that registers the element.
  assertEquals(problems(1, packed(BOARD, BOARD_FILES, { sideEffects: false })), [
    'sideEffects is false, but @fronthub/arrowz-board publishes ["./dist/arrowz-board.js","./dist/mod.js"]',
  ])
  assertEquals(problems(1, packed(BOARD, without(BOARD_FILES, 'dist/arrowz-board.js'))), [
    'sideEffects: ./dist/arrowz-board.js is not in the tarball',
  ])
})

Deno.test('an entry point has exactly the conditions types and default, in that order', () => {
  const extra = { ...ENGINE.exports, './command': { ...entry('command'), require: './dist/command.js' } }
  assertEquals(problems(1, engine({ exports: extra })), [
    './command has the conditions types, default, require, and @fronthub/arrowz-engine publishes types, default in that order',
  ])
  // Node takes the first condition that matches: with default first, the types are never read.
  const swapped = { ...ENGINE.exports, '.': { default: './dist/mod.js', types: './dist/mod.d.ts' } }
  assertEquals(problems(1, engine({ exports: swapped })), [
    '. has the conditions default, types, and @fronthub/arrowz-engine publishes types, default in that order',
  ])
  const bare = { ...ENGINE.exports, './command': './dist/command.js' }
  assertEquals(problems(1, engine({ exports: bare })), ['./command is "./dist/command.js", not a set of conditions'])
})

Deno.test('the dependencies are exactly the ones the package publishes', () => {
  assertEquals(RULES['@fronthub/arrowz-engine']?.dependencies, [])
  assertEquals(RULES['@fronthub/arrowz-board']?.dependencies, ['@fronthub/arrowz-engine', 'lit'])
  assertEquals(RULES['@fronthub/arrowz-cli']?.dependencies, ['@fronthub/arrowz-engine'])
  // The smoke installs the three packages together, so only the gate sees a dependency that is not named.
  assertEquals(problems(1, packed(CLI, CLI_FILES, { dependencies: undefined })), [
    'dependencies: @fronthub/arrowz-engine is missing',
  ])
  assertEquals(problems(1, packed(BOARD, BOARD_FILES, { dependencies: { lit: '^3.3.3' } })), [
    'dependencies: @fronthub/arrowz-engine is missing',
  ])
  assertEquals(problems(1, engine({ dependencies: { lit: '^3.3.3' } })), [
    'dependencies: lit is not a dependency @fronthub/arrowz-engine publishes (add it to the rule if it is meant)',
  ])
})

Deno.test('the manifest names the published entry points and nothing else', () => {
  const wide = problems(1, engine({ exports: { ...ENGINE.exports, './i18n': entry('lab-simple') } }))
  assertEquals(wide.length, 1)
  assert(wide[0]?.includes('./i18n') && wide[0]?.includes('pnpm'), wide[0])
})

Deno.test('an entry point without its file or without its types is named', () => {
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'dist/command.d.ts'))), [
    'dist/command.d.ts is missing',
    './command: ./dist/command.d.ts is not in the tarball',
  ])
  const untyped = { ...ENGINE.exports, './command': { default: './dist/command.js' } }
  assertEquals(problems(1, engine({ exports: untyped })), ['./command names no types'])
  assertEquals(problems(1, engine({}, without(ENGINE_FILES, 'dist/command.js'))), [
    'dist/command.js is missing',
    './command: ./dist/command.js is not in the tarball',
  ])
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

Deno.test('the manifest names the commands the package ships and nothing else', () => {
  const nobin = { ...CLI, bin: undefined }
  assertEquals(problems(1, packed(CLI, CLI_FILES, nobin)), [
    'the manifest has no command, but @fronthub/arrowz-cli publishes arrowz (./dist/arrowz.mjs)',
  ])
  const renamed = problems(1, packed(CLI, CLI_FILES, { bin: { arrows: './dist/arrowz.mjs' } }))
  assertEquals(renamed.length, 1)
  assert(renamed[0]?.includes('arrows'), renamed[0])
  const wrong = problems(1, packed(CLI, CLI_FILES, { bin: { arrowz: './README.md' } }))
  assertEquals(wrong.length, 1)
  assert(wrong[0]?.includes('./README.md'), wrong[0])
  const extra = problems(1, engine({ bin: { engine: './dist/mod.js' } }))
  assertEquals(extra.length, 1)
  assert(extra[0]?.includes('engine'), extra[0])
})

Deno.test('a private manifest, an unknown package and a tarball without a manifest are refused', () => {
  assertEquals(problems(1, engine({ private: true })), ['the manifest is private'])
  assertEquals(problems(1, engine({ name: '@fronthub/arrowz-lab' })), [
    '@fronthub/arrowz-lab is not a package this repository publishes',
  ])
  assertEquals(problems(1, [file('README.md')]), ['the tarball has no package.json'])
})

Deno.test('the tarball is named after the scope, the name and the version, and its name is never a path', () => {
  const engine = { name: '@fronthub/arrowz-engine', version: '0.1.0' }
  assertEquals(tarballName('packages/engine', engine), 'fronthub-arrowz-engine-0.1.0.tgz')
  // The gate removes a file of this name before it packs: a path would reach outside the destination.
  const refused = 'the name or version in packages/engine/package.json does not make a file name'
  assertThrows(() => tarballName('packages/engine', { ...engine, version: '../../../victim' }), Error, refused)
  assertThrows(() => tarballName('packages/engine', { ...engine, name: '@fronthub/../../victim' }), Error, refused)
  assertThrows(() => tarballName('packages/engine', { ...engine, version: '..\\victim' }), Error, refused)
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

Deno.test('untar refuses a size it cannot read, data past the end, a path outside package/ and a repeated path', async () => {
  const sized = (size: string) => {
    const m = member('package/a.txt', 'x')
    m.set(enc.encode(size.padEnd(12, '\0')), 124)
    return m
  }
  await assertRejects(async () => await untar(await gzip(sized('zzz'))), Error, 'package/a.txt')
  await assertRejects(async () => await untar(await gzip(sized('12abc'))), Error, 'package/a.txt')
  const long = member('package/big.bin', 'x')
  long.set(enc.encode('00000100000\0'), 124)
  await assertRejects(async () => await untar(await gzip(long.subarray(0, 512 + 512))), Error, 'package/big.bin')
  await assertRejects(async () => await untar(await gzip(member('other/a.txt', 'x'))), Error, 'other/a.txt')
  await assertRejects(
    async () => await untar(await gzip(member('package/a.txt', 'x'), member('package/a.txt', 'y'))),
    Error,
    'package/a.txt',
  )
})
