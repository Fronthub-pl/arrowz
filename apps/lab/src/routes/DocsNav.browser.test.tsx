import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsNav, sectionOf } from './DocsNav'

beforeEach(() => useStore.getState().lang.setLang('en'))

const at = (path: string, section?: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <DocsNav section={section} />
    </MemoryRouter>,
  )

// Real anchors are the whole reason this is a nav and not a radio group: an
// address worth copying, opening in a new tab and middle-clicking. A control
// that merely looks like a link would pass every other assertion here.
test('every page is a real link with an address', async () => {
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('link', { name: 'Arrowz' })).toHaveAttribute('href', '/docs/arrowz')
  await expect.element(screen.getByRole('link', { name: 'Lab', exact: true })).toHaveAttribute('href', '/docs/lab')
  await expect.element(screen.getByRole('link', { name: 'Board element' })).toHaveAttribute('href', '/docs/element')
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

// One column in two levels. Under each page its sections, in page order, each
// a link to its page (the section rides in the navigation's state, since the
// fragment is the lab's), so a section of the other page is one click too.
test('each page lists its sections, as links to that page', async () => {
  const screen = await at('/docs/element')
  const pages = [...screen.container.querySelectorAll('nav > ul > li')]
  expect(pages).toHaveLength(4)
  const sections = pages.map((li) =>
    [...li.querySelectorAll(':scope > ul a')].map((a) => [a.textContent, a.getAttribute('href')]),
  )
  expect(sections).toEqual([
    [
      ['The puzzle', '/docs/arrowz'],
      ['The one rule', '/docs/arrowz'],
      ['What the generator promises', '/docs/arrowz'],
      ['Words', '/docs/arrowz'],
    ],
    [
      ['The board store', '/docs/lab'],
      ['Simple and advanced', '/docs/lab'],
      ['When a setting breaks a rule', '/docs/lab'],
      ['Generating and saving', '/docs/lab'],
      ['The report', '/docs/lab'],
      ['Saved boards and files', '/docs/lab'],
      ['The board', '/docs/lab'],
      ['Keys', '/docs/lab'],
      ['The command palette', '/docs/lab'],
      ['Links', '/docs/lab'],
    ],
    [
      ['Getting started', '/docs/cli'],
      ['Making boards', '/docs/cli'],
      ['Everyday settings', '/docs/cli'],
      ['Every knob', '/docs/cli'],
      ['Where boards are saved', '/docs/cli'],
      ['Environment variables', '/docs/cli'],
      ['A standalone program', '/docs/cli'],
      ['When something goes wrong', '/docs/cli'],
      ['Words', '/docs/cli'],
      ['What --help prints', '/docs/cli'],
    ],
    [
      ['Using it', '/docs/element'],
      ['Properties', '/docs/element'],
      ['Methods and getters', '/docs/element'],
      ['Events', '/docs/element'],
      ['Controls', '/docs/element'],
      ['Zoom and pan', '/docs/element'],
      ['Size, and values the board cannot draw', '/docs/element'],
      ['The margin', '/docs/element'],
      ['The dot grid', '/docs/element'],
      ['Riding the track', '/docs/element'],
      ['Slots', '/docs/element'],
      ['Playing the board', '/docs/element'],
      ['Themes', '/docs/element'],
      ['The WebGL context', '/docs/element'],
      ['Exports', '/docs/element'],
    ],
  ])
})

// The section in view is `aria-current="true"`, and only a section of the page
// on screen can be: the same id on the other page's list stays unmarked.
test('the section in view is current, and only on the page on screen', async () => {
  const screen = await at('/docs/cli', 'docs-knobs')
  await expect.element(screen.getByRole('link', { name: 'Every knob' })).toHaveAttribute('aria-current', 'true')
  expect(screen.container.querySelectorAll('[aria-current="true"]')).toHaveLength(1)
  const elsewhere = await at('/docs/cli', 'docs-props')
  expect(elsewhere.container.querySelectorAll('[aria-current="true"]')).toHaveLength(0)
})

// Under 768 only the page on screen lists its sections; `on` is the class that
// says which.
test('the page on screen is the one marked on', async () => {
  const screen = await at('/docs/cli')
  const on = [...screen.container.querySelectorAll('li.pg.on > a')].map((a) => a.textContent)
  expect(on).toEqual(['Command line'])
})

test('the sections are named in Polish too', async () => {
  useStore.getState().lang.setLang('pl')
  const screen = await at('/docs/element')
  await expect.element(screen.getByRole('navigation', { name: 'Strony dokumentacji' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'Metody i gettery' })).toBeVisible()
  await expect.element(screen.getByRole('link', { name: 'Wszystkie pokrętła' })).toBeVisible()
})

// A section link keeps the lab's fragment: it is the knobs' address, and a
// click on a section of the page on screen must not drop it from the bar.
test('a section link keeps the fragment the address carries', async () => {
  const screen = await at('/docs/element#{"W":25}')
  expect(screen.container.querySelector('nav > ul > li:nth-child(3) > ul a')?.getAttribute('href')).toBe(
    '/docs/cli#{"W":25}',
  )
})

test('the section a navigation asked for is read from its state, and nothing else', () => {
  expect(sectionOf({ docsSection: 'docs-knobs' })).toBe('docs-knobs')
  expect(sectionOf({ docsSection: 7 })).toBeNull()
  expect(sectionOf(null)).toBeNull()
  expect(sectionOf('docs-knobs')).toBeNull()
})
