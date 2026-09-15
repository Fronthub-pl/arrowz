// Brings vitest-browser-react's matchers and its beforeEach cleanup into every
// browser test file.
import 'vitest-browser-react'

// Every browser test file shares one origin, so `localStorage` outlives a
// file: a key written by one was read by the next (measured 2026-09-14). The
// lab remembers three preferences there and reads them when the store is
// created — at import — so the clear has to run before a test file's own
// imports, which is when a setup file runs (measured the same day: the next
// file read the key back as null at import).
localStorage.clear()
