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

  it('defaults the three flags the way the previous lab does', () => {
    const bare = decodeHash('#' + encodeURIComponent(JSON.stringify({ __view: {} })))
    expect(bare?.view.rounded).toBe(true)
    expect(bare?.view.hilite).toBe(true)
    expect(bare?.view.colored).toBe(false)
  })

  // Handoff 2, PR 2 removed the descriptions switch: a link from before still
  // loads, and its `help` is simply not part of the view any more.
  it('loads a link that still carries the old help flag, and drops it', () => {
    const old = decodeHash('#' + encodeURIComponent(JSON.stringify({ W: 30, __view: { help: false, hilite: false } })))
    expect(old?.params.W).toBe(30)
    expect(old?.view.hilite).toBe(false)
    expect(old?.view).not.toHaveProperty('help')
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

  // Finding 8 (final whole-addendum review): `HEX_COLOR` accepts uppercase,
  // but the native colour input always reports lowercase, so a hand-edited
  // `#AABBCC` must normalise on decode or the hash this page rewrites would
  // differ in case from the one that was pasted in.
  it('normalises a hand-edited uppercase hex to lowercase', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { palette: ['#AABBCC', '#DeF012'] } }))
    expect(decodeHash(link)?.view.palette).toEqual(['#aabbcc', '#def012'])
  })

  it('carries the board colours and the point grid through a round trip', () => {
    const hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, paper: '#010203', ink: '#040506', showPoints: true, pointColor: '#070809', pointRadius: 0.2 },
      carried: {},
    })
    const back = decodeHash(hash)?.view
    expect(back?.paper).toBe('#010203')
    expect(back?.ink).toBe('#040506')
    expect(back?.showPoints).toBe(true)
    expect(back?.pointColor).toBe('#070809')
    expect(back?.pointRadius).toBe(0.2)
  })

  it('reads a link that predates the board colours as naming none', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.paper).toBeUndefined()
    expect(decodeHash(hash)?.view.ink).toBeUndefined()
  })

  // The same guard the palette's own case above pins for `[]`: `''` is the
  // slice's own "not set" for `paper`/`ink` (`viewFor` hands it over on every
  // fresh page load), so a link must not grow keys naming nothing.
  it('does not write empty board colours into the link', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, paper: '', ink: '' }, carried: {} })
    expect(hash).not.toContain('paper')
    expect(hash).not.toContain('ink')
  })

  it('drops a hand-edited colour the editor could not show', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { paper: 'rebeccapurple' } }))
    expect(decodeHash(link)?.view.paper).toBeUndefined()
  })

  it('carries the highlight colour through a round trip', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, highlight: '#0a0b0c' }, carried: {} })
    expect(decodeHash(hash)?.view.highlight).toBe('#0a0b0c')
  })

  it('reads a link that predates the highlight colour as naming none', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.highlight).toBeUndefined()
  })

  // The same guard `paper`/`ink` pin above: `''` is the slice's own "not
  // set", so a link that never had the highlight touched should not grow a
  // key naming nothing.
  it('does not write an empty highlight colour into the link', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, highlight: '' }, carried: {} })
    expect(hash).not.toContain('highlight')
  })

  it('drops a hand-edited highlight colour the editor could not show', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { highlight: 'rebeccapurple' } }))
    expect(decodeHash(link)?.view.highlight).toBeUndefined()
  })

  it('carries a theme and custom colours together (Ruling 6)', () => {
    const hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, theme: 'gruvbox-dark', palette: ['#112233'], paper: '#010203' },
      carried: {},
    })
    const back = decodeHash(hash)?.view
    expect(back?.theme).toBe('gruvbox-dark')
    expect(back?.palette).toEqual(['#112233'])
    expect(back?.paper).toBe('#010203')
  })
})
