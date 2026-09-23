import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import './tokens.css'
import './shell.css'
import './console.css'
import './library.css'
import './run.css'
import './docs.css'

// Spec §6 / §7.2: 44px where there is no hover. The runner cannot emulate a
// coarse pointer, so this asks the cascade instead: of the rules inside
// `(pointer: coarse)` that *match* each element, the tallest height or
// min-height it declares. Matching elements rather than selector strings keeps
// the test indifferent to how a rule is spelled.
function coarseHeight(el: Element): number {
  let best = 0
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('pointer: coarse')) continue
      for (const inner of rule.cssRules) {
        if (!(inner instanceof CSSStyleRule)) continue
        let hit: boolean
        try {
          hit = el.matches(inner.selectorText)
        } catch {
          hit = false
        }
        if (!hit) continue
        for (const prop of ['height', 'min-height'] as const) {
          const px = Number.parseFloat(inner.style.getPropertyValue(prop))
          if (Number.isFinite(px)) best = Math.max(best, px)
        }
      }
    }
  }
  return best
}

test.each([
  ['a knob value', '<div class="fw-k"><div class="top"><button class="num">1</button></div></div>', 'button', 44],
  ['a knob choice', '<div class="fw-k"><div class="top"><select></select></div></div>', 'select', 44],
  // Knob rows (handoff 2, PR 2): the handoff's touch sizes — a 44px value and
  // track, a 40px select, a 32px `?` and chip in a 52px row.
  ['a knob row value', '<div class="kv-g"><button class="kv-num">1</button></div>', 'button', 44],
  ['a knob row track', '<div class="kv-g"><div class="kv-track"></div></div>', 'div.kv-track', 44],
  ['a knob row select', '<div class="kv-g"><span class="cc"><select></select></span></div>', 'select', 40],
  ['a knob row ?', '<div class="kv-g"><button class="q">?</button></div>', 'button', 32],
  ['a special-value chip', '<div class="kv-g"><button class="kv-chip">auto</button></div>', 'button', 32],
  ['a dependency header', '<div class="kv-g"><button class="kv-dephd">x</button></div>', 'button', 48],
  [
    'a palette remove',
    '<ul><li class="fw-palette-row"><button class="fw-palette-remove">x</button></li></ul>',
    'button',
    44,
  ],
  ['a switch', '<button class="fw-sw" role="switch"></button>', 'button', 32],
  ['a size chip', '<div class="fw-lib-chips"><button>8x8</button></div>', 'button', 44],
  ['a board row', '<button class="fw-lib-row">row</button>', 'button', 44],
  ['a plain button', '<button class="fw-btn">Refresh</button>', 'button', 44],
  ['a docs link', '<nav class="fw-docs-nav"><a href="#">CLI</a></nav>', 'a', 44],
] as const)('%s is raised for a finger', async (_, html, tag, px) => {
  const screen = await render(<div className="fw" dangerouslySetInnerHTML={{ __html: html }} />)
  const el = screen.container.querySelector(tag)
  if (el === null) throw new Error(`no ${tag}`)
  expect(coarseHeight(el)).toBeGreaterThanOrEqual(px)
})
