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

// The library panel is the workspace's, not a route's (Ruling 5): the route
// renders nothing, exactly as `/` does, so that navigating to it cannot
// unmount the board element. The whole-app test asserts the panel's identity.
test('/boards renders no panel of its own', async () => {
  const screen = await at('/boards')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

test("a board's address renders no panel of its own, and is not the wildcard", async () => {
  const screen = await at('/boards/25x50/sha256-abc')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// The tabpanel has no accessible name here: it takes "name from author" only
// (no "name from content"), and its aria-labelledby points at the tab strip's
// id, which `AppRoutes` on its own does not render. So this case locates the
// panel by role and checks the wiring instead of the name, and that the route
// segment reaches the page; the whole-app test with the real tab strip is
// where the accessible name is asserted.
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
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('main')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.closest('main')).not.toBeNull()
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  expect(panel?.getAttribute('tabindex')).toBe('0')
})
