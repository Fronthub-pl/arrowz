import { boardViewOf } from '@arrowz/board-element'
import { defaultParams, generate } from '@arrowz/engine'
import { DEFAULT_VIEW } from '@arrowz/engine/command'
import { expect, test } from 'vitest'
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
