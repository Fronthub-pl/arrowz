// Jev (TypeSafe System One) over HTTP: the only module that knows the endpoint and the key.
// Every failure is `null`, because the guards built on it must never break the work they watch.

export const MODEL = 'jev-1.13.0'
export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'

export type Noul = { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
/** Question id → probability of yes. */
export type Answers = Record<string, number>
export type Judge = (state: unknown, questions: Record<string, Noul>) => Promise<Answers | null>

export function keyPath(): string {
  return Deno.env.get('ARROWZ_TYPESAFE_ENV') ?? `${Deno.env.get('HOME') ?? ''}/.config/arrowz/typesafe.env`
}

/** The value of `TYPESAFE_API_KEY` in a `.env` text, quotes stripped; null when absent or empty. */
export function parseKey(text: string): string | null {
  for (const line of text.split('\n')) {
    const m = /^\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    const value = (m[1] ?? '').replace(/^(['"])(.*)\1$/, '$2')
    return value === '' ? null : value
  }
  return null
}

// The mount is a FIFO served by 1Password; while the app is locked a read blocks, so it is raced.
export async function readKey(
  path = keyPath(),
  timeoutMs = 2000,
  read: (p: string) => Promise<string> = (p) => Deno.readTextFile(p),
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((ok) => {
    timer = setTimeout(() => ok(null), timeoutMs)
  })
  try {
    const text = await Promise.race([read(path), late])
    return text === null ? null : parseKey(text)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export type ClientOptions = {
  key: string
  fetch?: typeof fetch
  deadlineMs?: number
  attemptMs?: number
  backoffMs?: number
}

const ATTEMPTS = 4

function parseAnswers(body: unknown, ids: string[]): Answers | null {
  if (typeof body !== 'object' || body === null) return null
  const answers = (body as { answers?: unknown }).answers
  if (typeof answers !== 'object' || answers === null) return null
  const out: Answers = {}
  for (const id of ids) {
    const a = (answers as Record<string, unknown>)[id]
    const p = typeof a === 'object' && a !== null ? (a as { noul?: unknown }).noul : undefined
    if (typeof p !== 'number' || !Number.isFinite(p)) return null
    out[id] = p
  }
  return out
}

export function makeJudge(opts: ClientOptions): Judge {
  const doFetch = opts.fetch ?? fetch
  const deadlineMs = opts.deadlineMs ?? 8000
  const attemptMs = opts.attemptMs ?? 5000
  const backoffMs = opts.backoffMs ?? 250
  return async (state, questions) => {
    const end = Date.now() + deadlineMs
    const body = JSON.stringify({ model: MODEL, state, questions })
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const left = end - Date.now()
      if (left <= 0) return null
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), Math.min(attemptMs, left))
      try {
        const res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { authorization: `Bearer ${opts.key}`, 'content-type': 'application/json' },
          body,
          signal: abort.signal,
        })
        if (res.status === 429 || res.status === 529) {
          await res.body?.cancel()
          const wait = backoffMs * 2 ** attempt
          if (Date.now() + wait >= end) return null
          await new Promise((ok) => setTimeout(ok, wait))
          continue
        }
        if (!res.ok) {
          await res.body?.cancel()
          return null
        }
        return parseAnswers(await res.json(), Object.keys(questions))
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }
    return null
  }
}

export async function defaultJudge(): Promise<Judge | null> {
  const key = await readKey()
  return key === null ? null : makeJudge({ key })
}
