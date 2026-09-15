import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { DraftNumber } from './DraftNumber'

test('opens on the number, commits what was typed on Enter, and hands the focus back', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'width' }), '40')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(40)
  await expect.element(screen.getByRole('button', { name: 'width: 25' })).toHaveFocus()
})

// Spec §5.5 and Ruling 4 name "Enter or blur"; the case above covers Enter.
test('commits what was typed on blur too', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox', { name: 'width' }), '40')
  await userEvent.tab()
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(40)
})

// No clamp here: a caller with narrower bounds than the knob's (the mix row)
// has to see the number that was typed.
test('hands over a number outside any range untouched', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox'), '99999')
  await userEvent.keyboard('{Enter}')
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(99999)
})

test('commits nothing for a blank or unreadable draft, and nothing on Escape', async () => {
  const onCommit = vi.fn()
  const screen = await render(<DraftNumber label="width" value={25} onCommit={onCommit} />)
  for (const typed of ['', 'abc']) {
    await screen.getByRole('button', { name: 'width: 25' }).click()
    await userEvent.fill(screen.getByRole('textbox'), typed)
    await userEvent.keyboard('{Enter}')
  }
  await screen.getByRole('button', { name: 'width: 25' }).click()
  await userEvent.fill(screen.getByRole('textbox'), '12')
  await userEvent.keyboard('{Escape}')
  expect(onCommit).not.toHaveBeenCalled()
})

test('names the value by its word where the CLI has one', async () => {
  const screen = await render(<DraftNumber label="maximum length" value={0} word="auto" onCommit={() => {}} />)
  await expect.element(screen.getByRole('button', { name: 'maximum length: auto' })).toMatchTextContent(/auto0/)
})
