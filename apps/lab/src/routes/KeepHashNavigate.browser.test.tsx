import { defaultParams } from '@arrowz/engine'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { App } from '../App'
import { loadRunDone, resetApp } from '../harness/mountApp'
import { useStore } from '../state/store'
import { encodeHash } from '../state/url'
import { VIEW } from '../state/url.fixtures'

afterEach(() => resetApp('advanced'))

// The whole app, not the redirect alone: the fragment is lost to the order of
// effects between `Navigate` (a child) and `useUrlHash` (in `Shell`, its parent).
const CASES = [
  { from: '/no-such-page', to: '/' },
  { from: '/docs', to: '/docs/element' },
  { from: '/docs/no-such-page', to: '/docs/element' },
]

for (const { from, to } of CASES) {
  it(`opens a link under ${from} on the knobs it names`, async () => {
    resetApp('advanced')
    const link = encodeHash({ params: { ...defaultParams(), W: 44, H: 88 }, view: VIEW, carried: {} })
    history.replaceState(null, '', from + link)
    await render(<App />)
    await expect.poll(() => location.pathname).toBe(to)
    expect(useStore.getState().params.values.W).toBe(44)
    expect(useStore.getState().params.values.H).toBe(88)
    await loadRunDone()
  }, 40_000)
}
