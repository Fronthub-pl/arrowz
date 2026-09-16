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

// The tabpanel has no accessible name here: it takes "name from author" only
// (no "name from content"), and its aria-labelledby points at the tab strip's
// id, which does not exist until a later task renders it. So this test locates
// the panel by role and checks the wiring instead of the name; the whole-app
// test with the real tab strip asserts the accessible name once it exists.
test('/boards is the saved boards', async () => {
  const screen = await at('/boards')
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-boards-panel')
})

// Same reasoning as above: no accessible name without the tab strip, so this
// checks the wiring and that the route segment reaches the page.
test('/docs/element is the docs, and the segment reaches the page', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
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
