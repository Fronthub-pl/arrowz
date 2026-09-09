import { assert, assertEquals, assertMatch, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { defaultParams } from './engine.ts'
import { buildCommand, COMMAND_PREFIX } from './command.ts'
import { deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'
import type { BoardMeta, ParamKey } from './types.ts'

/** A fresh, empty store for one test: the store reads ARROWZ_BOARDS_DIR at call time. */
function freshDir(): string {
  const dir = Deno.makeTempDirSync({ prefix: 'arrowz-boards-' })
  Deno.env.set('ARROWZ_BOARDS_DIR', dir)
  return dir
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path)
    return true
  } catch {
    return false
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** The JSON as written to disk; the store wrote it, so its shape is BoardMeta. */
const readMeta = (file: string): BoardMeta => JSON.parse(Deno.readTextFileSync(file)) as BoardMeta

const params = (over: Partial<Record<ParamKey, number>> = {}) => ({
  ...defaultParams(),
  W: 25,
  H: 50,
  seed: 7,
  ...over,
})
const entry = (
  { params: over, ...rest }: Partial<Omit<SaveInput, 'params'>> & { params?: Partial<Record<ParamKey, number>> } = {},
): SaveInput => ({
  svg: '<svg/>',
  params: params(over),
  view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
  command: `${COMMAND_PREFIX} --advanced --svg --w=25 --h=50 --seed=7 --cell=12`,
  source: 'cli',
  metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 },
  ...rest,
})

Deno.test('saveBoard writes SVG and meta into the size directory', () => {
  const dir = freshDir()
  const meta = saveBoard(entry())
  assertMatch(meta.id, /^seed7-/)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', meta.id + '.svg')), '<svg/>')
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals(saved.pieces, 126)
  assertEquals(saved.source, 'cli')
  assertEquals(saved.svgBytes, 6)
  assert(saved.createdAt)
  assertEquals('simpleCommand' in saved, false, 'no simple command unless one was given')
})

// A board from the CLI simple mode carries the command as typed next to the
// full one; the full one reproduces the board, the simple one records the wish.
Deno.test('saveBoard keeps the simple command when given', () => {
  const dir = freshDir()
  const meta = saveBoard(entry({ simpleCommand: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7` }))
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals(saved.simpleCommand, `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`)
  assert(saved.command.startsWith(`${COMMAND_PREFIX} --advanced --svg `))
})

Deno.test('listBoards: sizes ascending by cells, boards newest first, same id overwrites in place', async () => {
  const dir = freshDir()
  saveBoard(entry({ params: { W: 100, H: 100, seed: 1 } }))
  const first = saveBoard(entry({ params: { seed: 1 } }))
  await sleep(5)
  saveBoard(entry({ params: { seed: 2 } }))
  await sleep(5)
  // Same id — overwrite. Recolouring a board in the lab goes this way, and
  // the board must NOT jump to the top of the list: it keeps its first
  // createdAt and records the overwrite in updatedAt.
  const again = saveBoard(entry({ svg: '<svg>2</svg>', params: { seed: 1 } }))
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50', '100x100'])
  const small = sizes[0]
  assert(small)
  assertEquals(small.boards.length, 2)
  assertEquals(small.boards.map((b) => b.seed), [2, 1], 'the overwritten board stays where it was')
  assertEquals(again.createdAt, first.createdAt, 'createdAt survives the overwrite')
  assert(again.updatedAt > first.createdAt, 'updatedAt records the overwrite')
  assertEquals(small.boards[1]?.updatedAt, again.updatedAt)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', first.id + '.svg')), '<svg>2</svg>')
})

Deno.test('listBoards skips junk: foreign directories, json without svg, broken json, JSON scalars', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, 'notes'))
  Deno.mkdirSync(join(dir, '10x10'))
  Deno.writeTextFileSync(join(dir, '10x10', 'seed1-deadbeef.json'), '{"id":"seed1-deadbeef"}') // no svg
  Deno.mkdirSync(join(dir, '25x50'))
  Deno.writeTextFileSync(join(dir, '25x50', 'broken.json'), '{not json')
  Deno.writeTextFileSync(join(dir, '25x50', 'broken.svg'), '<svg/>')
  // Valid JSON that is not an object is not a board either.
  const scalars: Record<string, string> = { num: '5', str: '"x"', nil: 'null' }
  for (const [name, text] of Object.entries(scalars)) {
    Deno.writeTextFileSync(join(dir, '25x50', `scalar-${name}.json`), text)
    Deno.writeTextFileSync(join(dir, '25x50', `scalar-${name}.svg`), '<svg/>')
  }
  saveBoard(entry())
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50'])
  assertEquals(sizes[0]?.boards.length, 1)
})

// Boards saved before the arrowhead knobs existed carry a view without
// headWidth/headHeight; the store fills them with the defaults, as the old
// lab page did with `?? 0`.
Deno.test('listBoards fills a legacy view without arrowhead fields with the defaults', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: 'seed7-legacy00',
    W: 25,
    H: 50,
    seed: 7,
    params: params(),
    view: { cell: 12, stroke: 0.5, colored: false, top: 0 },
    command: `${COMMAND_PREFIX} --advanced --svg --w=25 --h=50 --seed=7 --cell=12`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
  }
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy00.json'), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy00.svg'), '<svg/>')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, 'seed7-legacy00')
  assertEquals(board?.view, { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 })
})

// The same for params: a board saved before a knob existed does not name it.
// Without filling it here the page would re-save the board with a command
// carrying `--headtries=undefined`.
Deno.test('listBoards fills legacy params without a knob with the engine default', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacyParams: Record<string, unknown> = { ...params() }
  delete legacyParams.headTries
  const legacy = {
    id: 'seed7-legacy01',
    W: 25,
    H: 50,
    seed: 7,
    params: legacyParams,
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
    command: `${COMMAND_PREFIX} --advanced --svg --w=25 --h=50 --seed=7 --cell=12`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
  }
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy01.json'), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy01.svg'), '<svg/>')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, 'seed7-legacy01')
  assertEquals(board?.params.headTries, defaultParams().headTries)
  assert(board)
  assertEquals(buildCommand(board.params).includes('undefined'), false, 'no knob is written as undefined')
})

Deno.test('listBoards without a directory returns an empty list', () => {
  const missing = join(freshDir(), 'missing')
  Deno.env.set('ARROWZ_BOARDS_DIR', missing)
  assert(!exists(missing))
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard removes svg and json and an emptied size directory', () => {
  const dir = freshDir()
  const kept = saveBoard(entry({ params: { seed: 1 } }))
  const gone = saveBoard(entry({ params: { seed: 2 } }))
  assertEquals(deleteBoard('25x50', gone.id), true)
  assert(!exists(join(dir, '25x50', gone.id + '.svg')))
  assert(!exists(join(dir, '25x50', gone.id + '.json')))
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [kept.id])
  assertEquals(deleteBoard('25x50', kept.id), true)
  assert(!exists(join(dir, '25x50')), 'empty size directory is removed')
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard returns false for a missing board and rejects bad names', () => {
  const dir = freshDir()
  saveBoard(entry())
  assertEquals(deleteBoard('25x50', 'seed9-00000000'), false)
  assertThrows(() => deleteBoard('../25x50', 'seed7-x'), Error, 'invalid')
  assertThrows(() => deleteBoard('25x50', '../engine'), Error, 'invalid')
  assert(exists(join(dir, '25x50')))
})
