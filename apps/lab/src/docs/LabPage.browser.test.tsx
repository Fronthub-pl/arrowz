import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { decodeHash } from '../state/url'
import { DocsPageView } from './DocsPageView'
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/lab']}>
      <div className="fw-docs-body">
        <DocsPageView page="lab" />
      </div>
    </MemoryRouter>,
  )

test('the page has its title and ten sections, in order', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h2')?.textContent).toBe('The lab')
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual([
    'docs-store',
    'docs-views',
    'docs-rules',
    'docs-generating',
    'docs-report',
    'docs-saved',
    'docs-board',
    'docs-keys',
    'docs-palette',
    'docs-links',
  ])
})

test('its three tables sit under Keys, The command palette and Links', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('table')].map((t) => t.getAttribute('aria-labelledby'))).toEqual([
    'docs-keys',
    'docs-palette',
    'docs-links',
  ])
})

test('its links go to the settings on the command line page and to the one rule', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('.fw-docs-body p a')].map((a) => a.getAttribute('href'))).toEqual([
    '/docs/cli',
    '/docs/arrowz',
  ])
})

// What a reader would paste after the lab's `#`, as the lab reads a link.
test('the example link is one the lab reads', async () => {
  const screen = await mount()
  // The page's one code block, under Links.
  const blocks = screen.container.querySelectorAll('.fw-docs-block pre')
  expect(blocks).toHaveLength(1)
  const code = blocks.item(0)?.textContent ?? ''
  const read = decodeHash('#' + encodeURIComponent(code))
  expect(read?.params).toEqual({ W: 40, H: 40, seed: 7 })
  expect(read?.view.colored).toBe(true)
  expect(read?.view.lang).toBe('pl')
})

test('in Polish the page, its tables and its palette rows speak Polish', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('h2')?.textContent).toBe('Laboratorium')
  expect(screen.container.querySelector('#docs-keys')?.textContent).toBe('Klawisze')
  const palette = screen.container.querySelector('table[aria-labelledby="docs-palette"]')?.textContent ?? ''
  expect(palette).toContain('Przełącz na angielski')
  expect(palette).toContain('Dokumentacja — Laboratorium')
})
