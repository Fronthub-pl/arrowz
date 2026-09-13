import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { GroupRail } from './GroupRail'

function reset() {
  useStore.getState().params.reset()
  useStore.getState().ui.select('board')
}

test('the rail is a vertical tablist with the six groups and the preview entry', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await expect
    .element(screen.getByRole('tablist', { name: 'Parameter groups' }))
    .toHaveAttribute('aria-orientation', 'vertical')
  // Exact names, not substrings: `/board/` also matches "Saved boards" once
  // this rail sits in the real shell beside the route tabs.
  for (const name of ['board', 'lengths', 'shape', 'difficulty', 'skeleton', 'closing']) {
    await expect.element(screen.getByRole('tab', { name, exact: true })).toBeVisible()
  }
  await expect.element(screen.getByRole('tab', { name: 'Preview', exact: true })).toBeVisible()
})

test('the selected entry is the one the ui slice holds', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await expect.element(screen.getByRole('tab', { name: 'board', exact: true, selected: true })).toBeVisible()
  await screen.getByRole('tab', { name: 'shape', exact: true }).click()
  await expect.element(screen.getByRole('tab', { name: 'shape', exact: true, selected: true })).toBeVisible()
  expect(useStore.getState().ui.entry).toBe('shape')
})

test('the arrow keys move the selection, move the focus with it, and wrap', async () => {
  reset()
  const screen = await render(<GroupRail />)
  await screen.getByRole('tab', { name: 'board', exact: true }).click()
  await userEvent.keyboard('{ArrowDown}')
  expect(useStore.getState().ui.entry).toBe('lengths')
  // Selection without focus is half the pattern: the panel changes and a
  // screen reader is told nothing (Ruling 13).
  expect(document.activeElement?.getAttribute('id')).toBe('rail-tab-lengths')
  expect(document.activeElement?.getAttribute('aria-selected')).toBe('true')
  await userEvent.keyboard('{Home}')
  expect(useStore.getState().ui.entry).toBe('board')
  await userEvent.keyboard('{ArrowUp}')
  // Up from the first entry wraps to the last, which is the preview.
  expect(useStore.getState().ui.entry).toBe('preview')
  expect(document.activeElement?.getAttribute('id')).toBe('rail-tab-preview')
})

test('clicking a tab does not drag focus back from wherever it was', async () => {
  reset()
  const screen = await render(
    <>
      <button type="button">outside</button>
      <GroupRail />
    </>,
  )
  const outside = screen.getByRole('button', { name: 'outside' })
  await outside.click()
  useStore.getState().ui.select('shape')
  // The ref only focuses while the rail already owns focus, as TabRow does.
  await expect.element(outside).toHaveFocus()
})

test('a violated group carries a count that says what it counts', async () => {
  reset()
  useStore.getState().params.setMany({ W: 900, H: 900, pStraight: 0.6 })
  const screen = await render(<GroupRail />)
  // straightFloor is a shape rule; board is not involved (engine.ts:2823).
  await expect.element(screen.getByRole('tab', { name: 'shape, 1 setting outside the safe range' })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'board', exact: true })).toBeVisible()
})

test('the preview entry never carries a count', async () => {
  reset()
  useStore.getState().params.setMany({ wShort: 0.8, wMid: 0.8 })
  const screen = await render(<GroupRail />)
  await expect.element(screen.getByRole('tab', { name: 'Preview', exact: true })).not.toMatchTextContent(/\d/)
})
