import type { ArrowzBoard } from '@arrowz/board-element'
import { act, useRef } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { answeringWorkers, doneMessage, fakeWorkers } from '../harness/docsWorkers'
import { twoFrames } from '../harness/frames'
import { RunControlContext } from '../run/RunControlContext'
import type { RunControl } from '../run/useRun'
import { useStore } from '../state/store'
import { readBoardCmd } from './boards'
import { DocsBoardsProvider } from './DocsBoards'
import { createDocsQueue, type DocsQueue } from './docsQueue'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
import { NEAR_MARGIN } from './useNear'
// The frame takes its size from docs.css; without the sheets it has none.
import '../design/index.css'

const COLORED = useStore.getState().view.colored
beforeEach(() => useStore.getState().lang.setLang('en'))
afterEach(() => {
  vi.restoreAllMocks()
  useStore.getState().view.setFlag('colored', COLORED)
})

function show(markdown: string, queue: DocsQueue) {
  return render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <div className="fw-docs-body" style={{ width: '720px' }}>
        <DocsBoardsProvider root={null} queue={queue}>
          <DocsMarkdown root={parseDocs(markdown)} />
        </DocsBoardsProvider>
      </div>
    </MemoryRouter>,
  )
}

const BOARD = '# T\n\n## A {#a}\n\n::board[A small board]{cmd="--width=12 --height=12 --seed=7" stats="pieces avgLen"}'
const element = (container: HTMLElement) => container.querySelector<ArrowzBoard>('arrowz-board')

/** Resolves once `useNear` has heard the frame is near: a later observer is told after it, in the same task. */
function nearNow(target: Element): Promise<void> {
  return new Promise((resolve) => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        resolve()
      },
      { rootMargin: NEAR_MARGIN },
    )
    observer.observe(target)
  })
}

test('a board is generated, drawn, captioned and measured', async () => {
  const workers = answeringWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.element(screen.getByRole('figure', { name: 'A small board' })).toBeVisible()
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const params = readBoardCmd('--width=12 --height=12 --seed=7').spec?.params
  if (params === undefined) throw new Error('the command does not parse')
  const expected = doneMessage(params)
  if (expected.type !== 'done') throw new Error('not a done message')
  const stats = [...screen.container.querySelectorAll('.fw-docs-stats > div')].map((d) => [
    d.querySelector('dt')?.textContent,
    d.querySelector('dd')?.textContent,
  ])
  expect(stats).toEqual([
    ['arrows', String(expected.pieces)],
    ['average length', (144 / expected.pieces).toFixed(1)],
  ])
  expect(screen.container.querySelector('.fw-docs-board pre.fw-cmd')?.textContent).toBe(
    'deno task carve --width=12 --height=12 --seed=7',
  )
  expect(workers.posted).toHaveLength(1)
})

test('Copy writes the whole command', async () => {
  const write = vi.fn(() => Promise.resolve())
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText: write } as unknown as Clipboard)
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await screen.getByRole('button', { name: 'Copy: A small board' }).click()
  expect(write).toHaveBeenLastCalledWith('deno task carve --width=12 --height=12 --seed=7')
})

