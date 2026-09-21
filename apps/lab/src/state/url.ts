import type { Lang } from '@arrowz/engine/i18n'
import { type ParamKey, type Params, readParams } from '@arrowz/engine'
import { isLang } from './lang.slice'
import { PALETTE_CAP } from './view.slice'

export interface HashView {
  cell?: number | undefined
  stroke?: number | undefined
  headWidth?: number | undefined
  headHeight?: number | undefined
  top?: number | undefined
  rounded: boolean
  colored: boolean
  hilite: boolean
  help: boolean
  /** The page's language. Absent when the link predates it or names one the dictionary lacks. */
  lang?: Lang | undefined
  /** The board theme by name. Absent when the link predates themes. */
  theme?: string | undefined
  /**
   * The lab's custom palette. Absent (not `[]`) when the link predates
   * custom palettes or names none, so it reads the same as `theme`'s
   * absence: the page keeps its own value rather than being told to clear
   * it. `BoardFrame` already treats a stated `[]` as "no palette", which is
   * why an empty array here would be indistinguishable from a link that
   * explicitly wants the theme's own colours — `undefined` is the only
   * spelling of "the link did not say."
   */
  palette?: string[] | undefined
  /** The board's own surface colours. Absent when the link predates them or names none. */
  paper?: string | undefined
  ink?: string | undefined
  /** The point grid. Absent when the link predates it. */
  showPoints?: boolean | undefined
  pointColor?: string | undefined
  pointRadius?: number | undefined
}

/** The one key the page does not own yet — the tab, PR 5's — kept so a round trip cannot drop it. */
export interface Carried {
  tab?: unknown
}

export interface HashPayload {
  params: Partial<Record<ParamKey, number>>
  view: HashView
  carried: Carried
}

/** A JSON value that is an object, which is all the reader can assume. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A view number a link may have written as a string. `undefined` means
 * the link did not name it and the page keeps its own value, which is why
 * this is not `Number(raw) || fallback`: a link naming 0 for a field where 0
 * is legal must not read as absent.
 */
function num(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/**
 * The wire format is the deployed one, unchanged, so links already in
 * circulation still open (Ruling 7): the knobs at the top level and everything
 * else under `__view`.
 */
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string {
  const { palette: chosenPalette, paper: chosenPaper, ink: chosenInk, ...rest } = input.view
  // An empty palette is the common case — most links carry no custom
  // colours — so it is left out entirely rather than written as `[]`.
  const view = chosenPalette !== undefined && chosenPalette.length > 0 ? { ...rest, palette: chosenPalette } : rest
  // `''` is the slice's own "not set", the same as an empty palette above: a
  // link that never had the board colours touched should not grow `paper`
  // and `ink` keys naming nothing.
  const withPaper = chosenPaper !== undefined && chosenPaper !== '' ? { ...view, paper: chosenPaper } : view
  const withInk = chosenInk !== undefined && chosenInk !== '' ? { ...withPaper, ink: chosenInk } : withPaper
  const payload = { ...input.params, __view: { ...withInk, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

/** The lab editor's `<input type="color">` can only ever display this shape. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * A palette a link may have written by hand. Unlike the element's own
 * validation (any CSS colour a browser accepts), the lab editor's colour
 * inputs can only show `#rrggbb`, so anything else is worse than absent — it
 * would silently show black — and is dropped rather than passed through.
 * Filtered before the cap is applied rather than after: clamping first would
 * let a garbage entry near the front of a hand-edited list burn a slot that a
 * valid colour further down could otherwise have filled. Lower-cased after
 * the filter: `HEX_COLOR` accepts uppercase, but the native colour input only
 * ever reports lowercase, so a hand-edited `#AABBCC` would otherwise make the
 * hash this page rewrites differ in case from the one that was pasted in.
 */
function palette(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const colors = raw
    .filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
    .map((c) => c.toLowerCase())
    .slice(0, PALETTE_CAP)
  return colors.length > 0 ? colors : undefined
}

/**
 * One hand-written colour. Same rule as `palette`: the lab's colour inputs can
 * only show `#rrggbb`, so anything else is worse than absent, and a valid value
 * is lower-cased so the hash this page rewrites matches the one pasted in.
 */
function colour(raw: unknown): string | undefined {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : undefined
}

export function decodeHash(hash: string): HashPayload | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (body === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(body))
  } catch {
    // Both throws land here: a percent-escape the decoder rejects, and text
    // that is not JSON. A truncated link is not an error to report; it is a
    // page that opens on its defaults.
    return null
  }
  const raw = isRecord(parsed) && isRecord(parsed.__view) ? parsed.__view : {}
  const height = num(raw.headHeight)
  return {
    // `parsed` and not the narrowed record: the engine's reader takes
    // `unknown` and does its own narrowing, and handing it a pre-narrowed
    // value would leave the two disagreeing about a non-object hash.
    params: readParams(parsed),
    view: {
      cell: num(raw.cell),
      stroke: num(raw.stroke),
      headWidth: num(raw.headWidth),
      // 0 was "automatic" before the height became literal, and the store's
      // own reader makes the same exception.
      headHeight: height !== undefined && height > 0 ? height : undefined,
      top: num(raw.top),
      rounded: raw.rounded !== false,
      colored: raw.colored === true,
      hilite: raw.hilite !== false,
      help: raw.help !== false,
      lang: isLang(raw.lang) ? raw.lang : undefined,
      theme: typeof raw.theme === 'string' && raw.theme !== '' ? raw.theme : undefined,
      palette: palette(raw.palette),
      paper: colour(raw.paper),
      ink: colour(raw.ink),
      // Decodes to `undefined` rather than `false` on absence so the
      // round-trip fixture need not carry the key.
      showPoints: raw.showPoints === true ? true : undefined,
      pointColor: colour(raw.pointColor),
      pointRadius: num(raw.pointRadius),
    },
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
  }
}
