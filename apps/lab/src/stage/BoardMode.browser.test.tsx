import { decodeBoard, newSession } from '@arrowz/engine'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { storedFixture } from '../state/library.fixtures'
import { finish, finishedRun } from '../state/result.fixtures'
import { useStore } from '../state/store'
import { BoardFrame } from './BoardFrame'
import { threeDominoes } from './pieces.fixtures'

// Every export calls through; the spy only counts `newSession`'s builds.
vi.mock('@arrowz/engine', { spy: true })

beforeEach(() => {
  const state = useStore.getState()
  state.run.reset()
  state.result.reset()
  state.library.reset()
  state.lang.setLang('en')
  state.ui.setSolo(false)
  // Through `setState`, not `setBoardMode`: a fixture built on the action
  // under test would go red with it in every case at once.
  useStore.setState((s) => ({ ui: { ...s.ui, boardMode: 'view' } }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountFrame(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw" style={{ display: 'grid', gridTemplateRows: '1fr', width: '480px', height: '360px' }}>
        <BoardFrame />
      </div>
    </MemoryRouter>,
  )
}

/** The hand-built board on stage as the lab's own result. */
async function showDominoes() {
  await act(async () => finish({ ...finishedRun(1), board: threeDominoes() }))
}

function elementOf(container: HTMLElement) {
  const element = container.querySelector('arrowz-board')
  if (element === null) throw new Error('no element')
  return element
}

/** What the element dispatches, the way it dispatches it (`emit`, arrowz-board.ts). */
async function fire(container: HTMLElement, type: string, detail: unknown) {
  await act(async () => {
    elementOf(container).dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }))
  })
}

/**
 * A real ⌘/Ctrl-click on a piece's head cell, so the element's own game moves
 * (the synthetic events above only tell the lab it did).
 */
function clickPiece(container: HTMLElement, pieceId: number) {
  const element = elementOf(container)
  const vp = element.viewport
  const head = element.board?.pieces.find((p) => p.id === pieceId)?.cells[0]
  const canvas = element.shadowRoot?.querySelector('canvas')
  if (!vp || !head || !canvas) throw new Error('need a viewport, a canvas and a piece')
  const r = canvas.getBoundingClientRect()
  const init = {
    bubbles: true,
    composed: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: r.left + (head.x + 0.5 - vp.originX) * vp.cellPx,
    clientY: r.top + (head.y + 0.5 - vp.originY) * vp.cellPx,
    ctrlKey: true,
    buttons: 1,
  }
  canvas.dispatchEvent(new PointerEvent('pointerdown', init))
  canvas.dispatchEvent(new PointerEvent('pointerup', init))
}

const radios = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('.fw-mode [role="radio"]')]
const line = (container: HTMLElement) => container.querySelector('.fw-modeline')
/** The line's words without the Reset button beside them. */
const said = (container: HTMLElement) => line(container)?.querySelector('[role="status"]')?.textContent
const resetButton = (container: HTMLElement) => line(container)?.querySelector<HTMLButtonElement>('button') ?? null

/** Picks a mode by position, so the same call works in either language. */
async function pick(container: HTMLElement, index: number) {
  await act(async () => radios(container)[index]?.click())
}

test('the board frame offers three modes, View chosen, and the element neither plays nor inspects', async () => {
  const screen = await mountFrame()
  await showDominoes()
  const group = screen.getByRole('radiogroup', { name: 'Board mode' })
  await expect.element(group).toBeVisible()
  expect(radios(screen.container).map((r) => r.textContent)).toEqual(['View', 'Inspect', 'Play'])
  expect(radios(screen.container).map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  const element = elementOf(screen.container)
  expect(element.hasAttribute('play')).toBe(false)
  expect(element.hasAttribute('interactive')).toBe(false)
  expect(line(screen.container)).toBeNull()
})

test('an empty frame before the first run offers no mode, and the first board brings it', async () => {
  const screen = await mountFrame()
  expect(screen.container.querySelector('.fw-mode')).toBeNull()
  await showDominoes()
  expect(radios(screen.container)).toHaveLength(3)
})

// The lab's own result is on hand here: that board must not lend its control to the empty stage.
test('on the library tab a board that could not be read leaves no mode to choose', async () => {
  const screen = await mountFrame('/boards/8x8/sha256-0')
  await showDominoes()
  await act(async () => useStore.getState().library.boardFailed({ name: '8x8/sha256-0', reason: null }))
  await expect.poll(() => screen.container.querySelector('arrowz-board')?.board ?? null).toBeNull()
  expect(screen.container.querySelector('.fw-mode')).toBeNull()
})

test('the control sits in the strip under the frame, after the solo toggle and before the line', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await act(async () => useStore.getState().ui.setBoardMode('play'))
  const tags = (parent: Element | null) =>
    [...(parent?.children ?? [])].map((k) => k.tagName.toLowerCase() + (k.className ? `.${k.className}` : ''))
  expect(tags(screen.container.querySelector('.fw-boardwrap'))).toEqual(['div.fw-board', 'div.fw-modebar'])
  expect(tags(screen.container.querySelector('.fw-board')).includes('button.fw-solo')).toBe(true)
  expect(tags(screen.container.querySelector('.fw-modebar'))).toEqual(['div.fw-mode', 'div.fw-modeline'])
})

