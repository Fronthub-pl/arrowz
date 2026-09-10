// The inspector's event console: what the element reported, newest last.

/** Rows kept before the oldest is dropped. */
export const LOG_LIMIT = 200

export interface LogEntry {
  /** The clock of the last event this row stands for. */
  time: string
  type: string
  detail: string
  /** How many identical events in a row this one row stands for. */
  count: number
}

export type LogEffect =
  | { kind: 'repeat'; entry: LogEntry }
  | { kind: 'push'; entry: LogEntry; evicted: boolean }

/**
 * The rows, with consecutive repeats folded into a count.
 *
 * The folding is what makes the console readable under `viewport-change`, which
 * fires once a frame while a drag is in flight: sixty rows a second saying the
 * same thing would flush every game event out of the buffer within a second of
 * panning. The effect the log hands back lets the panel touch one row per
 * event — appending or bumping a counter — rather than repainting all 200.
 */
export class EventLog {
  private readonly limit: number
  private readonly rows: LogEntry[] = []

  constructor(limit: number = LOG_LIMIT) {
    this.limit = limit
  }

  get entries(): readonly LogEntry[] {
    return this.rows
  }

  add(type: string, detail: string, time: string): LogEffect {
    const last = this.rows[this.rows.length - 1]
    if (last && last.type === type && last.detail === detail) {
      last.count++
      last.time = time
      return { kind: 'repeat', entry: last }
    }
    const entry: LogEntry = { time, type, detail, count: 1 }
    this.rows.push(entry)
    const evicted = this.rows.length > this.limit
    if (evicted) this.rows.shift()
    return { kind: 'push', entry, evicted }
  }

  clear(): void {
    this.rows.length = 0
  }
}

/** Two places is all a viewport origin needs; an integer keeps its own shape. */
function num(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/**
 * A `CustomEvent` detail as one line: `{pieceId: 12, left: 41}`. Unquoted keys
 * because this is read, not parsed — JSON's quotes are noise at this width.
 */
export function formatDetail(detail: unknown): string {
  if (detail === null || typeof detail !== 'object') return '{}'
  const parts: string[] = []
  for (const [key, value] of Object.entries(detail)) {
    parts.push(`${key}: ${typeof value === 'number' ? num(value) : String(value)}`)
  }
  return `{${parts.join(', ')}}`
}
