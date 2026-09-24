import { COMMAND_PREFIX } from '@arrowz/engine/command'
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import { CommandText } from './CommandText'
// The selection case measures rendered text, which needs the real cascade.
import '../design/tokens.css'
import '../design/shell.css'
import '../design/run.css'

const COMMAND = `${COMMAND_PREFIX} --width=137 --height=251 --seed=987654 --pstraight=0.83 --colored --sharp`

test('splits the command into the prefix and one span per flag', async () => {
  const screen = await render(
    <pre className="fw-cmd">
      <CommandText command={COMMAND} />
    </pre>,
  )
  const lines = [...screen.container.querySelectorAll('.fw-cmd > .ln')]
  expect(lines.map((l) => l.textContent)).toEqual([
    COMMAND_PREFIX,
    '--width=137',
    '--height=251',
    '--seed=987654',
    '--pstraight=0.83',
    '--colored',
    '--sharp',
  ])
  expect(lines[1]?.querySelector('.f')?.textContent).toBe('--width=')
  expect(lines[1]?.querySelector('b')?.textContent).toBe('137')
  // A flag without a value is one bold run, not a name with an empty value.
  expect(lines[5]?.querySelector('.f')).toBeNull()
  expect(lines[5]?.querySelector('b')?.textContent).toBe('--colored')
  // The DOM text is the command itself, spaces included.
  expect(screen.container.querySelector('.fw-cmd')?.textContent).toBe(COMMAND)
})

test('leaves a command without the program prefix whole', async () => {
  const screen = await render(
    <pre className="fw-cmd">
      <CommandText command="carve --width=8" />
    </pre>,
  )
  expect(screen.container.querySelectorAll('.ln')).toHaveLength(0)
  expect(screen.container.querySelector('.fw-cmd')?.textContent).toBe('carve --width=8')
})

// Wrapped lines break only between flags, and a selection of the box reads
// back as the command with its spaces: the property a flex box would lose,
// because white space between flex items is not rendered.
test('breaks lines only between flags, and a selection keeps the spaces', async () => {
  const screen = await render(
    <div className="fw" style={{ width: '220px' }}>
      <pre className="fw-cmd">
        <CommandText command={COMMAND} />
      </pre>
    </div>,
  )
  const pre = screen.container.querySelector<HTMLElement>('.fw-cmd')
  if (pre === null) throw new Error('no command box')
  for (const line of pre.querySelectorAll('.ln')) {
    // `.ln`'s getClientRects() returns one rect per child run even on one
    // visual line, so `toHaveLength(1)` is no proxy for "did not wrap"; a broken
    // flag is one with rects at two different `top`s.
    const tops = new Set([...line.getClientRects()].map((r) => r.top))
    expect(tops.size, line.textContent ?? '').toBe(1)
  }
  // The box did wrap, or the case above proved nothing.
  expect(pre.querySelectorAll('.ln')[0]?.getBoundingClientRect().top).toBeLessThan(
    pre.querySelectorAll('.ln')[6]?.getBoundingClientRect().top ?? 0,
  )
  const selection = window.getSelection()
  if (selection === null) throw new Error('no selection')
  selection.selectAllChildren(pre)
  expect(selection.toString().replace(/\s+/g, ' ').trim()).toBe(COMMAND)
})
