/**
 * The page's remembered preferences, through a door that never throws: the
 * node test project has no dependable Web Storage, and a browser may refuse it
 * (a private window, a blocked origin). Unreadable means the default;
 * unwritable lasts for this page. `typeof` is inside the `try` because a
 * throwing `localStorage` getter throws on evaluation.
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
