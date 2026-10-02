import type { CSSProperties, ReactElement } from 'react'
import { useInLibrary } from '../library/useInLibrary'
import { useRunLine } from './useRunState'

/**
 * Dims the board while a carve or a series runs on the lab, with Generate's
 * label and a bar filled to the share done. `aria-hidden`: the run status's
 * live output speaks for it, and the stage carries `aria-busy`. The 300ms
 * delay and the pointer passing through are the stylesheet's (`.fw-veil`).
 */
export function BusyVeil(): ReactElement | null {
  const { meter } = useRunLine()
  const inLibrary = useInLibrary()
  if (meter === null || inLibrary) return null
  return (
    <div className="fw-veil" aria-hidden="true" style={{ '--p': `${meter.percent ?? 0}%` } as CSSProperties}>
      <div className="fw-veil-card">
        {meter.label}
        <span className="fw-veil-bar" />
      </div>
    </div>
  )
}
