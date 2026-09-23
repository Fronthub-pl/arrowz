import { expect, test } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { useBand, useLowWindow } from './useLayoutBand'

function Probe() {
  return <p data-testid="probe">{`${useBand()} ${useLowWindow() ? 'low' : 'tall'}`}</p>
}

// Both sides of every edge the stylesheets use, so an off-by-one query
// (1279 vs 1280) is caught here and not by eye.
test.each([
  [1600, 900, 'xl tall'],
  [1599, 900, 'l tall'],
  [1280, 900, 'l tall'],
  [1279, 900, 'm tall'],
  [1024, 900, 'm tall'],
  [1023, 900, 's tall'],
  [768, 900, 's tall'],
  [767, 900, 'xs tall'],
  [924, 540, 's low'],
  [924, 699, 's low'],
  [924, 700, 's tall'],
  [600, 500, 'xs tall'],
] as const)('%d×%d reads %s', async (w, h, text) => {
  await page.viewport(w, h)
  const screen = await render(<Probe />)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent(text)
})

test('a resize is followed without a remount', async () => {
  await page.viewport(1400, 900)
  const screen = await render(<Probe />)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent('l tall')
  await page.viewport(900, 600)
  await expect.element(screen.getByTestId('probe')).toHaveTextContent('s low')
})
