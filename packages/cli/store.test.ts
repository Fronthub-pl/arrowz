import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects, assertThrows } from '@std/assert'
import { join } from '@std/path'
import { decodeBoard, defaultParams, encodeBoard, layoutHash } from '@arrowz/engine'
import { boardId, buildCommand, COMMAND_PREFIX, DEFAULT_VIEW } from '@arrowz/engine/command'
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
const LAYOUT_ID = /^sha256-[0-9a-f]{64}$/
/** A name of the right shape for a meta written by hand: one hex digit repeated. */
const handId = (digit: string) => `sha256-${digit.repeat(64)}`

const params = (over: Partial<Record<ParamKey, number>> = {}) => ({
  ...defaultParams(),
  W: 25,
  H: 50,
  seed: 7,
  ...over,
})
/** The file of an empty board of a size. Every empty board of one size is one layout. */
const emptyFile = (W: number, H: number): BoardFile =>
  encodeBoard({ W, H, owner: new Int32Array(W * H).fill(-1), pieces: [] })

/**
 * A board of two-cell pieces lying right from the cells `heads`, numbered in
 * the order given: another list of heads is another layout, and the same heads
 * in another order are the same layout numbered differently.
 */
function boardFile(W: number, H: number, heads: number[]): BoardFile {
  const owner = new Int32Array(W * H).fill(-1)
  const pieces = heads.map((head, id) => {
    const x = head % W, y = Math.floor(head / W)
    const cells = [{ x, y }, { x: x + 1, y }]
    for (const c of cells) owner[c.y * W + c.x] = id
    return { id, dir: 3, cells }
  })
  return encodeBoard({ W, H, owner, pieces })
}

const entry = (
  { params: over, ...rest }: Partial<Omit<SaveInput, 'params'>> & { params?: Partial<Record<ParamKey, number>> } = {},
): SaveInput => {
  const p = params(over)
  return {
    board: boardFile(p.W, p.H, [0]),
    params: p,
    view: { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0, rounded: true },
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    metrics: { ok: true, pieces: 126, maxLen: 68, genMs: 12 },
    ...rest,
  }
}

Deno.test('saveBoard names the files by the layout hash and writes the board file, the meta and no SVG', async () => {
  const dir = freshDir()
  const { meta, layoutExisted, recipeExisted } = await saveBoard(entry())
  const file = entry().board
  assertMatch(meta.id, LAYOUT_ID)
  assertEquals(meta.id, await layoutHash(decodeBoard(file)))
  assertEquals([layoutExisted, recipeExisted], [false, false])
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
  assertEquals(saved.sources.map((r) => r.id), [boardId(params())])
  assertEquals(saved.sources[0]?.command, saved.command)
})

Deno.test('saveBoard with an svg keeps the preview; a later save without one removes it', async () => {
  const dir = freshDir()
  const withSvg = (await saveBoard(entry({ svg: '<svg/>' }))).meta
  assertEquals(withSvg.svg, true)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', withSvg.id + '.svg')), '<svg/>')
  const without = (await saveBoard(entry())).meta
  assertEquals(without.svg, false)
  assert(!exists(join(dir, '25x50', without.id + '.svg')), 'a stale preview does not outlive the save')
})

Deno.test('saveBoard refuses a board file of another size than the params', async () => {
  freshDir()
  await assertRejects(() => saveBoard({ ...entry(), board: emptyFile(10, 10) }), Error, 'board file is 10x10')
})

// One dialect, one command: it reproduces the board on its own, and the
// second command older metas carry is never written again.
Deno.test('saveBoard writes the one command it was given and no simpleCommand', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard(entry())
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals('simpleCommand' in saved, false)
  assert(saved.command.startsWith(`${COMMAND_PREFIX} --width=`))
})

