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

// The library panel is the workspace's, not a route's (Ruling 5): the route
// renders nothing, exactly as `/` does, so that navigating to it cannot
// unmount the board element. The whole-app test asserts the panel's identity.
test('/boards renders no panel of its own', async () => {
  const screen = await at('/boards')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// The absence of a panel cannot carry the second half of this name on its own:
// delete the `/boards/:size/:id` route and the path falls to the wildcard,
// which redirects to `/`, whose element is `null` as well — so the panel is
// missing either way. The address is what tells a route that resolves from one
// that was swallowed, so this case reads it. The probe is rendered here rather
// than added to `at()`: every other case in this file shares that helper and
// none of them asks where it landed.
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

// The tabpanel has no accessible name here: it takes "name from author" only
// (no "name from content"), and its aria-labelledby points at the tab strip's
// id, which `AppRoutes` on its own does not render. So this case locates the
// panel by role and checks the wiring instead of the name; the whole-app test
// with the real tab strip is where the accessible name is asserted.
//
// It used to assert `getByText('element')` against the raw route segment the
// route echoed into a <p>. That <p> is gone, and the assertion was never worth
// keeping: `getByText` matches a node's whole text, so it was answering a
// question about the segment, not about the page.
test('/docs/element renders the docs panel, wired to its tab', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('tabpanel')).toBeVisible()
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  // Named, though it is the only navigation landmark here today: the docs page
  // is where a second one would land, and an unnamed role locator turns that
  // day's addition into a strict-mode throw in a case about something else.
  await expect.element(screen.getByRole('navigation', { name: 'Documentation pages' })).toBeVisible()
})

test('/docs/cli is the same panel, on its own page', async () => {
  const screen = await at('/docs/cli')
  const panel = screen.container.querySelector('[role="tabpanel"]')
  expect(panel?.getAttribute('aria-labelledby')).toBe('tab-docs-panel')
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('aria-current', 'page')
})

// The lab is not a route element (Ruling 5): App mounts it beside <Routes> and
// hides it off-route, so `/` renders nothing here.
test('the root path renders no panel of its own', async () => {
  const screen = await at('/')
  expect(screen.container.querySelector('[role="tabpanel"]')).toBeNull()
})

// The missing panel cannot carry this name either (the board case above says
// why at length): `/` renders no panel, and neither does a path that matched
// nothing at all, so the address is the only witness to a redirect.
//
// The address is compared whole, and `toHaveTextContent` cannot do it. It
// matches a SUBSTRING, and every path in this file contains a slash, so
// `toHaveTextContent('/')` passes on `/nowhere` itself — the exact failure this
// case exists to catch. Nor does a regex rescue it: measured here, the matcher
// stringifies its argument and looks for that text, reporting `Expected element
// to have text content: /^\/$/` against a received `/`. So the case reads the
// node's own text and compares it, polling because the redirect lands in a
// later frame. The two cases below were written with a bare `'/'`; their paths
// are not this one's business and they are left as they are.
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

// `/docs` alone fell to the wildcard and landed the reader in the lab, which is
// a surprising answer to a documentation link. An unknown page name lands on
// the element's page too — including an upper-case one, since react-router
// matches paths case-insensitively and `:what` happily captures `CLI`.
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

// The spec promises the tab, not only the address: the strip must mark Docs as
// the open section on the CLI page as well, since `selectedIndex` keys on the
// `/docs` prefix rather than on the tab's own path. `TabRow` is mounted here
// rather than the whole shell, because the claim is about the strip.
test('the Docs tab is the selected one on the CLI page', async () => {
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <TabRow />
    </MemoryRouter>,
  )
  await expect.element(screen.getByRole('tab', { name: 'Docs' })).toHaveAttribute('aria-selected', 'true')
  await expect.element(screen.getByRole('tab', { name: 'Lab' })).toHaveAttribute('aria-selected', 'false')
})

// §7's other two promises need the strip and the routes together. After the
// upper-case redirect the tab must agree with the address — `selectedIndex` is
// case-sensitive, so for one frame before the redirect it says Lab. And the
// tab's own path is `/docs/element`, so clicking it from the CLI page goes back
// to the element's page rather than staying put.
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