test('the board looks as its command says, not as the lab is set', async () => {
  useStore.getState().view.setFlag('colored', false)
  const screen = await show(
    '# T\n\n::board[Look]{cmd="--width=12 --height=12 --seed=7 --colored --line=0.9 --pad=2 --sharp"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const el = element(screen.container)
  expect(el?.view.colored).toBe(true)
  expect(el?.view.stroke).toBe(0.9)
  expect(el?.view.rounded).toBe(false)
  expect(el?.pad).toBe(2)
  expect(el?.play).toBe(false)
  expect(el?.interactive).toBe(false)
})

test('a theme and the dot grid reach the element as the command says', async () => {
  const screen = await show(
    '# T\n\n::board[Look]{cmd="--width=12 --height=12 --seed=7 --theme=gruvbox-dark --colored --points --point-radius=0.15"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  const el = element(screen.container)
  expect(el?.theme).toBe('gruvbox-dark')
  expect(el?.showPoints).toBe(true)
  expect(el?.pointRadius).toBe(0.15)
  expect(el?.colored).toBe(true)
})

test('a manual board this session made draws again without its button', async () => {
  const queue = createDocsQueue(answeringWorkers().make, new Map())
  const md = '# T\n\n::board[Big]{cmd="--width=24 --height=24 --seed=7" manual about="10"}'
  const first = await show(md, queue)
  await first.getByRole('button', { name: 'Generate (about 10 s)' }).click()
  await expect.poll(() => element(first.container)?.board?.W).toBe(24)
  await first.unmount()
  // Records every moment of the second mount, so a button that shows for one frame is caught.
  let button = false
  const watch = new MutationObserver(() => {
    if (document.body.textContent?.includes('Generate (about') === true) button = true
  })
  watch.observe(document.body, { childList: true, subtree: true, characterData: true })
  try {
    const second = await show(md, queue)
    await expect.poll(() => element(second.container)?.board?.W).toBe(24)
  } finally {
    watch.disconnect()
  }
  expect(button).toBe(false)
})

test('a manual board waits for its button and promises the seconds', async () => {
  const workers = fakeWorkers()
  const screen = await show(
    '# T\n\n::board[Big]{cmd="--width=600 --height=600 --seed=7" manual about="10"}',
    createDocsQueue(workers.make, new Map()),
  )
  const button = screen.getByRole('button', { name: 'Generate (about 10 s)' })
  await expect.element(button).toBeVisible()
  const frame = screen.container.querySelector('.fw-docs-frame')
  if (frame === null) throw new Error('no frame')
  // Only once the board knows it is near would it have asked unbidden.
  await nearNow(frame)
  await twoFrames()
  expect(workers.made).toHaveLength(0)
  await button.click()
  expect(workers.made[0]?.posted.map((m) => m.type)).toEqual(['generate'])
  await expect.element(screen.getByText('Generating…')).toBeVisible()
})

/** A box that scrolls, a board at its top and room below to scroll it out of reach. */
function Scrolling({ markdown, queue }: { markdown: string; queue: DocsQueue }) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} data-testid="box" style={{ height: '400px', width: '720px', overflowY: 'auto' }}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={box} queue={queue}>
          <DocsMarkdown root={parseDocs(markdown)} />
        </DocsBoardsProvider>
      </div>
      <div style={{ height: '4000px' }} />
    </div>
  )
}

test('a failed board says why and Try again asks again', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  await act(async () => workers.made[0]?.answer({ type: 'error', message: 'no room left' }))
  // A string must match the whole text in this vitest-browser.
  await expect.element(screen.getByRole('alert')).toHaveTextContent('It did not generate: no room left')
  await screen.getByRole('button', { name: 'Try again' }).click()
  expect(workers.made[0]?.posted.length).toBe(2)
})

test('a failed board coming near again does not ask again; only Try again does', async () => {
  const workers = fakeWorkers()
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <Scrolling markdown={BOARD} queue={createDocsQueue(workers.make, new Map())} />
    </MemoryRouter>,
  )
  const posted = () => workers.made.flatMap((w) => w.posted).length
  await expect.poll(posted).toBe(1)
  await act(async () => workers.made[0]?.answer({ type: 'error', message: 'no room left' }))
  await expect.element(screen.getByRole('alert')).toBeVisible()
  const box = screen.container.querySelector<HTMLElement>('[data-testid="box"]')
  const frame = screen.container.querySelector('.fw-docs-frame')
  if (box === null || frame === null) throw new Error('no box or frame')
  box.scrollTo({ top: 3000 })
  await twoFrames()
  box.scrollTo({ top: 0 })
  await nearNow(frame)
  await twoFrames()
  expect(posted()).toBe(1)
  await screen.getByRole('button', { name: 'Try again' }).click()
  await expect.poll(posted).toBe(2)
})

test('a board that is not complete says so and draws its empty cells', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  const params = readBoardCmd('--width=12 --height=12 --seed=7').spec?.params
  if (params === undefined) throw new Error('the command does not parse')
  await act(async () => workers.made[0]?.answer(doneMessage(params, false)))
  await expect.element(screen.getByText('Board incomplete.')).toBeVisible()
  expect(element(screen.container)?.view.voids).toBe(true)
})

