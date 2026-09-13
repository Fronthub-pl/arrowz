import { MemoryRouter } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppRoutes } from './AppRoutes'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

test('/boards is the saved boards', async () => {
  const screen = await at('/boards')
  await expect.element(screen.getByRole('tabpanel', { name: 'Saved boards' })).toBeVisible()
})

test('/docs/element is the docs, and the segment reaches the page', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel', { name: 'Docs' })).toBeVisible()
  await expect.element(screen.getByText('element')).toBeVisible()
})

// The lab is not a route element (Ruling 5): App mounts it beside <Routes> and
// hides it off-route, so `/` renders nothing here.
test('the root path renders no panel of its own', async () => {
  const screen = await at('/')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

test('an unknown path redirects to the root', async () => {
  const screen = await at('/nowhere')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// Each panel is inside a <main>, not instead of it: role="tabpanel" on <main>
// would erase the page's only landmark.
test('each panel keeps the main landmark around it', async () => {
  const screen = await at('/boards')
  await expect.element(screen.getByRole('main')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-boards-panel')
  expect(panel?.getAttribute('tabindex')).toBe('0')
})
