import type { ArrowzBoard } from '@arrowz/board-element'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { twoFrames } from '../harness/frames'
import { answeringWorkers, doneMessage } from '../harness/docsWorkers'
import { useStore } from '../state/store'
import { readBoardCmd } from './boards'
import { BoardView } from './DocsBoard'
import { DocsBoardsProvider } from './DocsBoards'
import { createDocsQueue, type DocsQueue } from './docsQueue'
import { DocsMarkdown } from './DocsMarkdown'
import { parseDocs } from './markdown'
import '../design/index.css'

beforeEach(() => useStore.getState().lang.setLang('en'))

/** The panel's stand-in: a box that scrolls, as `.fw-docs` does in the shell. */
function Scrolling({ markdown, queue }: { markdown: string; queue: DocsQueue }) {
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} data-testid="box" style={{ height: '600px', width: '760px', overflowY: 'auto' }}>
      <div className="fw-docs-body">
        <DocsBoardsProvider root={box} queue={queue}>
          <DocsMarkdown root={parseDocs(markdown)} />
        </DocsBoardsProvider>
      </div>
    </div>
  )
}

const mount = (markdown: string, queue: DocsQueue) =>
  render(
    <MemoryRouter initialEntries={['/docs/cli']}>
      <Scrolling markdown={markdown} queue={queue} />
    </MemoryRouter>,
  )

/** Ten comparisons of three, the CLI page's densest shape, with prose between. */
const THIRTY = Array.from({ length: 10 }, (_, row) => {
  const boards = [0, 1, 2]
    .map((i) => `::board[b${row * 3 + i}]{cmd="--width=20 --height=20 --seed=${row * 3 + i}"}`)
    .join('\n')
  return `Paragraph ${row}.\n\n:::compare{stats="pieces"}\n${boards}\n:::`
}).join('\n\n')

/** The most boards the page may hold at once: well under the browser's sixteen contexts (measured: 9 at 1280×800). */
const BUDGET = 12

test('scrolling a page of thirty boards keeps at most twelve and asks once per board', async () => {
  await page.viewport(1280, 800)
  const workers = answeringWorkers()
  const screen = await mount(`# T\n\n## A {#a}\n\n${THIRTY}`, createDocsQueue(workers.make, new Map()))
  const box = screen.container.querySelector<HTMLElement>('[data-testid="box"]')
  if (box === null) throw new Error('no box')
  let most = 0
  for (let top = 0; top <= box.scrollHeight; top += 150) {
    box.scrollTo({ top })
    await twoFrames()
    await new Promise((resolve) => setTimeout(resolve, 20))
    most = Math.max(most, box.querySelectorAll('arrowz-board').length)
  }
  expect(most).toBeGreaterThan(0)
  expect(most).toBeLessThanOrEqual(BUDGET)
  const asked = workers.posted.length
  box.scrollTo({ top: 0 })
  await expect.poll(() => box.querySelector<ArrowzBoard>('figure[aria-label="b0"] arrowz-board')?.board?.W).toBe(20)
  // Coming back draws from the session's boards: not one more request.
  expect(workers.posted.length).toBe(asked)
  expect(new Set(workers.posted.map((p) => p.seed)).size).toBe(workers.posted.length)
}, 60_000)

test('a plain wheel over a board is the page’s, a ⌘/Ctrl wheel is the board’s', async () => {
  await page.viewport(1280, 800)
  const screen = await mount(
    '# T\n\n::board[w]{cmd="--width=20 --height=20 --seed=7"}',
    createDocsQueue(answeringWorkers().make, new Map()),
  )
  await expect.poll(() => screen.container.querySelector<ArrowzBoard>('arrowz-board')?.viewport).toBeTruthy()
  const board = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  const canvas = board?.shadowRoot?.querySelector('canvas')
  const before = board?.viewport?.cellPx
  if (board === null || board === undefined || canvas === null || canvas === undefined || before === undefined)
    throw new Error('no drawn board')
  const r = canvas.getBoundingClientRect()
  const wheel = (init: WheelEventInit) =>
    new WheelEvent('wheel', {
      deltaY: -120,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    })
  const plain = wheel({})
  canvas.dispatchEvent(plain)
  await twoFrames()
  expect(plain.defaultPrevented).toBe(false)
  expect(board.viewport?.cellPx).toBe(before)
  const zoom = wheel({ ctrlKey: true })
  canvas.dispatchEvent(zoom)
  await twoFrames()
  expect(zoom.defaultPrevented).toBe(true)
  expect(board.viewport?.cellPx).toBeGreaterThan(before)
})

// The runner cannot emulate a coarse pointer, so the still board is drawn directly.
test('a still board takes no pointer and draws no controls', async () => {
  const spec = readBoardCmd('--width=12 --height=12 --seed=7').spec
  if (spec === null) throw new Error('the command does not parse')
  const message = doneMessage(spec.params)
  if (message.type !== 'done') throw new Error('not done')
  const queue = createDocsQueue(answeringWorkers().make, new Map())
  const run = await new Promise<Parameters<typeof BoardView>[0]['run']>((resolve) =>
    queue.request(spec.key, spec.params, (job) => {
      if (job.state === 'done') resolve(job.run)
    }),
  )
  const screen = await render(
    <div className="fw-docs-frame" style={{ width: '300px', aspectRatio: '1' }}>
      <BoardView run={run} spec={spec} still />
    </div>,
  )
  const board = screen.container.querySelector<ArrowzBoard>('arrowz-board')
  expect(board?.querySelector('[slot="controls"]')).not.toBeNull()
  expect(board === null ? '' : getComputedStyle(board).pointerEvents).toBe('none')
})

/** A list that answers one query as a phone would; the rest go to the real window. */
function coarseList(query: string): MediaQueryList {
  return {
    matches: true,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }
}

test('under a coarse pointer a docs board is still', async () => {
  const real = window.matchMedia.bind(window)
  const stub = vi
    .spyOn(window, 'matchMedia')
    .mockImplementation((query) => (query === '(pointer: coarse)' ? coarseList(query) : real(query)))
  try {
    const screen = await mount(
      '# T\n\n::board[s]{cmd="--width=12 --height=12 --seed=7"}',
      createDocsQueue(answeringWorkers().make, new Map()),
    )
    await expect.poll(() => screen.container.querySelector<ArrowzBoard>('arrowz-board')?.board?.W).toBe(12)
    const board = screen.container.querySelector<ArrowzBoard>('arrowz-board')
    if (board === null) throw new Error('no board')
    expect(board.classList.contains('still')).toBe(true)
    expect(getComputedStyle(board).pointerEvents).toBe('none')
    expect(board.querySelector('[slot="controls"]')).not.toBeNull()
  } finally {
    stub.mockRestore()
  }
})