Deno.test('listBoards: sizes ascending by cells, layouts newest first, the same recipe replaced in place', async () => {
  const dir = freshDir()
  await saveBoard(entry({ params: { W: 100, H: 100, seed: 1 } }))
  const first = (await saveBoard(entry({ params: { seed: 1 } }))).meta
  await sleep(5)
  await saveBoard(entry({ params: { seed: 2 }, board: boardFile(25, 50, [2]) }))
  await sleep(5)
  // The same layout and the same parameters: the recipe is replaced. Recolouring
  // a board in the lab goes this way, and the board must NOT jump to the top of
  // the list: it keeps its first createdAt and records the save in updatedAt.
  const again = await saveBoard(entry({ svg: '<svg>2</svg>', params: { seed: 1 } }))
  assertEquals([again.layoutExisted, again.recipeExisted], [true, true])
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50', '100x100'])
  const small = sizes[0]
  assert(small)
  assertEquals(small.boards.length, 2)
  assertEquals(small.boards.map((b) => b.seed), [2, 1], 'the saved-again layout stays where it was')
  assertEquals(again.meta.createdAt, first.createdAt, 'createdAt survives the save')
  assert(again.meta.updatedAt > first.createdAt, 'updatedAt records the save')
  assertEquals(small.boards[1]?.updatedAt, again.meta.updatedAt)
  assertEquals(again.meta.sources.length, 1, 'the same parameters replace their recipe')
  assertEquals(again.meta.sources[0]?.createdAt, first.createdAt)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', first.id + '.svg')), '<svg>2</svg>')
})

Deno.test('two parameter sets that carve one layout share its files and list both recipes', async () => {
  const dir = freshDir()
  const a = await saveBoard(entry({ params: { seed: 1 } }))
  await sleep(5)
  // 0.4, not 0.2: the default share is 0.2, and the same parameters are the same recipe.
  const b = await saveBoard(entry({
    params: { seed: 1, wShort: 0.4 },
    view: { ...entry().view, colored: true },
  }))
  assertEquals(b.meta.id, a.meta.id)
  assertEquals([b.layoutExisted, b.recipeExisted], [true, false])
  assertEquals([...Deno.readDirSync(join(dir, '25x50'))].length, 2, 'one board file and one meta')
  assertEquals(
    b.meta.sources.map((r) => r.id),
    [boardId(params({ seed: 1 })), boardId(params({ seed: 1, wShort: 0.4 }))],
  )
  assertEquals([b.meta.params.wShort, b.meta.view.colored], [0.4, true], 'the top level is the latest recipe')
  assertEquals(b.meta.createdAt, a.meta.createdAt)
  assertEquals(listBoards()[0]?.boards.length, 1)
})

// Two recipes of one layout number their pieces differently, so their files
// differ; rewriting the file would move its fingerprint, and a saved game
// against it would no longer load (spec §3).
Deno.test('a second recipe numbered differently leaves the board file as the first save wrote it', async () => {
  const dir = freshDir()
  const firstFile = boardFile(25, 50, [0, 2])
  const secondFile = boardFile(25, 50, [2, 0])
  assertNotEquals(secondFile.fingerprint, firstFile.fingerprint)
  const first = await saveBoard(entry({ params: { seed: 1 }, board: firstFile }))
  const second = await saveBoard(entry({ params: { seed: 2 }, board: secondFile }))
  assertEquals(second.meta.id, first.meta.id)
  assertEquals(Deno.readTextFileSync(join(dir, '25x50', first.meta.id + '.board.json')), JSON.stringify(firstFile))
  assertEquals([second.meta.fingerprint, second.meta.boardBytes], [first.meta.fingerprint, first.meta.boardBytes])
})

// A meta alone is not a layout: listBoards pairs it with <id>.board.json. So a
// save that finds the board file gone writes it again, rather than reporting a
// stored board that nothing lists, and the meta describes the bytes now there.
Deno.test('a save whose board file went missing writes it again and describes what is on disk', async () => {
  const dir = freshDir()
  const first = (await saveBoard(entry({ params: { seed: 1 } }))).meta
  const boardPath = join(dir, '25x50', `${first.id}.board.json`)
  Deno.removeSync(boardPath)
  assertEquals(listBoards(), [], 'a meta without its board file is not listed')
  const again = await saveBoard(entry({ params: { seed: 1 } }))
  assert(exists(boardPath), 'the save put the board file back')
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [first.id], 'the layout is listed again')
  const file = entry({ params: { seed: 1 } }).board
  assertEquals(Deno.readTextFileSync(boardPath), JSON.stringify(file))
  assertEquals(again.meta.fingerprint, file.fingerprint)
  assertEquals(again.meta.boardBytes, JSON.stringify(file).length)
  assertEquals(again.layoutExisted, true, 'the meta was on disk, so the layout existed')
})

