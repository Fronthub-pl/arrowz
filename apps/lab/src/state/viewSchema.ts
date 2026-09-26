import {
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  PAD_RANGE,
  POINT_RADIUS_RANGE,
  themeOf,
} from '@arrowz/board-element'
import type { ViewNumber } from '@arrowz/engine'
import { DEFAULT_VIEW, viewNumberOf } from '@arrowz/engine/command'

/**
 * The lab's view: the one list of its fields. `VIEW_SCHEMA` is typed over it,
 * so a field without a default and a reader does not compile, and the slice,
 * the link and "Load into lab" all read and normalise through that table.
 */
export interface ViewFields {
  cell: number
  stroke: number
  /** 0 is the automatic width, worked out from the stroke. */
  headWidth: number
  headHeight: number
  top: number
  colored: boolean
  rounded: boolean
  highlightLongest: boolean
  /** The element's switch for empty cells; `viewOf` does not carry it and the CLI has no flag for it. */
  voids: boolean
  /** The point grid: the element's settings, not the engine's, like `voids`. */
  showPoints: boolean
  pointColor: string
  pointRadius: number
  /** Name of a built-in board theme; '' draws the element's own colours. */
  theme: string
  /**
   * The custom palette, capped at `PALETTE_CAP`. It coexists with `theme`,
   * overriding the theme's colours; empty lets the theme's own palette show.
   */
  palette: string[]
  /**
   * The board's own surface colours, or '' for "not set", which lets a theme
   * supply them. Never handed to the element as '': it sanitises after
   * precedence, so a stated empty string would beat the theme.
   */
  paper: string
  ink: string
  /** The highlight colour; same "not set" rule as `paper`. */
  highlightColor: string
  /** The margin in cells; 0 is a real margin, so there is no "not set". */
  pad: number
}

export type ViewKey = keyof ViewFields

/** The lab's cap; the element and the engine take any number of colours. */
export const PALETTE_CAP = 8

interface FieldSpec<T> {
  def: T
  /** The value normalised for the store, or `undefined` when it cannot be read. */
  read(raw: unknown): T | undefined
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** A number from a link or a typed field; '' and non-finite values are unreadable, not 0. */
function finite(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const n = Number(raw.trim())
  return Number.isFinite(n) ? n : undefined
}

const clamp = (n: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, n))

/** `viewNumberOf`'s clamp and rounding; an unreadable value stays `undefined`, so the caller picks the default. */
function viewNumber(field: ViewNumber, def: number): FieldSpec<number> {
  return {
    def,
    read: (raw) => {
      const n = finite(raw)
      return n === undefined ? undefined : viewNumberOf(String(n), field)
    },
  }
}

function flag(def: boolean): FieldSpec<boolean> {
  return { def, read: (raw) => (typeof raw === 'boolean' ? raw : undefined) }
}

/** What `<input type="color">` can show, lower-cased as it reports it. */
function hex(raw: unknown): string | undefined {
  return typeof raw === 'string' && HEX_COLOR.test(raw) ? raw.toLowerCase() : undefined
}

/** A board colour: '' is "not set" and lets a theme decide. */
const optionalColour: FieldSpec<string> = { def: '', read: (raw) => (raw === '' ? '' : hex(raw)) }

export const VIEW_SCHEMA: { readonly [K in ViewKey]: FieldSpec<ViewFields[K]> } = {
  // The page's own starting cell and top; the rest are the CLI's.
  cell: viewNumber('cell', 12),
  stroke: viewNumber('stroke', DEFAULT_VIEW.stroke),
  headWidth: viewNumber('headWidth', DEFAULT_VIEW.headWidth),
  headHeight: viewNumber('headHeight', DEFAULT_VIEW.headHeight),
  top: viewNumber('top', 5),
  colored: flag(false),
  rounded: flag(true),
  highlightLongest: flag(false),
  voids: flag(true),
  showPoints: flag(false),
  pointColor: { def: DEFAULT_POINT_COLOR, read: hex },
  pointRadius: {
    def: DEFAULT_POINT_RADIUS,
    read: (raw) => {
      const n = finite(raw)
      return n === undefined ? undefined : clamp(n, POINT_RADIUS_RANGE)
    },
  },
  theme: {
    def: '',
    read: (raw) => (typeof raw === 'string' && (raw === '' || themeOf(raw) !== null) ? raw : undefined),
  },
  palette: {
    def: [],
    // Entries the colour input cannot show are dropped before the cap, so garbage cannot burn a slot.
    read: (raw) =>
      Array.isArray(raw)
        ? raw
            .flatMap((c) => {
              const colour = hex(c)
              return colour === undefined ? [] : [colour]
            })
            .slice(0, PALETTE_CAP)
        : undefined,
  },
  paper: optionalColour,
  ink: optionalColour,
  highlightColor: optionalColour,
  pad: {
    def: DEFAULT_PAD,
    read: (raw) => {
      const n = finite(raw)
      return n === undefined ? undefined : clamp(Math.round(n), PAD_RANGE)
    },
  },
}

// `Object.keys` types its result as `string[]`; the keys are exactly `ViewKey`'s.
export const VIEW_KEYS = Object.keys(VIEW_SCHEMA) as readonly ViewKey[]

function normalise<K extends ViewKey>(key: K, raw: unknown): ViewFields[K] {
  const spec: FieldSpec<ViewFields[K]> = VIEW_SCHEMA[key]
  return spec.read(raw) ?? spec.def
}

// `Object.fromEntries` loses the pairing of key and type; every key is visited, so the object is complete.
function everyField(value: <K extends ViewKey>(key: K) => ViewFields[K]): ViewFields {
  return Object.fromEntries(VIEW_KEYS.map((key) => [key, value(key)])) as unknown as ViewFields
}

export const VIEW_DEFAULTS: ViewFields = everyField((key) => VIEW_SCHEMA[key].def)

/** A whole view from untrusted input: a link's `__view`. */
export function readView(raw: Readonly<Record<string, unknown>>): ViewFields {
  return everyField((key) => normalise(key, raw[key]))
}

function assign<K extends ViewKey>(out: Partial<ViewFields>, key: K, value: ViewFields[K]): void {
  out[key] = value
}

/** The fields a patch names, normalised; the ones it does not name stay out. */
export function readPatch(patch: Readonly<Partial<Record<ViewKey, unknown>>>): Partial<ViewFields> {
  const out: Partial<ViewFields> = {}
  for (const key of VIEW_KEYS) if (key in patch) assign(out, key, normalise(key, patch[key]))
  return out
}

/** The view out of an object that carries more: the slice with its actions. */
export function pickView(view: ViewFields): ViewFields {
  return everyField((key) => view[key])
}
