import { MemoryRouter, useLocation } from 'react-router'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )

/** The address the panel navigated to, printed where a test can read it. */
function Address() {
  return <p data-testid="address">{useLocation().pathname}</p>
}

// The library panel is the workspace's, not a route's, so navigating to it
// cannot unmount the board element. The whole-app test asserts its identity.
test('/boards renders no panel of its own', async () => {
  const screen = await at('/boards')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// No panel either way: without the `/boards/:size/:id` route the wildcard
// redirects to `/`, which renders nothing too. Only the address tells a
// resolved route from a swallowed one, so this case reads it.
test("a board's address renders no panel of its own, and is not the wildcard", async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/boards/25x50/sha256-abc']}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/boards/25x50/sha256-abc')
})

// The tabpanel is unnamed here: its aria-labelledby points at the tab strip,
// which `AppRoutes` alone does not render. So this checks the wiring; the
// whole-app test asserts the accessible name.
test('/docs/element renders the docs panel, wired to its tab', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  // Named, though it is the only navigation landmark today: a second one would
  // turn an unnamed locator into a strict-mode throw.
  await expect.element(screen.getByRole('navigation', { name: 'Documentation pages' })).toBeVisible()
})

test('/docs/cli is the same panel, on its own page', async () => {
  const screen = await at('/docs/cli')
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('aria-current', 'page')
})

// The lab is not a route element: App mounts it beside <Routes>.
test('the root path renders no panel of its own', async () => {
  const screen = await at('/')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// Only the address witnesses the redirect (see the board case above). Read as
// text and compared with `toBe`: `toHaveTextContent` stringifies a RegExp
// argument, so `/^\/$/` would be matched literally. Polled, because the
// redirect lands a frame after `<Address />` first renders.
test('an unknown path redirects to the root', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/nowhere']}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
  await expect.poll(() => screen.getByTestId('address').element().textContent).toBe('/')
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

// An unknown page name lands on the element's page too, including upper case:
// react-router matches paths case-insensitively, so `:what` captures `CLI`.
test.each(['/docs', '/docs/nowhere', '/DOCS/CLI'])('%s lands on the element page', async (path) => {
  const screen = await render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
})

// Two segments under /docs is not a documentation page; it is a stale link.
test('a deeper docs path is a stale link and goes to the lab', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli/extra']}>
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/')
})

// `selectedIndex` keys on the `/docs` prefix, not on the tab's own path.
test('the Docs tab is the selected one on the CLI page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <TabRow />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('aria-selected', 'false')
})

// `selectedIndex` is case-sensitive, so for one frame before the redirect the
// strip says Lab; the tab must agree with the address once it lands.
test('after the upper-case redirect the address and the tab agree', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/DOCS/CLI']}>
      <TabRow />
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'true')
})

test('clicking the Docs tab from the CLI page returns to the element page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <TabRow />
      <AppRoutes />
      <Address />
    </MemoryRouter>,
  )
  await screen.getByRole('tab', { name: 'Docs' }).click()
  await expect.element(screen.getByTestId('address')).toHaveTextContent('/docs/element')
})
