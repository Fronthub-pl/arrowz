import type { Lang } from '@arrowz/engine/i18n'
import { type ParamKey, type Params, readParams } from '@arrowz/engine'
import { isLang } from './lang.slice'

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
  const payload = { ...input.params, __view: { ...input.view, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
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
    },
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
  }
}
