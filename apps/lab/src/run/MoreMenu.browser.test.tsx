import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { MoreMenu } from './MoreMenu'

function Column() {
  return (
    <section>
      <MoreMenu>
        <button type="button">Download SVG</button>
      </MoreMenu>
      <button type="button">outside</button>
    </section>
  )
}

test('the button controls the popover and opens it', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  const pop = document.getElementById(more.element().getAttribute('aria-controls') ?? '')
  expect(pop?.classList.contains('fw-more-pop')).toBe(true)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  await more.click()
  await expect.element(more).toHaveAttribute('aria-expanded', 'true')
  expect(pop?.classList.contains('open')).toBe(true)
})

test('Escape inside closes it and returns the focus to the button', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  screen.getByRole('button', { name: 'Download SVG' }).element().focus()
  await userEvent.keyboard('{Escape}')
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  expect(document.activeElement).toBe(more.element())
})

test('a press outside closes it', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  await screen.getByRole('button', { name: 'outside' }).click()
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
})

test('it reads as closed in another band than the one it was opened in', async () => {
  await page.viewport(1024, 768)
  const screen = await render(<Column />)
  const more = screen.getByRole('button', { name: 'More options' })
  await more.click()
  await page.viewport(1400, 900)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
  await page.viewport(1024, 768)
  await expect.element(more).toHaveAttribute('aria-expanded', 'false')
})