Deno.test('a save that does not carry a figure keeps the stored one', async () => {
  freshDir()
  const stuck = { remaining: 7, sizes: [4, 3], heads: 2 }
  await saveBoard(entry({
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, restarts: 1, backtracks: 42, stuck },
  }))
  // The old lab's view edit posts four figures, and the lab server drops a null
  // exactly as it drops an absent one.
  const edit = await saveBoard(entry({
    view: { ...entry().view, stroke: 0.3 },
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: null, restarts: null, backtracks: null, stuck: null },
  }))
  assertEquals([edit.meta.genMs, edit.meta.restarts, edit.meta.backtracks], [3, 1, 42])
  assertEquals(edit.meta.stuck, stuck)
  assertEquals(edit.meta.view.stroke, 0.3)
  assertEquals(edit.meta.sources[0]?.backtracks, 42)
  // And a save that carries nothing at all keeps the layout's figures too.
  const bare = await saveBoard(entry({ metrics: {} }))
  assertEquals([bare.meta.ok, bare.meta.pieces, bare.meta.maxLen, bare.meta.stuck], [false, 10, 5, stuck])
})

Deno.test('listBoards skips junk: foreign directories, json without a board file, broken json, JSON scalars', async () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, 'notes'))
  Deno.mkdirSync(join(dir, '10x10'))
  Deno.writeTextFileSync(join(dir, '10x10', `${handId('d')}.json`), `{"id":"${handId('d')}"}`) // no board file
  Deno.mkdirSync(join(dir, '25x50'))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('b')}.json`), '{not json')
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('b')}.board.json`), '<svg/>')
  // Valid JSON that is not an object is not a board either.
  const scalars: Record<string, string> = { '1': '5', '2': '"x"', '3': 'null' }
  for (const [digit, text] of Object.entries(scalars)) {
    Deno.writeTextFileSync(join(dir, '25x50', `${handId(digit)}.json`), text)
    Deno.writeTextFileSync(join(dir, '25x50', `${handId(digit)}.board.json`), '<svg/>')
  }
  await saveBoard(entry())
  const sizes = listBoards()
  assertEquals(sizes.map((s) => s.size), ['25x50'])
  assertEquals(sizes[0]?.boards.length, 1)
})

// No migration (spec, Decisions): a board stored under the settings-hash name
// stays on disk, and the store neither lists nor deletes it.
Deno.test('a board under an old seed name is neither listed nor deleted', async () => {
  const dir = freshDir()
  const { meta } = await saveBoard(entry())
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-f48ddb0f.json'), '{"id":"seed7-f48ddb0f"}')
  Deno.writeTextFileSync(join(dir, '25x50', 'seed7-f48ddb0f.board.json'), '{}')
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [meta.id])
  assertThrows(() => deleteBoard('25x50', 'seed7-f48ddb0f'), Error, 'invalid')
  assert(exists(join(dir, '25x50', 'seed7-f48ddb0f.board.json')))
})

// Boards saved before the arrowhead knobs (or rounded) existed carry a view
// without them; the store fills them with the defaults, as the old lab page
// did.
Deno.test('listBoards fills a legacy view without arrowhead fields with the defaults', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: handId('a'),
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
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('a')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('a')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('a'))
  assertEquals(
    board?.view,
    { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 1, colored: false, top: 0, rounded: true },
  )
  assertEquals(board?.sources, [], 'a meta without recipes reads as none')
})

// Every board written before the head height became literal stores 0, which
// meant "automatic" then and would mean "no arrowhead at all" now.
Deno.test('a board saved when the head height was automatic reads as the new default', async () => {
  freshDir()
  await saveBoard({ ...entry(), view: { ...DEFAULT_VIEW, headHeight: 0 } })
  const board = listBoards()[0]?.boards[0]
  // The literal 1, not DEFAULT_VIEW.headHeight: the number is the point.
  assertEquals(board?.view.headHeight, 1)
  assertEquals(board?.sources[0]?.view.headHeight, 1, 'the recipe is read the same way')
  assertEquals(DEFAULT_VIEW.headHeight, 1)
})

// The same for params: a board saved before a knob existed does not name it.
// Without filling it here the page would re-save the board with a command
// carrying `--headtries=undefined`.
Deno.test('listBoards fills legacy params without a knob with the engine default, in recipes too', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacyParams: Record<string, unknown> = { ...params() }
  delete legacyParams.headTries
  const legacyView = { cell: 12, stroke: 0.5, headWidth: 0, headHeight: 0, colored: false, top: 0 }
  const legacy = {
    id: handId('c'),
    W: 25,
    H: 50,
    seed: 7,
    params: legacyParams,
    view: legacyView,
    command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
    source: 'cli',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ok: true,
    pieces: 126,
    maxLen: 68,
    genMs: 12,
    svgBytes: 6,
    sources: [{
      id: 'seed7-00000000',
      params: legacyParams,
      view: legacyView,
      command: `${COMMAND_PREFIX} --width=25 --height=50 --seed=7`,
      source: 'cli',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      genMs: 12,
      restarts: null,
      backtracks: null,
      aborted: false,
    }],
  }
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('c')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('c')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('c'))
  assertEquals(board?.params.headTries, defaultParams().headTries)
  assertEquals(board?.sources[0]?.params.headTries, defaultParams().headTries)
  assertEquals(board?.sources[0]?.view.rounded, true)
  assert(board)
  assertEquals(buildCommand(board.params).includes('undefined'), false, 'no knob is written as undefined')
})