test('a comparison draws its boards side by side, each with the comparison’s stats', async () => {
  const screen = await show(
    '# T\n\n:::compare{stats="pieces"}\n::board[`--seed=7`]{cmd="--width=12 --height=12 --seed=7"}\n::board[`--seed=8`]{cmd="--width=12 --height=12 --seed=8"}\n:::',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => screen.container.querySelectorAll('.fw-docs-compare arrowz-board').length).toBe(2)
  const figures = [...screen.container.querySelectorAll('.fw-docs-compare figure')]
  expect(figures.map((f) => f.getAttribute('aria-label'))).toEqual(['--seed=7', '--seed=8'])
  for (const figure of figures) expect(figure.querySelectorAll('.fw-docs-stats dt')).toHaveLength(1)
  const [a, b] = figures.map((f) => f.getBoundingClientRect())
  if (a === undefined || b === undefined) throw new Error('two figures')
  expect(a.top).toBeCloseTo(b.top, 0)
  expect(b.left).toBeGreaterThan(a.right)
})

test('a language switch relabels the stats and asks the worker for nothing', async () => {
  const workers = answeringWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  // The element resets its viewport when handed a new board or view.
  const el = element(screen.container)
  const before = { board: el?.board, view: el?.view }
  await act(async () => useStore.getState().lang.setLang('pl'))
  await expect.poll(() => screen.container.querySelector('.fw-docs-stats dt')?.textContent).toBe('strzałki')
  expect(workers.posted).toHaveLength(1)
  expect(element(screen.container)).toBe(el)
  expect(el?.board).toBe(before.board)
  expect(el?.view).toBe(before.view)
})

test('a docs board leaves the lab’s run and result alone', async () => {
  const before = { run: useStore.getState().run, result: useStore.getState().result }
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await expect.poll(() => element(screen.container)?.board?.W).toBe(12)
  expect(useStore.getState().run).toBe(before.run)
  expect(useStore.getState().result).toBe(before.result)
})

test('leaving the Docs tab terminates the docs worker', async () => {
  const workers = fakeWorkers()
  const screen = await show(BOARD, createDocsQueue(workers.make, new Map()))
  await expect.poll(() => workers.made[0]?.posted.length).toBe(1)
  screen.unmount()
  expect(workers.made[0]?.terminated).toBe(true)
})

test('the frame has the board’s proportions before the board exists', async () => {
  const screen = await show(
    '# T\n\n::board[Tall]{cmd="--width=20 --height=40 --seed=7"}',
    createDocsQueue(fakeWorkers().make, new Map()),
  )
  const frame = screen.container.querySelector<HTMLElement>('.fw-docs-frame')
  if (frame === null) throw new Error('no frame')
  const r = frame.getBoundingClientRect()
  // The default margin is four cells on every side: 28 by 48.
  expect(r.width / r.height).toBeCloseTo(28 / 48, 2)
  expect(element(screen.container)).toBeNull()
})

test('Open in lab loads the command into the lab through the run control', async () => {
  const start = vi.fn()
  const control: RunControl = { start, abort: () => {}, hold: () => {}, checkSeeds: () => {} }
  const screen = await render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <RunControlContext value={control}>
        <div className="fw-docs-body" style={{ width: '720px' }}>
          <DocsBoardsProvider root={null} queue={createDocsQueue(answeringWorkers().make, new Map())}>
            <DocsMarkdown root={parseDocs(BOARD)} />
          </DocsBoardsProvider>
        </div>
      </RunControlContext>
    </MemoryRouter>,
  )
  await screen.getByRole('button', { name: 'Open in lab: A small board' }).click()
  expect(start).toHaveBeenCalledTimes(1)
  const { values } = useStore.getState().params
  expect([values.W, values.H, values.seed]).toEqual([12, 12, 7])
})

test('without a run control there is no Open in lab', async () => {
  const screen = await show(BOARD, createDocsQueue(answeringWorkers().make, new Map()))
  await expect.element(screen.getByRole('figure', { name: 'A small board' })).toBeVisible()
  expect(screen.container.querySelector('.fw-docs-boardacts button:nth-child(2)')).toBeNull()
})
