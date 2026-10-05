import type { ArrowzBoard } from '@arrowz/board-element'
import { act } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsPageView } from './DocsPageView'
// The boards take their size from docs.css; without the sheets they have none.
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/docs/arrowz']}>
      <div className="fw-docs-body">
        <DocsPageView page="arrowz" />
      </div>
    </MemoryRouter>,
  )

const figures = (container: HTMLElement) =>
  [...container.querySelectorAll('figure')].map((figure) => figure.getAttribute('aria-label'))

test('the page has its title and four sections, in order', async () => {
  const screen = await mount()
  expect(screen.container.querySelector('h2')?.textContent).toBe('Arrowz')
  expect([...screen.container.querySelectorAll('h3')].map((h) => h.id)).toEqual([
    'docs-puzzle',
    'docs-rule',
    'docs-promises',
    'docs-words',
  ])
})

test('the rule is played on its three boards, in the order the prose takes them', async () => {
  const screen = await mount()
  expect(figures(screen.container)).toEqual([
    'An arrow with a clear path to the edge in front of its arrowhead',
    'An arrow with another arrow standing in its path to the edge',
    'A horseshoe-shaped arrow with another arrow inside its bend, still free to leave',
  ])
  expect(screen.container.querySelectorAll('figure arrowz-board[play]')).toHaveLength(3)
})

test('the promises and the words are lists of six', async () => {
  const screen = await mount()
  expect([...screen.container.querySelectorAll('ul')].map((ul) => ul.children.length)).toEqual([6, 6])
})

test('the settings link goes to the command line page', async () => {
  const screen = await mount()
  await expect.element(screen.getByRole('link', { name: 'Command line' })).toHaveAttribute('href', '/docs/cli')
})

test('in Polish the page and its boards speak Polish', async () => {
  const screen = await mount()
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('#docs-rule')?.textContent).toBe('Jedna reguła')
  expect(figures(screen.container)[0]).toBe('Strzałka z wolną drogą do krawędzi przed grotem')
})

test('playing one board leaves the others as they were', async () => {
  const screen = await mount()
  const boards = [...screen.container.querySelectorAll<ArrowzBoard>('figure arrowz-board')]
  const first = boards[0]
  if (first === undefined) throw new Error('no board')
  await expect.poll(() => first.viewport).not.toBeNull()
  await act(async () => {
    first.dispatchEvent(
      new CustomEvent('piece-removed', { detail: { pieceId: 0, left: 1 }, bubbles: true, composed: true }),
    )
  })
  const lines = [...screen.container.querySelectorAll('figure [role="status"]')].map((s) => s.textContent)
  expect(lines).toEqual([
    'It left: its path to the edge was clear.',
    'Play any arrow and see what happens.',
    'Play any arrow and see what happens.',
  ])
})
