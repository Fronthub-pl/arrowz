import { useSyncExternalStore } from 'react'

const COARSE = '(pointer: coarse)'

function media(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? null : window.matchMedia(COARSE)
}

function subscribe(onChange: () => void): () => void {
  const list = media()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/** A finger rather than a mouse: a docs board is then a still picture, and the finger scrolls the page. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  )
}
