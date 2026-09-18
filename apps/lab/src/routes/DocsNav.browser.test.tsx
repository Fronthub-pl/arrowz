import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { DocsNav } from './DocsNav'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocsNav />
    </MemoryRouter>,
  )

// Real anchors are the whole reason this is a nav and not a radio group: an
// address worth copying, opening in a new tab and middle-clicking. A control
// that merely looks like a link would pass every other assertion here.
test('both pages are real links with addresses', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('link', { name: 'Element' })).toHaveAttribute('href', '/docs/element')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('href', '/docs/cli')
})

// NavLink writes aria-current="page" itself; the test names the behaviour
// rather than the attribute's author, so a hand-rolled link would also have to
// get it right.
test('the current page is the one the address names', async () => {
  const screen = await at('/docs/cli')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('aria-current', 'page')
  expect(screen.container.querySelector('a[href="/docs/element"]')?.getAttribute('aria-current')).toBeNull()
})

test('the navigation carries its own name, beside the tab strip', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('navigation', { name: 'Documentation pages' })).toBeVisible()
})
