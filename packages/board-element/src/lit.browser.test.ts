// Proves the toolchain: Lit compiles without decorators, renders in the
// Chromium of Vitest browser mode, and shadow DOM is real.
import { html, LitElement } from 'lit'
import { expect, test } from 'vitest'

class ProbeElement extends LitElement {
  static properties = { label: { type: String } }
  declare label: string
  constructor() {
    super()
    this.label = 'probe'
  }
  override render() {
    return html`<span>${this.label}</span>`
  }
}
customElements.define('arrowz-probe', ProbeElement)

test('a Lit element renders into its shadow root in Chromium', async () => {
  const el = document.createElement('arrowz-probe') as ProbeElement
  document.body.append(el)
  el.label = 'hello'
  await el.updateComplete
  expect(el.shadowRoot?.querySelector('span')?.textContent).toBe('hello')
  expect(typeof SVGSVGElement).toBe('function')
  el.remove()
})
