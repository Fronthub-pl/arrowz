import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'
import { RowShell, rowIds } from './RowShell'

test('rowIds spells every part of a row from the row’s own id', () => {
  expect(rowIds('view-cell')).toEqual({
    help: 'view-cell-help',
    label: 'view-cell-label',
    why: 'view-cell-why',
    ends: 'view-cell-ends',
    entry: 'view-cell-entry',
  })
})

test('the ? controls the description, and the label names the control', async () => {
  const screen = await render(
    <RowShell id="view-cell" name="square" helpText="how big" labelAs="for" control={<input id="view-cell" />} />,
  )
  const q = screen.container.querySelector('button.q')
  expect(q?.getAttribute('aria-controls')).toBe('view-cell-help')
  expect(screen.container.querySelector('#view-cell-help')?.textContent).toBe('how big')
  expect(screen.container.querySelector('label.kv-lab')?.getAttribute('for')).toBe('view-cell')
})

test('a span label carries the row’s label id', async () => {
  const screen = await render(
    <RowShell id="view-rounded" name="round" helpText="corners" labelAs="span" control={<button type="button" />} />,
  )
  const label = screen.container.querySelector('span.kv-lab')
  expect(label?.id).toBe('view-rounded-label')
  expect(label?.textContent).toBe('round')
})

test('a row without a title carries no title attribute', async () => {
  const screen = await render(<RowShell id="a" name="a" helpText="" labelAs="span" control={null} />)
  expect(screen.container.querySelector('.kv-row')?.hasAttribute('title')).toBe(false)
})

test('the row’s classes read kv-row, then choice, bad, off', async () => {
  const screen = await render(
    <RowShell id="k" name="k" helpText="" labelAs="for" title="t" choice bad off control={null} />,
  )
  const row = screen.container.querySelector('.kv-row')
  expect(row?.className).toBe('kv-row choice bad off')
  expect(row?.getAttribute('title')).toBe('t')
})

test('the after slot sits between the line and the description', async () => {
  const screen = await render(
    <RowShell id="k" name="k" helpText="h" labelAs="for" control={null} after={<p className="kv-why">why</p>} />,
  )
  const children = [...(screen.container.querySelector('.kv-row')?.children ?? [])].map((el) => el.className)
  expect(children).toEqual(['ln', 'kv-why', 'kv-help fw-vh'])
})
