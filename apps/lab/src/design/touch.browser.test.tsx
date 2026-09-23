import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import './tokens.css'
import './shell.css'
import './console.css'
import './library.css'
import './run.css'
import './docs.css'

// Spec §6 / §7.2: 44px where there is no hover. The runner cannot emulate a
// coarse pointer (nor a phone's width at every size), so this asks the
// cascade instead: of the rules inside a media condition naming `condition`
// that *match* each element, the tallest height or min-height it declares.
// Matching elements rather than selector strings keeps the test indifferent
// to how a rule is spelled.
function declaredHeight(el: Element, condition: string): number {
  let best = 0
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes(condition)) continue
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
  // The saved boards' rail and rows (handoff 2, PR 6).
  ['a size tab', '<div class="fw-console library"><div class="fw-rail"><button>8×8</button></div></div>', 'button', 44],
  ['a board row', '<button class="fw-brow">row</button>', 'button', 52],
  ['the list’s refresh', '<div class="fw-blist-hd"><button class="kv-chip">Refresh</button></div>', 'button', 44],
  ['a plain button', '<button class="fw-btn">Refresh</button>', 'button', 44],
  ['a docs link', '<nav class="fw-docs-nav"><a href="#">CLI</a></nav>', 'a', 44],
  // Handoff 2, PR 7: the M/S bar's controls under a finger.
  [
    'a bar control',
    '<div class="fw-lab"><div class="fw-stage"><section class="fw-run-col"><button class="fw-go">Generate</button></section></div></div>',
    'button',
    44,
  ],
] as const)('%s is raised for a finger', async (_, html, tag, px) => {
  const screen = await render(<div className="fw" dangerouslySetInnerHTML={{ __html: html }} />)
  const el = screen.container.querySelector(tag)
  if (el === null) throw new Error(`no ${tag}`)
  expect(declaredHeight(el, 'pointer: coarse')).toBeGreaterThanOrEqual(px)
})

// Handoff 2, PR 7: a phone gets a finger's sizes whatever its pointer reports
// — the coarse blocks name the XS width too (spec §5).
test.each([
  ['a knob row value', '<div class="kv-g"><button class="kv-num">1</button></div>', 'button', 44],
  ['a knob row select', '<div class="kv-g"><span class="cc"><select></select></span></div>', 'select', 40],
  ['a dependency header', '<div class="kv-g"><button class="kv-dephd">x</button></div>', 'button', 48],
  ['a run alternative', '<div class="fw-alt"><button>New seed</button></div>', 'button', 44],
  ['a preset row', '<div class="fw-pp-col"><button>x</button></div>', 'button', 44],
  ['a tab', '<div class="fw-tabrow"><button>Lab</button></div>', 'button', 0],
  ['a docs link', '<nav class="fw-docs-nav"><a href="#">CLI</a></nav>', 'a', 44],
  [
    'Delete from disk',
    '<div class="fw-bcol"><div class="fw-alt"><button class="danger">Delete</button></div></div>',
    'button',
    44,
  ],
] as const)('%s is raised at XS', async (_, html, tag, px) => {
  const screen = await render(<div className="fw" dangerouslySetInnerHTML={{ __html: html }} />)
  const el = screen.container.querySelector(tag)
  if (el === null) throw new Error(`no ${tag}`)
  expect(declaredHeight(el, 'max-width: 767px')).toBeGreaterThanOrEqual(px)
})

/** Of the coarse-pointer rules that match `el`'s `::before`, the largest value each declares for `prop`. */
function coarseBefore(el: Element, prop: 'height' | 'width'): number {
  let best = 0
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('pointer: coarse')) continue
      for (const inner of rule.cssRules) {
        if (!(inner instanceof CSSStyleRule) || !inner.selectorText.endsWith('::before')) continue
        let hit: boolean
        try {
          hit = el.matches(inner.selectorText.slice(0, -'::before'.length))
        } catch {
          hit = false
        }
        const px = Number.parseFloat(inner.style.getPropertyValue(prop))
        if (hit && Number.isFinite(px)) best = Math.max(best, px)
      }
    }
  }
  return best
}

// Handoff 2, PR 4: the switch is drawn 36×18 for a finger, lighter than the
// 52×32 track it replaces; the target a finger meets is its `::before`, 44×44
// around the drawing (§7.2), so the lighter look costs no target size.
test('a switch is drawn small for a finger and raised to a 44px target around it', async () => {
  const screen = await render(
    <div className="fw" dangerouslySetInnerHTML={{ __html: '<button class="fw-sw" role="switch"></button>' }} />,
  )
  const el = screen.container.querySelector('button')
  if (el === null) throw new Error('no switch')
  expect(declaredHeight(el, 'pointer: coarse')).toBe(18)
  expect(coarseBefore(el, 'height')).toBeGreaterThanOrEqual(44)
  expect(coarseBefore(el, 'width')).toBeGreaterThanOrEqual(44)
  expect(declaredHeight(el, 'max-width: 767px')).toBe(18)
})
