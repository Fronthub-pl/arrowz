import { writeStored } from './storage'

/**
 * The `set` a slice receives: it reads and returns its own field only. The
 * store hands in Zustand's `set`, which accepts this; a slice never names
 * `Store`, because the store imports the slices.
 */
export type SliceSet<K extends string, S> = (fn: (state: Record<K, S>) => Record<K, S>) => void

/** The keys of `S` whose values are booleans. */
type FlagKey<S> = { [P in keyof S]-?: S[P] extends boolean ? P : never }[keyof S]

/** `{ [key]: value }`, typed: a computed key widens to `string`, and this record has exactly the one key. */
function only<K extends string, S>(key: K, value: S): Record<K, S> {
  return { [key]: value } as Record<K, S>
}

/** Merges a partial into slice `key`. */
export function patcher<K extends string, S>(setSlice: SliceSet<K, S>, key: K): (next: Partial<S>) => void {
  return (next) => setSlice((state) => only(key, { ...state[key], ...next }))
}

/**
 * A boolean field remembered as `open` or `closed` under `storageKey`. The
 * toggle reads inside the update: a button and a key can both fire before a render.
 */
export function persistedFlag<K extends string, S>(
  setSlice: SliceSet<K, S>,
  key: K,
  field: FlagKey<S>,
  storageKey: string,
): { set(on: boolean): void; toggle(): void } {
  const write = (state: Record<K, S>, on: boolean): Record<K, S> => {
    writeStored(storageKey, on ? 'open' : 'closed')
    return only(key, { ...state[key], [field]: on })
  }
  return {
    set: (on) => setSlice((state) => write(state, on)),
    toggle: () => setSlice((state) => write(state, !state[key][field])),
  }
}
