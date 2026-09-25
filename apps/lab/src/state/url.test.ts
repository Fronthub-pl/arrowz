import { defaultParams } from '@arrowz/engine'
import { VIEW_VERSION } from '@arrowz/engine/command'
import { describe, expect, it } from 'vitest'
import { decodeHash, encodeHash } from './url'
import { VIEW } from './url.fixtures'

/** A link as the lab wrote it before the view version: no `viewVersion` key. */
const legacyLink = (view: Record<string, unknown>) => '#' + encodeURIComponent(JSON.stringify({ __view: view }))

describe('the hash codec', () => {
  it('reads back what it wrote', () => {
    const params = { ...defaultParams(), W: 33, H: 66, seed: 9 }
    const back = decodeHash(encodeHash({ params, view: VIEW, carried: {} }))
    expect(back?.params.W).toBe(33)
    expect(back?.params.seed).toBe(9)
    expect(back?.view).toEqual(VIEW)
  })

  // Some links in circulation carry the view numbers as raw strings, the way
  // an input field's value comes out.
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
  it('treats a head height of 0 in a legacy link as unset, as the store reader does', () => {
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

  it('defaults rounded and colored the way the previous lab does, and the highlight off', () => {
    const bare = decodeHash('#' + encodeURIComponent(JSON.stringify({ __view: {} })))
    expect(bare?.view.rounded).toBe(true)
    // Like `colored`: a link that predates the flag, or never named it, opens
    // with the highlight off. Turning it on is the option.
    expect(bare?.view.highlightLongest).toBe(false)
    expect(bare?.view.colored).toBe(false)
  })

  it('reads a link that states the highlight on, and keeps it stated', () => {
    const on = decodeHash('#' + encodeURIComponent(JSON.stringify({ __view: { highlightLongest: true } })))
    expect(on?.view.highlightLongest).toBe(true)
  })

  // A link the previous lab wrote still carries the old key name; the reader
  // falls back to it so every link in circulation still opens the same.
  it('reads a legacy link naming the old flag and colour keys onto the new fields', () => {
    const legacy = decodeHash(
      '#' + encodeURIComponent(JSON.stringify({ __view: { hilite: true, highlight: '#ff0000' } })),
    )
    expect(legacy?.view.highlightLongest).toBe(true)
    expect(legacy?.view.highlightColor).toBe('#ff0000')
  })

  // A link naming the new key wins over a stray old one, rather than the old
  // key overriding what the link actually states.
  it('prefers the new key over the old one when a link somehow carries both', () => {
    const link = decodeHash(
      '#' +
        encodeURIComponent(
          JSON.stringify({
            __view: { hilite: true, highlightLongest: false, highlight: '#111111', highlightColor: '#222222' },
          }),
        ),
    )
    expect(link?.view.highlightLongest).toBe(false)
    expect(link?.view.highlightColor).toBe('#222222')
  })

  it('writes only the new keys, never the old ones', () => {
    const hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, highlightLongest: true, highlightColor: '#0a0b0c' },
      carried: {},
    })
    const body = decodeURIComponent(hash.slice(1))
    expect(body).toContain('"highlightLongest":true')
    expect(body).toContain('"highlightColor":"#0a0b0c"')
    expect(body).not.toContain('"hilite"')
    expect(body).not.toMatch(/"highlight":/)
  })

  // An old link carrying `help` still loads, without it.
  it('loads a link that still carries the old help flag, and drops it', () => {
    const old = decodeHash(
      '#' + encodeURIComponent(JSON.stringify({ W: 30, __view: { help: false, highlightLongest: false } })),
    )
    expect(old?.params.W).toBe(30)
    expect(old?.view.highlightLongest).toBe(false)
    expect(old?.view).not.toHaveProperty('help')
  })

  // Only the tab is carried through untouched.
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

  it('leaves the page on its own colours when a legacy link names none', () => {
    const back = decodeHash(legacyLink({ rounded: true }))?.view
    expect(back?.theme).toBeUndefined()
    expect(back?.palette).toBeUndefined()
    expect(back?.paper).toBeUndefined()
    expect(back?.ink).toBeUndefined()
    expect(back?.highlightColor).toBeUndefined()
  })

  it('carries a custom palette through a round trip', () => {
    const hash = encodeHash({
      params: defaultParams(),
      view: { ...VIEW, palette: ['#112233', '#aabbcc'] },
      carried: {},
    })
    expect(decodeHash(hash)?.view.palette).toEqual(['#112233', '#aabbcc'])
  })

  it('does not write an empty palette into the link', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, palette: [] }, carried: {} })
    expect(hash).not.toContain('palette')
  })

  // A hand-edited link cannot hand the editor more than `PALETTE_CAP` colours.
  it('clamps a hand-edited palette to the cap', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `#${String(i).repeat(6)}`)
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { palette: nine } }))
    expect(decodeHash(link)?.view.palette).toHaveLength(8)
    expect(decodeHash(link)?.view.palette).toEqual(nine.slice(0, 8))
  })

  // Only `#rrggbb` survives (see `palette` in url.ts).
  it('drops palette entries the colour input cannot display', () => {
    const link =
      '#' + encodeURIComponent(JSON.stringify({ __view: { palette: ['red', '#112233', 'not-a-color', '#ZZZZZZ'] } }))
    expect(decodeHash(link)?.view.palette).toEqual(['#112233'])
  })

  // The native colour input reports lowercase, so decode normalises to match.
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

  // `''` is the slice's "not set" (every fresh page has it), so a link must
  // not grow keys naming nothing.
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
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, highlightColor: '#0a0b0c' }, carried: {} })
    expect(decodeHash(hash)?.view.highlightColor).toBe('#0a0b0c')
  })

  it('does not write an empty highlight colour into the link', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, highlightColor: '' }, carried: {} })
    expect(hash).not.toContain('highlightColor')
  })

  it('drops a hand-edited highlight colour the editor could not show', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { highlightColor: 'rebeccapurple' } }))
    expect(decodeHash(link)?.view.highlightColor).toBeUndefined()
  })

  // 0 is a legal margin, not "unset", so it must round-trip.
  it('carries the margin through a round trip, including zero', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, pad: 0 }, carried: {} })
    expect(decodeHash(hash)?.view.pad).toBe(0)
  })

  it('reads a link that predates the margin as naming none', () => {
    const hash = encodeHash({ params: defaultParams(), view: VIEW, carried: {} })
    expect(decodeHash(hash)?.view.pad).toBeUndefined()
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

  it('writes the view version into every link', () => {
    const body = decodeURIComponent(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }).slice(1))
    expect(JSON.parse(body).__view.viewVersion).toBe(VIEW_VERSION)
  })

  it('reads a link written now that names no colours as naming none, not as silent', () => {
    const back = decodeHash(encodeHash({ params: defaultParams(), view: VIEW, carried: {} }))?.view
    expect(back?.theme).toBe('')
    expect(back?.palette).toEqual([])
    expect(back?.paper).toBe('')
    expect(back?.ink).toBe('')
    expect(back?.highlightColor).toBe('')
  })

  it('keeps a head height of 0 in a link written now', () => {
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, headHeight: 0 }, carried: {} })
    expect(decodeHash(hash)?.view.headHeight).toBe(0)
  })

  it('drops a theme the element does not have: absent in a legacy link, none in a link written now', () => {
    expect(decodeHash(legacyLink({ theme: 'drak' }))?.view.theme).toBeUndefined()
    const hash = encodeHash({ params: defaultParams(), view: { ...VIEW, theme: 'drak' }, carried: {} })
    expect(decodeHash(hash)?.view.theme).toBe('')
  })

  it('carries the voids switch, and reads a link without it as on', () => {
    const off = encodeHash({ params: defaultParams(), view: { ...VIEW, voids: false }, carried: {} })
    expect(decodeHash(off)?.view.voids).toBe(false)
    expect(decodeHash(legacyLink({}))?.view.voids).toBe(true)
  })

  // A link naming any numeric version, not only today's VIEW_VERSION, reads by
  // the current rules: a future bump must not turn this link into a legacy one.
  it('reads a link from any view version by today’s rules', () => {
    const link = '#' + encodeURIComponent(JSON.stringify({ __view: { viewVersion: 2, headHeight: 0 } }))
    const back = decodeHash(link)?.view
    expect(back?.headHeight).toBe(0)
    expect(back?.theme).toBe('')
  })
})