// The element builds sessions of its own for its game, so only the frame's
// calls are counted, told apart by the file on the stack.
test('View builds no game session, and the lab builds one per board, not per move or click', async () => {
  const { newSession: real } = await vi.importActual<typeof import('@arrowz/engine')>('@arrowz/engine')
  const built: string[] = []
  vi.mocked(newSession).mockImplementation((board) => {
    const stack = new Error().stack ?? ''
    if (stack.includes('/stage/BoardMode.tsx')) built.push(stack)
    return real(board)
  })
  const screen = await mountFrame()
  await showDominoes()
  expect(built).toHaveLength(0)
  await pick(screen.container, 2)
  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 2 })
  await fire(screen.container, 'piece-removed', { pieceId: 2, left: 1 })
  await pick(screen.container, 1)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(built).toHaveLength(1)
})

test('Inspect makes the element interactive and a clicked piece names its facts', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 1)
  expect(useStore.getState().ui.boardMode).toBe('inspect')
  const element = elementOf(screen.container)
  await expect.poll(() => element.hasAttribute('interactive')).toBe(true)
  expect(element.hasAttribute('play')).toBe(false)
  expect(said(screen.container)).toBe('Choose a piece to inspect it.')

  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · blocked by #2 at 0 cells')
  await fire(screen.container, 'piece-click', { pieceId: 2 })
  expect(said(screen.container)).toBe('Piece #2 · 3 cells · ↑ up · free')

  await pick(screen.container, 0)
  expect(line(screen.container)).toBeNull()
  await expect.poll(() => element.hasAttribute('interactive')).toBe(false)
  // Back in Inspect the old card is not brought back: the click was the last mode's.
  await pick(screen.container, 1)
  expect(said(screen.container)).toBe('Choose a piece to inspect it.')
})

test('Play counts pieces left and mistakes, and Reset puts the board and both counts back', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  const element = elementOf(screen.container)
  await expect.poll(() => element.hasAttribute('play')).toBe(true)
  const status = () => said(screen.container)
  expect(status()).toBe('3 left · 0 mistakes')
  expect(resetButton(screen.container)?.textContent).toBe('Reset')
  expect(resetButton(screen.container)?.disabled).toBe(true)

  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 2 })
  await fire(screen.container, 'life-lost', { pieceId: 1, blockerId: 2, distance: 0 })
  expect(status()).toBe('2 left · 1 mistake')
  await fire(screen.container, 'life-lost', { pieceId: 1, blockerId: 2, distance: 0 })
  expect(status()).toBe('2 left · 2 mistakes')

  const restart = vi.spyOn(element, 'restart')
  const load = vi.spyOn(element, 'loadState')
  const save = vi.spyOn(element, 'saveState')
  expect(resetButton(screen.container)?.disabled).toBe(false)
  await act(async () => resetButton(screen.container)?.click())
  expect(restart).toHaveBeenCalledTimes(1)
  expect(status()).toBe('3 left · 0 mistakes')
  expect(resetButton(screen.container)?.disabled).toBe(true)

  await fire(screen.container, 'piece-removed', { pieceId: 2, left: 2 })
  await fire(screen.container, 'piece-removed', { pieceId: 1, left: 1 })
  await fire(screen.container, 'life-lost', { pieceId: 0, blockerId: 1, distance: 0 })
  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 0 })
  await fire(screen.container, 'finished', { pieces: 3 })
  expect(status()).toBe('Cleared · 1 mistake')
  // `loadState` would hand the element a colour override of its own, past the
  // lab's `colored-change` handling; the mode needs neither it nor `saveState`.
  expect(load).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

