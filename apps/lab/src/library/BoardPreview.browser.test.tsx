import { decodeBoard } from '@arrowz/engine'
import { VIEW_RANGE } from '@arrowz/engine/command'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { storedFixture } from '../state/library.fixtures'
import { useStore } from '../state/store'
import { BoardPreview } from './BoardPreview'
import { cancelNoticeFade } from './notices'
import { cancelPendingSave } from './useViewSave'

const stored = storedFixture(1)

beforeEach(() => {
  const state = useStore.getState()
  state.result.reset()
  state.library.reset()
  state.lang.setLang('en')
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  cancelPendingSave()
  cancelNoticeFade()
  vi.restoreAllMocks()
})

async function mountPreview(path = `/boards/8x8/${stored.meta.id}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw">
        <BoardPreview />
      </div>
    </MemoryRouter>,
  )
}

async function show() {
  await act(async () =>
    useStore.getState().result.showPreview({ board: decodeBoard(stored.file), file: stored.file, meta: stored.meta }),
  )
}

// Read from the stored board's own view: no highlight and no export cell.
test('the stored view is three number rows and two switches, from the board’s own view', async () => {
  const screen = await mountPreview()
  await show()
  const arrows = screen.getByRole('group', { name: 'arrows · saved with the board' })
  await expect.element(arrows).toBeVisible()
  expect(
    arrows
      .getByRole('slider')
      .elements()
      .map((slider) => slider.id),
  ).toEqual(['view-stroke', 'view-headWidth', 'view-headHeight'])
  expect(
    arrows
      .getByRole('switch')
      .elements()
      .map((sw) => sw.id),
  ).toEqual(['view-rounded', 'view-colored'])
  await expect
    .element(screen.getByRole('button', { name: /^stroke:/ }))
    .toHaveTextContent(String(stored.meta.view.stroke))
  expect(screen.container.querySelector('#view-top')).toBeNull()
  expect(screen.container.querySelector('#view-cell')).toBeNull()
})

// Clamped here, because a stored view has no slice to clamp it.
test('an edit lands in the stored board’s view, clamped, and leaves the lab’s alone', async () => {
  const lab = useStore.getState().view.stroke
  const screen = await mountPreview()
  await show()
  await screen.getByRole('button', { name: /^stroke:/ }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'stroke', exact: true }), '5')
  await userEvent.keyboard('{Enter}')
  expect(useStore.getState().result.preview?.meta.view.stroke).toBe(VIEW_RANGE.stroke.max)
  expect(useStore.getState().view.stroke).toBe(lab)

  await userEvent.click(screen.getByRole('switch', { name: 'multicolour' }))
  expect(useStore.getState().result.preview?.meta.view.colored).toBe(!stored.meta.view.colored)
})

// The stage lays the lab's theme, palette, paper and ink over a stored board
// (`BoardFrame`), so their rows belong here too, with or without a board.
test('the colours are the lab’s, and stay when no board is open', async () => {
  const screen = await mountPreview('/boards')
  await expect.element(screen.getByText('Open a board from the list.')).toBeVisible()
  await expect.element(screen.getByRole('group', { name: 'colours' })).toBeVisible()
  await expect.element(screen.getByRole('combobox', { name: 'theme' })).toBeVisible()
})
