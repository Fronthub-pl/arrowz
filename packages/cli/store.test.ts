import { assert, assertEquals, assertMatch, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { defaultParams, encodeBoard } from '@arrowz/engine'
import { buildCommand, COMMAND_PREFIX, DEFAULT_VIEW } from '@arrowz/engine/command'
import { deleteBoard, listBoards, saveBoard, type SaveInput } from './store.ts'
import type { BoardFile, BoardMeta, ParamKey } from '@arrowz/engine'

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
/** The file of an empty board of a size: the store does not decode it, it only has to fit the params. */
const emptyFile = (W: number, H: number): BoardFile =>
  encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

const entry = (
  { params: over, ...rest }: Partial<Omit<SaveInput, 'params'>> & { params?: Partial<Record<ParamKey, number>> } = {},
): SaveInput => {
  const p = params(over)
  return {
    board: emptyFile(p.W, p.H),
    params: p,
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: true },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 },
    ...rest,
  }
}

Deno.test('saveBoard writes the board file and the meta, and no SVG unless given', () => {
  const dir = freshDir()
  const meta = saveBoard(entry())
  assertMatch(meta.id, /^seed7-/)
  const file = entry().board
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', meta.id + '.board.json')), JSON.stringify(file))
  assert(!exists(join(dir, '25x50', meta.id + '.svg')), 'no preview without an svg')
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals(saved.pieces, 126)
  assertEquals(saved.source, 'cli')
  assertEquals(saved.fingerprint, file.fingerprint)
  assertEquals(saved.boardBytes, JSON.stringify(file).length)
  assertEquals(saved.svg, false)
  assert(saved.createdAt)
  assertEquals('simpleCommand' in saved, false, 'one dialect, so one command')
})

Deno.test('saveBoard with an svg keeps the preview; a later save without one removes it', () => {
  const dir = freshDir()
  const withSvg = saveBoard(entry({ svg: '<svg/>' }))
  assertEquals(withSvg.svg, true)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', withSvg.id + '.svg')), '<svg/>')
  const without = saveBoard(entry())
  assertEquals(without.svg, false)
  assert(!exists(join(dir, '25x50', without.id + '.svg')), 'a stale preview does not outlive the save')
})

Deno.test('saveBoard refuses a board file of another size than the params', () => {
  freshDir()
  assertThrows(() => saveBoard({ ...entry(), board: emptyFile(10, 10) }), Error, 'board file is 10x10')
})

Deno.test('saveBoard refuses params whose id is not seed<digits>-<hash>', () => {
  freshDir()
  // A cast on purpose: this is the value an unchecked caller could hand over.
  const params = { ...defaultParams(), W: 10, H: 10, seed: '../x' as unknown as number }
  assertThrows(
    () => saveBoard({ board: emptyFile(10, 10), params, view: DEFAULT_VIEW, command: 'x', source: 'cli' }),
    Error,
    'invalid board id',
  )
})

// One dialect, one command: it reproduces the board on its own, and the
// second command older metas carry is never written again.
Deno.test('saveBoard writes the one command it was given and no simpleCommand', () => {
  const dir = freshDir()
  const meta = saveBoard(entry())
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals('simpleCommand' in saved, false)
  assert(saved.command.startsWith(`${COMMAND_PREFIX} --width=`))
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

Deno.test('listBoards skips junk: foreign directories, json without a board file, broken json, JSON scalars', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, 'notes'))
  Deno.mkdirSync(join(dir, '10x10'))
  Deno.writeTextFileSync(join(dir, '10x10', 'seed1-deadbeef.json'), '{"id":"seed1-deadbeef"}') // no board file
  Deno.mkdirSync(join(dir, '25x50'))
  Deno.writeTextFileSync(join(dir, '25x50', 'broken.json'), '{not json')
  Deno.writeTextFileSync(join(dir, '25x50', 'broken.board.json'), '<svg/>')
  // Valid JSON that is not an object is not a board either.
  const scalars: Record<string, string> = { num: '5', str: '"x"', nil: 'null' }
  for (const [name, text] of Object.entries(scalars)) {
    Deno.writeTextFileSync(join(dir, '25x50', `scalar-${name}.json`), text)
    Deno.writeTextFileSync(join(dir, '25x50', `scalar-${name}.board.json`), '<svg/>')
  }
  // A board written before board files: meta and SVG, no board file. Not listed.
  Deno.writeTextFileSync(join(dir, '25x50', 'seed3-oldstore.json'), '{"id":"seed3-oldstore"}')
  Deno.writeTextFileSync(join(dir, '25x50', 'seed3-oldstore.svg'), '<svg/>')
  saveBoard(entry())
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50'])
  assertEquals(sizes[0]?.boards.length, 1)
})

