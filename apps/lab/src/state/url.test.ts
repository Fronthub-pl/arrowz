import { defaultParams } from '@arrowz/engine'
import { describe, expect, it } from 'vitest'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'
import { VIEW_DEFAULTS } from './viewSchema'

/** A hand-written link: what someone pastes, not what the lab writes. */
const link = (json: Record<string, unknown>) => '#' + encodeURIComponent(JSON.stringify(json))

/** Every field away from its default, fractions on the 0.05 step, so a field the codec drops or rounds cannot pass. */
const EVERY_FIELD = {
  ...VIEW,
  cell: 20,
  stroke: 0.65,
  headWidth: 0.35,
  headHeight: 0,
  top: 9,
  colored: true,
  rounded: false,
  highlightLongest: true,
  voids: false,
  showPoints: true,
  pointColor: '#070809',
  pointRadius: 0.15,
  theme: 'gruvbox-dark',
  palette: ['#112233', '#aabbcc'],
  paper: '#010203',
  ink: '#040506',
  highlightColor: '#0a0b0c',
  pad: 0,
  lang: 'pl' as const,
}

describe('the hash codec', () => {
  it('reads back what it wrote', () => {
    const params = { ...defaultParams(), W: 33, H: 66, seed: 9 }
    const back = decodeHash(encodeHash({ params, view: VIEW, carried: {} }))
    expect(back?.params.W).toBe(33)
    expect(back?.params.seed).toBe(9)
    expect(back?.view).toEqual(VIEW)
  })

  it('carries every view field through a round trip', () => {
    const back = decodeHash(encodeHash({ params: defaultParams(), view: EVERY_FIELD, carried: {} }))
    expect(back?.view).toEqual(EVERY_FIELD)
  })

  // The hashchange handler compares the address bar with a fresh encode; a drift would restart a carve on Back.
  it('a written link re-encodes to the same string', () => {
    const first = encodeHash({ params: defaultParams(), view: EVERY_FIELD, carried: { tab: 'library' } })
    const back = decodeHash(first)
    expect(back).not.toBeNull()
    if (back === null) return
    expect(encodeHash({ params: { ...defaultParams(), ...back.params }, view: back.view, carried: back.carried })).toBe(
      first,
    )
  })

  it('writes every field, the empty ones included, and no version', () => {
    const body = JSON.parse(
      decodeURIComponent(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }).slice(1)),
    )
    expect(body.__view.palette).toEqual([])
    expect(body.__view.paper).toBe('')
    expect(body.__view.highlightColor).toBe('')
    expect(body.__view.pad).toBe(VIEW_DEFAULTS.pad)
    expect(body.__view).not.toHaveProperty('viewVersion')
  })

  it('opens a link that names no view field on the defaults', () => {
    expect(decodeHash(link({ W: 40, __view: {} }))?.view).toEqual(VIEW_DEFAULTS)
    expect(decodeHash(link({ W: 40 }))?.view).toEqual(VIEW_DEFAULTS)
  })

  it('opens a field it cannot read on its default', () => {
    const back = decodeHash(
      link({ __view: { cell: 'x', rounded: 'yes', theme: 'drak', paper: 'rebeccapurple', palette: 'red', pad: null } }),
    )?.view
    expect(back?.cell).toBe(VIEW_DEFAULTS.cell)
    expect(back?.rounded).toBe(VIEW_DEFAULTS.rounded)
    expect(back?.theme).toBe('')
    expect(back?.paper).toBe('')
    expect(back?.palette).toEqual([])
    expect(back?.pad).toBe(VIEW_DEFAULTS.pad)
  })

  it('reads a head height of 0 as a head of no height', () => {
    expect(decodeHash(link({ __view: { headHeight: 0 } }))?.view.headHeight).toBe(0)
    expect(decodeHash(link({ __view: { headHeight: '0' } }))?.view.headHeight).toBe(0)
  })

  it('ignores keys the view does not have', () => {
    const back = decodeHash(link({ __view: { hilite: true, highlight: '#ff0000', help: false } }))?.view
    expect(back?.highlightLongest).toBe(false)
    expect(back?.highlightColor).toBe('')
    expect(back).not.toHaveProperty('help')
  })

  it('reads numbers written as strings', () => {
    const back = decodeHash(link({ __view: { cell: '18', stroke: '0.6', top: '7' } }))?.view
    expect(back?.cell).toBe(18)
    expect(back?.stroke).toBe(0.6)
    expect(back?.top).toBe(7)
  })

  it('clamps a hand-edited palette to the cap, drops what the colour input cannot show, and lower-cases', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    expect(decodeHash(link({ __view: { palette: nine } }))?.view.palette).toEqual(nine.slice(0, 8))
    expect(decodeHash(link({ __view: { palette: ['red', '#AABBCC', '#ZZZZZZ'] } }))?.view.palette).toEqual(['#aabbcc'])
  })

  it('reads the language as the page’s own, and carries only the tab', () => {
    const back = decodeHash(link({ __view: { lang: 'pl', tab: 'library' } }))
    expect(back?.view.lang).toBe('pl')
    expect(back?.carried).toEqual({ tab: 'library' })
  })

  it('drops a language the dictionary does not have', () => {
    expect(decodeHash(link({ __view: { lang: 'de' } }))?.view.lang).toBeUndefined()
  })

  it('answers null for an empty or unreadable hash rather than throwing', () => {
    expect(decodeHash('')).toBeNull()
    expect(decodeHash('#')).toBeNull()
    expect(decodeHash('#not-json')).toBeNull()
    expect(decodeHash('#%E0%A4%A')).toBeNull()
  })

  it('reports only the knobs the link actually named', () => {
    const back = decodeHash(link({ W: 40 }))
    expect(back?.params.W).toBe(40)
    expect(back?.params.H).toBeUndefined()
  })
})
