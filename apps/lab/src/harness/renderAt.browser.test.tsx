import { useLocation } from 'react-router'
import { expect, test } from 'vitest'
import { renderAt } from './renderAt'

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

test('renderAt mounts at the address, inside the .fw root, with the given box', async () => {
  const screen = await renderAt(<Where />, { path: '/boards', style: { width: '300px' } })
  const where = screen.getByTestId('where').element()
  expect(where.textContent).toBe('/boards')
  const root = where.closest('.fw')
  expect(root).not.toBeNull()
  expect(root instanceof HTMLElement ? root.style.width : '').toBe('300px')
})

test('renderAt defaults to the lab, /', async () => {
  const screen = await renderAt(<Where />)
  expect(screen.getByTestId('where').element().textContent).toBe('/')
})