// Boards saved before the arrowhead knobs (or rounded) existed carry a view
// without them; the store fills them with the defaults, as the old lab page
// did.
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
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
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
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy00.board.json'), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, 'seed7-legacy00')
  assertEquals(
    board?.view,
    { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
  )
})

// Every board written before the head height became literal stores 0, which
// meant "automatic" then and would mean "no arrowhead at all" now.
Deno.test('a board saved when the head height was automatic reads as the new default', () => {
  freshDir()
  saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const board = listBoards()[0]?.boards[0]
  // The literal 1, not DEFAULT_VIEW.headHeight: the number is the point.
  assertEquals(board?.view.headHeight, 1)
  assertEquals(DEFAULT_VIEW.headHeight, 1)
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
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
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
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy01.board.json'), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, 'seed7-legacy01')
  assertEquals(board?.params.headTries, defaultParams().headTries)
  assert(board)
  assertEquals(buildCommand(board.params).includes('undefined'), false, 'no knob is written as undefined')
})

// --- the closing report ------------------------------------------------------
// A board that did not close is stored too (the lab shows it with its holes),
// so the meta carries what the run reported: restarts and backtracks used,
// whether a time budget cut it short, and the leftover of a jam.

Deno.test('saveBoard records the closing report: restarts, backtracks, aborted and the leftover', () => {
  const dir = freshDir()
  const stuck = { remaining: 7, sizes: [4, 3], heads: 2 }
  const meta = saveBoard(entry({
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, restarts: 1, backtracks: 42, aborted: true, stuck },
  }))
  assertEquals([meta.ok, meta.restarts, meta.backtracks, meta.aborted], [false, 1, 42, true])
  assertEquals(meta.stuck, stuck)
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals([saved.ok, saved.restarts, saved.backtracks, saved.aborted], [false, 1, 42, true])
  assertEquals(saved.stuck, stuck)
})

Deno.test('saveBoard without a closing report writes null counts, aborted false and no leftover', () => {
  freshDir()
  const meta = saveBoard(entry())
  assertEquals([meta.restarts, meta.backtracks, meta.aborted, meta.stuck], [null, null, false, null])
})

// A board stored before the closing report existed lacks the fields; the
// reader fills them so the page never sees undefined.
Deno.test('listBoards fills a legacy meta without the closing report', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: 'seed7-legacy02',
    W: 25,
    H: 50,
    seed: 7,
    params: params(),
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
  }
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy02.json'), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-legacy02.board.json'), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, 'seed7-legacy02')
  assertEquals([board?.restarts, board?.backtracks, board?.aborted, board?.stuck], [null, null, false, null])
  assertEquals([board?.fingerprint, board?.boardBytes, board?.svg], [null, null, false])
})

Deno.test('listBoards without a directory returns an empty list', () => {
  const missing = join(freshDir(), 'missing')
  Deno.env.set('ARROWZ_BOARDS_DIR', missing)
  assert(!exists(missing))
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard removes the board file, the meta, the preview and an emptied size directory', () => {
  const dir = freshDir()
  const kept = saveBoard(entry({ params: { seed: 1 } }))
  const gone = saveBoard(entry({ params: { seed: 2 }, svg: '<svg/>' }))
  assertEquals(deleteBoard('25x50', gone.id), true)
  for (const ext of ['.board.json', '.json', '.svg']) assert(!exists(join(dir, '25x50', gone.id + ext)), ext)
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
