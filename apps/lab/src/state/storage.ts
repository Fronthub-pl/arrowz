/**
 * The page's remembered preferences, through a door that never throws
 * (Ruling 14). The node test project imports the store and has no dependable
 * Web Storage, and a browser may refuse storage outright — a private window, a
 * blocked origin. A preference that cannot be read is the default; one that
 * cannot be written lasts for this page.
 *
 * `typeof` inside the `try`: on an engine whose `localStorage` is a getter that
 * throws, evaluating it at all is the throw.
 */
export function readStored(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  } catch {
    // Nothing to do: the preference lasts for this page and no longer.
  }
}
