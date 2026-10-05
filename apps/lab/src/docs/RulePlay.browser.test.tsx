import { type ArrowzBoard, GESTURE_STORAGE_KEY } from '@arrowz/board-element'
import { act } from 'react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { renderAt } from '../harness/renderAt'
import { useStore } from '../state/store'
import type { RuleBoardName } from './ruleBoards'
import { RulePlay } from './RulePlay'
// The board takes its size from docs.css; without the sheets it has none and no viewport.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => localStorage.removeItem(GESTURE_STORAGE_KEY))

async function mount(name: RuleBoardName) {
  const screen = await renderAt(<RulePlay name={name} />, { style: { width: '400px' } })
  const element = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  if (element === null) throw new Error('no element')
  await expect.poll(() => element.viewport).not.toBeNull()
  return { screen, element }
}

/** A real ⌘/Ctrl-click on a piece's head cell, as in `BoardMode.browser.test.tsx`: the element's own game moves. */
function clickPiece(element: ArrowzBoard, pieceId: number) {
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

const line = (container: HTMLElement) => container.querySelector('[role="status"]')?.textContent
const removed = (element: ArrowzBoard) => element.saveState()?.removed

test('the blocked arrow bounces, the arrow in its way leaves, and then the first leaves too', async () => {
  const { screen, element } = await mount('rule-blocked')
  expect(line(screen.container)).toBe('Play any arrow and see what happens.')
  clickPiece(element, 0)
  await expect.poll(() => line(screen.container)).toBe('It bounced off another arrow.')
  expect(removed(element)).toEqual([])
  clickPiece(element, 2)
  await expect.poll(() => line(screen.container)).toBe('It left: its path to the edge was clear.')
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0, 2])
})

test.each([
  ['rule-free', 0],
  ['rule-shape', 0],
] as const)('on %s the arrow leaves', async (name, id) => {
  const { screen, element } = await mount(name)
  clickPiece(element, id)
  await expect.poll(() => removed(element)).toEqual([id])
  await expect.poll(() => line(screen.container)).toBe('It left: its path to the edge was clear.')
})

test('Start over puts every arrow back and the line with them', async () => {
  const { screen, element } = await mount('rule-free')
  const restart = screen.getByRole('button', { name: 'Start over' })
  await expect.element(restart).toBeDisabled()
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0])
  await restart.click()
  expect(removed(element)).toEqual([])
  expect(line(screen.container)).toBe('Play any arrow and see what happens.')
  await expect.element(restart).toBeDisabled()
})

test('a language switch keeps the game and translates the line', async () => {
  const { screen, element } = await mount('rule-free')
  clickPiece(element, 0)
  await expect.poll(() => removed(element)).toEqual([0])
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => line(screen.container)).toBe('Odjechała: jej droga do krawędzi była wolna.')
  expect(removed(element)).toEqual([0])
  expect(element.getAttribute('lang')).toBe('pl')
})

// The element may refuse colour, so the drawn colour is read back from the
// element, not from the property set on it.
test('a rule board is named, coloured and playable', async () => {
  const { screen, element } = await mount('rule-shape')
  await expect
    .element(
      screen.getByRole('figure', {
        name: 'A horseshoe-shaped arrow with another arrow inside its bend, still free to leave',
      }),
    )
    .toBeVisible()
  expect(element.play).toBe(true)
  expect(element.colored).toBe(true)
})

test('the page keeps the player’s stored gesture', async () => {
  localStorage.setItem(GESTURE_STORAGE_KEY, 'click')
  const { element } = await mount('rule-free')
  expect(element.gestureMode).toBe('click')
})