// --- the closing report ------------------------------------------------------
// A board that did not close is stored too (the lab shows it with its holes),
// so the meta carries what the run reported: restarts and backtracks used,
// whether a time budget cut it short, and the leftover of a jam.

Deno.test('saveBoard records the closing report: restarts, backtracks, aborted and the leftover', async () => {
  const dir = freshDir()
  const stuck = { remaining: 7, sizes: [4, 3], heads: 2 }
  const { meta } = await saveBoard(entry({
    metrics: { ok: false, pieces: 10, maxLen: 5, genMs: 3, restarts: 1, backtracks: 42, aborted: true, stuck },
  }))
  assertEquals([meta.ok, meta.restarts, meta.backtracks, meta.aborted], [false, 1, 42, true])
  assertEquals(meta.stuck, stuck)
  const saved = readMeta(join(dir, '25x50', meta.id + '.json'))
  assertEquals([saved.ok, saved.restarts, saved.backtracks, saved.aborted], [false, 1, 42, true])
  assertEquals(saved.stuck, stuck)
  assertEquals(saved.sources[0]?.aborted, true)
})

Deno.test('saveBoard without a closing report writes null counts, aborted false and no leftover', async () => {
  freshDir()
  const { meta } = await saveBoard(entry())
  assertEquals([meta.restarts, meta.backtracks, meta.aborted, meta.stuck], [null, null, false, null])
})

// A board stored before the closing report existed lacks the fields; the
// reader fills them so the page never sees undefined.
Deno.test('listBoards fills a legacy meta without the closing report', () => {
  const dir = freshDir()
  Deno.mkdirSync(join(dir, '25x50'))
  const legacy = {
    id: handId('e'),
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
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('e')}.json`), JSON.stringify(legacy))
  Deno.writeTextFileSync(join(dir, '25x50', `${handId('e')}.board.json`), '{}')
  const board = listBoards()[0]?.boards[0]
  assertEquals(board?.id, handId('e'))
  assertEquals([board?.restarts, board?.backtracks, board?.aborted, board?.stuck], [null, null, false, null])
  assertEquals([board?.fingerprint, board?.boardBytes, board?.svg], [null, null, false])
})

Deno.test('listBoards without a directory returns an empty list', () => {
  const missing = join(freshDir(), 'missing')
  Deno.env.set('ARROWZ_BOARDS_DIR', missing)
  assert(!exists(missing))
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard removes the board file, the meta, the preview and an emptied size directory', async () => {
  const dir = freshDir()
  const kept = (await saveBoard(entry({ params: { seed: 1 } }))).meta
  const gone = (await saveBoard(entry({ params: { seed: 2 }, board: boardFile(25, 50, [2]), svg: '<svg/>' }))).meta
  assertNotEquals(gone.id, kept.id)
  assertEquals(deleteBoard('25x50', gone.id), true)
  for (const ext of ['.board.json', '.json', '.svg']) assert(!exists(join(dir, '25x50', gone.id + ext)), ext)
  assertEquals(listBoards()[0]?.boards.map((b) => b.id), [kept.id])
  assertEquals(deleteBoard('25x50', kept.id), true)
  assert(!exists(join(dir, '25x50')), 'empty size directory is removed')
  assertEquals(listBoards(), [])
})

Deno.test('deleteBoard returns false for a missing layout and rejects bad names', async () => {
  const dir = freshDir()
  await saveBoard(entry())
  assertEquals(deleteBoard('25x50', handId('9')), false)
  assertThrows(() => deleteBoard('25x50', 'seed9-00000000'), Error, 'invalid')
  assertThrows(() => deleteBoard('../25x50', handId('9')), Error, 'invalid')
  assertThrows(() => deleteBoard('25x50', '../engine'), Error, 'invalid')
  assert(exists(join(dir, '25x50')))
})
