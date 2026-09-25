import { themeOf } from '@arrowz/board-element'
import { VIEW_VERSION } from '@arrowz/engine/command'
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
  highlightLongest: boolean
  /** The switch that draws empty cells; a legacy link lacks it and reads as on. */
  voids: boolean
  /** The page's language. Absent when the link predates it or names one the dictionary lacks. */
  lang?: Lang | undefined
  /** The board theme by name. Absent only in a legacy link that names none; a link written now says `''`. */
  theme?: string | undefined
  /**
   * The lab's custom palette. Absent (not `[]`) only in a legacy link that
   * names none, so the page keeps its own: `BoardFrame` reads `[]` as "no
   * palette", so only `undefined` spells "the link did not say".
   */
  palette?: string[] | undefined
  /** The board's own surface colours, by the same rule as `theme`. */
  paper?: string | undefined
  ink?: string | undefined
  /** The highlight colour, by the same rule as `theme`. */
  highlightColor?: string | undefined
  /** The point grid. Absent when the link predates it. */
  showPoints?: boolean | undefined
  pointColor?: string | undefined
  pointRadius?: number | undefined
  /** The margin, in cells. Absent when the link predates it; 0 is a real margin, not "unset". */
  pad?: number | undefined
}

/** A key the page does not read (`tab`), kept so a round trip cannot drop it. */
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
 * The deployed wire format, so links in circulation still open: the knobs at
 * the top level and everything else under `__view`.
 */
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string {
  const {
    palette: chosenPalette,
    paper: chosenPaper,
    ink: chosenInk,
    highlightColor: chosenHighlightColor,
    ...rest
  } = input.view
  // An empty palette (the common case) is left out rather than written as `[]`.
  const view = chosenPalette !== undefined && chosenPalette.length > 0 ? { ...rest, palette: chosenPalette } : rest
  // `''` is the slice's "not set": such a colour is left out too.
  const withPaper = chosenPaper !== undefined && chosenPaper !== '' ? { ...view, paper: chosenPaper } : view
  const withInk = chosenInk !== undefined && chosenInk !== '' ? { ...withPaper, ink: chosenInk } : withPaper
  const withHighlightColor =
    chosenHighlightColor !== undefined && chosenHighlightColor !== ''
      ? { ...withInk, highlightColor: chosenHighlightColor }
      : withInk
  const payload = { ...input.params, __view: { ...withHighlightColor, viewVersion: VIEW_VERSION, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

/** The lab editor's `<input type="color">` can only ever display this shape. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/**
 * A palette a link may have written by hand. The lab's colour inputs can only
 * show `#rrggbb` (anything else would show black), so other entries are
 * dropped, before the cap so garbage cannot burn a slot. Lower-cased, as the
 * native input reports, so the rewritten hash matches the pasted one.
 */
function palette(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const colors = raw
    .filter((c): c is string => typeof c === 'string' && HEX_COLOR.test(c))
    .map((c) => c.toLowerCase())
    .slice(0, PALETTE_CAP)
  return colors.length > 0 ? colors : undefined
}

/** One hand-written colour, by `palette`'s rule. */
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
    // A bad percent-escape or non-JSON text: a truncated link just opens on
    // the defaults.
    return null
  }
  const raw = isRecord(parsed) && isRecord(parsed.__view) ? parsed.__view : {}
  // See `VIEW_VERSION`: a link written now names every colour, so there an
  // absent one is "none", and a head height of 0 is literal.
  const versioned = typeof raw.viewVersion === 'number'
  const theme = typeof raw.theme === 'string' && themeOf(raw.theme) !== null ? raw.theme : undefined
  const height = num(raw.headHeight)
  return {
    // `parsed`, not the narrowed record: the engine's reader does its own
    // narrowing, and the two must agree about a non-object hash.
    params: readParams(parsed),
    view: {
      cell: num(raw.cell),
      stroke: num(raw.stroke),
      headWidth: num(raw.headWidth),
      // In a legacy link 0 was "automatic"; the store's own reader makes the same exception.
      headHeight: height !== undefined && (versioned || height > 0) ? height : undefined,
      top: num(raw.top),
      rounded: raw.rounded !== false,
      colored: raw.colored === true,
      // Off unless the link states it on, the same rule as `colored`: a link
      // that predates the flag must not switch the highlight on for it. A
      // link written before the rename carries the old key (`hilite`) instead.
      highlightLongest: (raw.highlightLongest === undefined ? raw.hilite : raw.highlightLongest) === true,
      voids: raw.voids !== false,
      // An old link's `help` key is ignored.
      lang: isLang(raw.lang) ? raw.lang : undefined,
      theme: theme ?? (versioned ? '' : undefined),
      palette: palette(raw.palette) ?? (versioned ? [] : undefined),
      paper: colour(raw.paper) ?? (versioned ? '' : undefined),
      ink: colour(raw.ink) ?? (versioned ? '' : undefined),
      // A link written before the rename carries the old key (`highlight`) instead.
      highlightColor: colour(raw.highlightColor) ?? colour(raw.highlight) ?? (versioned ? '' : undefined),
      // Decodes to `undefined` rather than `false` on absence so the
      // round-trip fixture need not carry the key.
      showPoints: raw.showPoints === true ? true : undefined,
      pointColor: colour(raw.pointColor),
      pointRadius: num(raw.pointRadius),
      pad: num(raw.pad),
    },
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
  }
}
