import type { Lang } from '@arrowz/engine/i18n'
import { type ParamKey, type Params, readParams } from '@arrowz/engine'
import { isLang } from './lang.slice'
import { pickView, readView, type ViewFields } from './viewSchema'

/** The view a link states, and the page's language when it names one the dictionary has. */
export type HashView = ViewFields & { lang?: Lang | undefined }

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

/** The knobs at the top level and the whole view under `__view`, every field stated. */
export function encodeHash(input: { params: Params; view: HashView; carried: Carried }): string {
  const view = { ...pickView(input.view), lang: input.view.lang }
  const payload = { ...input.params, __view: { ...view, ...input.carried } }
  return '#' + encodeURIComponent(JSON.stringify(payload))
}

export function decodeHash(hash: string): HashPayload | null {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (body === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(body))
  } catch {
    // A bad percent-escape or non-JSON text: a truncated link just opens on the defaults.
    return null
  }
  const raw = isRecord(parsed) && isRecord(parsed.__view) ? parsed.__view : {}
  return {
    // `parsed`, not the narrowed record: the engine's reader does its own
    // narrowing, and the two must agree about a non-object hash.
    params: readParams(parsed),
    view: { ...readView(raw), lang: isLang(raw.lang) ? raw.lang : undefined },
    carried: raw.tab === undefined ? {} : { tab: raw.tab },
  }
}
