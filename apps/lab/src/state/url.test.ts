import { defaultParams } from '@arrowz/engine'
import { describe, expect, it } from 'vitest'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'

describe('the hash codec', () => {
  it('reads back what it wrote', () => {
    const params = { ...defaultParams(), W: 33, H: 66, seed: 9 }
    const back = decodeHash(encodeHash({ params, view: VIEW, carried: {} }))
    expect(back?.params.W).toBe(33)
    expect(back?.params.seed).toBe(9)
    expect(back?.view).toEqual(VIEW)
  })

  // The format is the deployed one, and some links in circulation carry the
  // view numbers as raw strings, the way an input field's value comes out
  // (Ruling 7).
  it('reads a link the previous lab wrote, whose numbers are strings', () => {
    const legacy =
      '#' +
      encodeURIComponent(
        JSON.stringify({ W: 40, H: 40, __view: { cell: '18', stroke: '0.6', top: '7', rounded: true } }),
      )
    const back = decodeHash(legacy)
    expect(back?.params.W).toBe(40)
    expect(back?.view.cell).toBe(18)
    expect(back?.view.stroke).toBe(0.6)
    expect(back?.view.top).toBe(7)
  })

  // A head height of 0 meant "automatic" before the height became literal, so
  // every link shared before that change carries one; reading it as a height
  // would draw a headless board from an old link.
  it('treats a head height of 0 as unset, as the store reader does', () => {
    const legacy = '#' + encodeURIComponent(JSON.stringify({ __view: { headHeight: '0' } }))
    expect(decodeHash(legacy)?.view.headHeight).toBeUndefined()
  })

  // A `top` of 0 is legal and means no highlight, so absence and zero are not
  // the same answer for the other four numbers.
  it('keeps a zero that is a value rather than an absence', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { top: 0, headWidth: 0 } }))
    expect(decodeHash(link)?.view.top).toBe(0)
    expect(decodeHash(link)?.view.headWidth).toBe(0)
  })

  it('defaults the four flags the way the previous lab does', () => {
    const bare = decodeHash('#' + encodeURIComponent(JSON.stringify({ __view: {} })))
    expect(bare?.view.rounded).toBe(true)
    expect(bare?.view.hilite).toBe(true)
    expect(bare?.view.help).toBe(true)
    expect(bare?.view.colored).toBe(false)
  })

  // Ruling 6 of PR 4a: the language is the page's own now, and only the tab
  // (PR 5's) is carried through untouched.
  it('reads the language as the page’s own, and carries only the tab', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { lang: 'pl', tab: 'library' } }))
    const back = decodeHash(link)
    expect(back?.view.lang).toBe('pl')
    expect(back?.carried).toEqual({ tab: 'library' })
    const round = decodeHash(
      encodeHash({ params: defaultParams(), view: back?.view ?? VIEW, carried: back?.carried ?? {} }),
    )
    expect(round?.view.lang).toBe('pl')
    expect(round?.carried).toEqual({ tab: 'library' })
  })

  it('drops a language the dictionary does not have', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { lang: 'de' } }))
    expect(decodeHash(link)?.view.lang).toBeUndefined()
  })

  it('answers null for an empty or unreadable hash rather than throwing', () => {
    expect(decodeHash('')).toBeNull()
    expect(decodeHash('#')).toBeNull()
    expect(decodeHash('#not-json')).toBeNull()
    expect(decodeHash('#%E0%A4%A')).toBeNull()
  })

  it('reports only the knobs the link actually named', () => {
    const back = decodeHash('#' + encodeURIComponent(JSON.stringify({ W: 40 })))
    expect(back?.params.W).toBe(40)
    expect(back?.params.H).toBeUndefined()
  })

  it('carries the chosen theme through a round trip', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'gruvbox-dark' }, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBe('gruvbox-dark')
  })

  it('leaves the page on its own theme when a link names none', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBeUndefined()
  })

  it('carries a custom palette through a round trip', () => {
    const hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, palette: ['#112233', '#aabbcc'] },
      carried: {},
    })
    expect(decodeHash(hash)?.view.palette).toEqual(['#112233', '#aabbcc'])
  })

  // A link that predates custom palettes carries no `palette` key at all —
  // not even an empty one — so this must read as "the page keeps its own",
  // the same absence `theme` reads above.
  it('reads a link that predates custom palettes as naming no palette', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.palette).toBeUndefined()
  })

  it('does not write an empty palette into the link', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, palette: [] }, carried: {} })
    expect(hash).not.toContain('palette')
  })

  // Ruling: decode clamps to PALETTE_CAP (8), so a hand-edited link cannot
  // hand the editor more colour fields than it can manage.
  it('clamps a hand-edited palette to the cap', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { palette: nine } }))
    expect(decodeHash(link)?.view.palette).toHaveLength(8)
    expect(decodeHash(link)?.view.palette).toEqual(nine.slice(0, 8))
  })

  // Ruling: only `#rrggbb` survives — the lab editor's `<input type="color">`
  // can show nothing else, and showing black for "red" is worse than dropping it.
  it('drops palette entries the colour input cannot display', () => {
    const link =
      '#' + encodeURIComponent(JSON.stringify({ __view: { palette: ['red', '#112233', 'not-a-color', '#ZZZZZZ'] } }))
    expect(decodeHash(link)?.view.palette).toEqual(['#112233'])
  })
})
