import { useEffect, useRef } from 'react'

/**
 * Where a row's special-value chip (`auto`, a knob's word) releases to: the
 * last other value the row held, recorded after each render rather than during
 * it, else `fallback`. Returns the value; the caller writes it.
 */
export function useReleasableChip(value: number, isSpecial: boolean, fallback: () => number): () => number {
  const last = useRef<number | null>(null)
  useEffect(() => {
    if (!isSpecial) last.current = value
  }, [value, isSpecial])
  return () => last.current ?? fallback()
}