// The element announces `finished` only after the last exit animation, so a
// Reset or a new board inside that window must not read as cleared.
test('a late finished after Reset leaves the fresh counts', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  const status = () => said(screen.container)
  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 0 })
  await act(async () => resetButton(screen.container)?.click())
  await fire(screen.container, 'finished', { pieces: 3 })
  expect(status()).toBe('3 left · 0 mistakes')
})

test('a late finished after a new board leaves the fresh counts', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  const status = () => line(screen.container)?.querySelector('[role="status"]')?.textContent
  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 0 })
  const next = finishedRun(2)
  await act(async () => finish(next))
  await fire(screen.container, 'finished', { pieces: 3 })
  expect(status()).toBe(`${next.board.pieces.length} left · 0 mistakes`)
})

// Real clicks, so the element's own game moves: the lab must neither restart
// it on a mode switch nor describe pieces that have left.
test('switching modes keeps the game: Inspect sees the board as it stands, Play keeps its counts', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  const element = elementOf(screen.container)
  // No stylesheet here, so the host gets a size of its own to fit the board into.
  element.style.display = 'block'
  element.style.width = '300px'
  element.style.height = '300px'
  await expect.poll(() => element.hasAttribute('play') && (element.viewport?.cellPx ?? 0) > 0).toBe(true)
  const restart = vi.spyOn(element, 'restart')
  await act(async () => clickPiece(screen.container, 1))
  await act(async () => clickPiece(screen.container, 2))
  await act(async () => clickPiece(screen.container, 0))
  expect(said(screen.container)).toBe('1 left · 1 mistake')

  await pick(screen.container, 1)
  await expect.poll(() => element.hasAttribute('interactive')).toBe(true)
  expect(restart).not.toHaveBeenCalled()
  expect([...(element.saveState()?.removed ?? [])].sort()).toEqual([0, 2])
  // Piece 1's only blocker has left.
  await act(async () => clickPiece(screen.container, 1))
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · free')
  // A piece that has left is no piece to inspect: the element sends no click
  // for its empty cells, and one sent anyway brings no card for it.
  await act(async () => clickPiece(screen.container, 2))
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · free')
  await fire(screen.container, 'piece-click', { pieceId: 2 })
  expect(said(screen.container)).toBe('Choose a piece to inspect it.')
  expect(resetButton(screen.container)?.disabled).toBe(false)

  await pick(screen.container, 0)
  await pick(screen.container, 2)
  expect(said(screen.container)).toBe('1 left · 1 mistake')
  expect(restart).not.toHaveBeenCalled()
})

test('Reset in Inspect starts the game over: the element, the counts and the board the card reads', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 1)
  expect(resetButton(screen.container)?.textContent).toBe('Reset')
  expect(resetButton(screen.container)?.disabled).toBe(true)
  await pick(screen.container, 2)
  await fire(screen.container, 'piece-removed', { pieceId: 2, left: 2 })
  await fire(screen.container, 'life-lost', { pieceId: 0, blockerId: 1, distance: 0 })
  await pick(screen.container, 1)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · free')

  const element = elementOf(screen.container)
  const restart = vi.spyOn(element, 'restart')
  const load = vi.spyOn(element, 'loadState')
  await act(async () => resetButton(screen.container)?.click())
  expect(restart).toHaveBeenCalledTimes(1)
  expect(load).not.toHaveBeenCalled()
  expect(resetButton(screen.container)?.disabled).toBe(true)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · blocked by #2 at 0 cells')
  await pick(screen.container, 2)
  expect(said(screen.container)).toBe('3 left · 0 mistakes')
})

test('Reset in Play starts over the board the card reads too', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  await fire(screen.container, 'piece-removed', { pieceId: 2, left: 2 })
  await act(async () => resetButton(screen.container)?.click())
  await pick(screen.container, 1)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · blocked by #2 at 0 cells')
})

