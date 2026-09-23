import { useSyncExternalStore } from 'react'
import { type Band, readBand, readLow, subscribeBand } from '../state/band'

/** The window's band, re-rendering when it changes (state/band.ts). */
export function useBand(): Band {
  return useSyncExternalStore(subscribeBand, readBand, () => 'xl')
}

/** The low window: under 700px tall, at least 768 wide. */
export function useLowWindow(): boolean {
  return useSyncExternalStore(subscribeBand, readLow, () => false)
}
