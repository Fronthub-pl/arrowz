import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { TabRow } from './TabRow'

const mount = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TabRow />
    </MemoryRouter>,
  )

test('the strip is a tablist with three tabs and one selected', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tablist', { name: 'Sections' })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Lab', selected: true })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Saved boards', selected: false })).toBeVisible()
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: false })).toBeVisible()
})

test('only the selected tab is in the tab order', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('tabindex', '0')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('tabindex', '-1')
})

test('the selected tab points at the panel it controls', async () => {
  const screen = await mount('/boards')
  await expect
    .element(screen.getByRole('tab', { name: 'Saved boards' }))
    .toHaveAttribute('aria-controls', 'boards-panel')
  // aria-controls on an unselected tab would point at an id that is not in the
  // document, which is worse than no association at all.
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).not.toHaveAttribute('aria-controls')
})

test('every tab carries the id its panel labels itself with', async () => {
  const screen = await mount('/')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('id', 'tab-lab-panel')
  await expect.element(screen.getByRole('tab', { name: 'Saved boards' })).toHaveAttribute('id', 'tab-boards-panel')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('id', 'tab-docs-panel')
})

test('the right arrow moves the selection, and Home/End reach the ends', async () => {
  const screen = await mount('/')
  await screen.getByRole('tab', { name: 'Lab' }).click()
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(screen.getByRole('tab', { name: 'Saved boards', selected: true })).toBeVisible()
  await userEvent.keyboard('{End}')
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: true })).toBeVisible()
  await userEvent.keyboard('{Home}')
  await expect.element(screen.getByRole('tab', { name: 'Lab', selected: true })).toBeVisible()
})

// Wrapping is what the pattern asks for and what a mouse user never discovers.
test('the left arrow from the first tab wraps to the last', async () => {
  const screen = await mount('/')
  await screen.getByRole('tab', { name: 'Lab' }).click()
  await userEvent.keyboard('{ArrowLeft}')
  await expect.element(screen.getByRole('tab', { name: 'Docs', selected: true })).toBeVisible()
})