test('a new board on stage keeps Play and starts the counts over', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  await fire(screen.container, 'piece-removed', { pieceId: 0, left: 2 })
  await fire(screen.container, 'life-lost', { pieceId: 1, blockerId: 2, distance: 0 })
  const next = finishedRun(2)
  await act(async () => finish(next))
  expect(useStore.getState().ui.boardMode).toBe('play')
  expect(elementOf(screen.container).hasAttribute('play')).toBe(true)
  expect(said(screen.container)).toBe(`${next.board.pieces.length} left · 0 mistakes`)
  expect(resetButton(screen.container)?.disabled).toBe(true)
})

test('a new board on stage starts the game over for Inspect too, and keeps the mode', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 2)
  await fire(screen.container, 'piece-removed', { pieceId: 2, left: 2 })
  await pick(screen.container, 1)
  // The same pieces as a new board: only the game on it may differ.
  await showDominoes()
  expect(useStore.getState().ui.boardMode).toBe('inspect')
  expect(resetButton(screen.container)?.disabled).toBe(true)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  expect(said(screen.container)).toBe('Piece #1 · 2 cells · → right · blocked by #2 at 0 cells')
})

test('a new board on stage drops the inspected piece', async () => {
  const screen = await mountFrame()
  await showDominoes()
  await pick(screen.container, 1)
  await fire(screen.container, 'piece-click', { pieceId: 1 })
  await act(async () => finish(finishedRun(2)))
  expect(said(screen.container)).toBe('Choose a piece to inspect it.')
})

test('the mode applies to a stored board previewed in the library', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
  const { meta, file } = storedFixture(2)
  const board = decodeBoard(file)
  const screen = await mountFrame(`/boards/8x8/${meta.id}`)
  await act(async () => useStore.getState().result.showPreview({ board, file, meta }))
  await pick(screen.container, 2)
  expect(said(screen.container)).toBe(`${board.pieces.length} left · 0 mistakes`)
  await pick(screen.container, 1)
  const piece = board.pieces[0]
  if (piece === undefined) throw new Error('empty fixture board')
  await fire(screen.container, 'piece-click', { pieceId: piece.id })
  expect(said(screen.container)).toMatch(new RegExp(`^Piece #${piece.id} · ${piece.cells.length} cells · `))
})

// Every new string, in both languages. Modes are picked by position, never by
// name, because the names change with the language.
test('every word of the board mode is in both languages', async () => {
  const screen = await mountFrame()
  await showDominoes()
  const seen: Record<string, string[]> = {}
  for (const lang of ['en', 'pl'] as const) {
    await act(async () => useStore.getState().lang.setLang(lang))
    await pick(screen.container, 1)
    const words = [
      screen.container.querySelector('.fw-mode [role="radiogroup"]')?.getAttribute('aria-label') ?? '',
      ...radios(screen.container).map((r) => r.textContent ?? ''),
      said(screen.container) ?? '',
      resetButton(screen.container)?.textContent ?? '',
    ]
    for (const id of [0, 1, 2]) {
      await fire(screen.container, 'piece-click', { pieceId: id })
      words.push(said(screen.container) ?? '')
    }
    await pick(screen.container, 2)
    await fire(screen.container, 'life-lost', { pieceId: 1, blockerId: 2, distance: 0 })
    words.push(said(screen.container) ?? '')
    await fire(screen.container, 'piece-removed', { pieceId: 2, left: 0 })
    await fire(screen.container, 'finished', { pieces: 3 })
    words.push(said(screen.container) ?? '')
    // The game outlives the mode, so the next language starts from a fresh one.
    await act(async () => resetButton(screen.container)?.click())
    await pick(screen.container, 0)
    seen[lang] = words
  }
  expect(seen.pl).toEqual([
    'Tryb planszy',
    'Widok',
    'Inspekcja',
    'Gra',
    'Wskaż element, aby go zbadać.',
    'Resetuj',
    'Element #0 · 2 komórki · ← w lewo · wolny',
    'Element #1 · 2 komórki · → w prawo · zablokowany przez #2 w odległości 0 komórek',
    'Element #2 · 3 komórki · ↑ w górę · wolny',
    'zostało: 3 · 1 błąd',
    'Plansza wyczyszczona · 1 błąd',
  ])
  // Each English word differs from its Polish one: none fell back to the source.
  const en = seen.en ?? []
  expect(en).toHaveLength(11)
  en.forEach((word, i) => expect(word).not.toBe(seen.pl?.[i]))
})
