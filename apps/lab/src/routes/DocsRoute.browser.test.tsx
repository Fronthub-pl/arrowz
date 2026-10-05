import { beforeEach, expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { useStore } from '../state/store'
import { DocsBody } from './DocsBody'
import { loadDocsBody } from './DocsRoute'

beforeEach(() => useStore.getState().lang.setLang('en'))

test('the body loads as the docs body', async () => {
  const { default: body } = await loadDocsBody()
  expect(body).toBe(DocsBody)
})

// A deploy that replaced the chunk, or a dropped network: the panel says so
// instead of the rejection reaching React, which would unmount the whole lab.
test('a body that cannot load leaves a line saying so', async () => {
  const { default: Body } = await loadDocsBody(() => Promise.reject(new Error('offline')))
  const screen = await render(<Body page="element" panel={{ current: null }} />)
  await expect.element(screen.getByText('The documentation did not load. Reload the page to try again.')).toBeVisible()
})
