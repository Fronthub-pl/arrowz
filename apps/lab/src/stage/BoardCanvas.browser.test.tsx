import { boardViewOf } from '@arrowz/board-element'
import { defaultParams, generate } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { BoardCanvas } from './BoardCanvas'

const board = generate({ ...defaultParams(), W: 10, H: 10, seed: 2 }).board
const view = boardViewOf(DEFAULT_VIEW, false)

test('the element receives the board as an object, not as an attribute', async () => {
  const screen = await render(<BoardCanvas board={board} view={view} interactive={false} />)
  const element = screen.container.querySelector('arrowz-board')
  expect(element).not.toBeNull()
  expect(element?.board?.pieces.length).toBe(board.pieces.length)
  // Had React written it as an attribute, this would be "[object Object]".
  expect(element?.getAttribute('board')).toBeNull()
})

test('the view reaches the element as an object too', async () => {
  const screen = await render(
    <BoardCanvas board={board} view={boardViewOf({ ...DEFAULT_VIEW, stroke: 3 }, false)} interactive={false} />,
  )
  expect(screen.container.querySelector('arrowz-board')?.view?.stroke).toBe(3)
})

test('a null board renders the element without drawing anything', async () => {
  const screen = await render(<BoardCanvas board={null} view={view} interactive={false} />)
  expect(screen.container.querySelector('arrowz-board')?.board).toBeNull()
})

// The property assignment above is not what the wrapper buys — React 19 sets
// properties on a registered custom element on its own. What only
// `createComponent` provides is mapping these non-standard DOM events onto
// props; a typo in the `events` map would otherwise fail silently.
test('a piece-click event on the element calls the onPieceClick prop', async () => {
  const onPieceClick = vi.fn()
  const screen = await render(<BoardCanvas board={board} view={view} interactive={false} onPieceClick={onPieceClick} />)
  const element = screen.container.querySelector('arrowz-board')
  element?.dispatchEvent(new CustomEvent('piece-click', { detail: { pieceId: 3 } }))
  expect(onPieceClick).toHaveBeenCalledTimes(1)
  expect(onPieceClick.mock.calls[0]?.[0]?.detail).toEqual({ pieceId: 3 })
})

test('the three game events call their props', async () => {
  const onPieceRemoved = vi.fn()
  const onLifeLost = vi.fn()
  const onFinished = vi.fn()
  const screen = await render(
    <BoardCanvas
      board={board}
      view={view}
      interactive={false}
      onPieceRemoved={onPieceRemoved}
      onLifeLost={onLifeLost}
      onFinished={onFinished}
    />,
  )
  const element = screen.container.querySelector('arrowz-board')
  element?.dispatchEvent(new CustomEvent('piece-removed', { detail: { pieceId: 3, left: 4 } }))
  element?.dispatchEvent(new CustomEvent('life-lost', { detail: { pieceId: 3, blockerId: 5, distance: 2 } }))
  element?.dispatchEvent(new CustomEvent('finished', { detail: { pieces: 9 } }))
  expect(onPieceRemoved.mock.calls.map((c) => c[0]?.detail)).toEqual([{ pieceId: 3, left: 4 }])
  expect(onLifeLost.mock.calls.map((c) => c[0]?.detail)).toEqual([{ pieceId: 3, blockerId: 5, distance: 2 }])
  expect(onFinished.mock.calls.map((c) => c[0]?.detail)).toEqual([{ pieces: 9 }])
})
