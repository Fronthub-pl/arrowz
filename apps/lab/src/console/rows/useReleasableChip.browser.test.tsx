import { useState } from 'react'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { expect, test } from 'vitest'
import { useReleasableChip } from './useReleasableChip'

/** A row that holds `value` and shows where its chip would release to. */
function Probe({ value, special }: { value: number; special: boolean }) {
  const release = useReleasableChip(value, special, () => 99)
  const [shown, setShown] = useState<number | null>(null)
  return (
    <button type="button" onClick={() => setShown(release())}>
      {shown === null ? 'release' : String(shown)}
    </button>
  )
}

test('a released chip goes back to the last value the row held', async () => {
  const screen = await render(<Probe value={7} special={false} />)
  await screen.rerender(<Probe value={0} special />)
  await userEvent.click(screen.getByRole('button'))
  await expect.element(screen.getByRole('button')).toHaveTextContent('7')
})

test('with no value held before, a released chip goes to the fallback', async () => {
  const screen = await render(<Probe value={0} special />)
  await userEvent.click(screen.getByRole('button'))
  await expect.element(screen.getByRole('button')).toHaveTextContent('99')
})
