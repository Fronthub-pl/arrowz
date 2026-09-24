import { type ReactElement, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useBand } from '../shell/useLayoutBand'
import type { Band } from '../state/band'

/**
 * The right column's `…`: at M and S the column is a bar under the board, and
 * the switches and the exports move into a popover over it. Outside M/S the
 * button is `display: none` and the container `display: contents`, so the
 * column reads as it always has.
 *
 * Open is remembered as the band it was opened in, so a band change reads as
 * closed with no effect writing state; a later return to that band is closed
 * too, because the band change cleared it on the way. A disclosure like the
 * preset picker: `aria-expanded` and `aria-controls`, Escape consumed in a
 * capture listener while open.
 */
export function MoreMenu({ children }: { children: ReactNode }): ReactElement {
  const dict = useDictionary()
  const band = useBand()
  const [openIn, setOpenIn] = useState<Band | null>(null)
  const [seenBand, setSeenBand] = useState(band)
  // A band change clears the open state during render, React's documented
  // "adjusting state when a prop changes" pattern, not an effect.
  if (seenBand !== band) {
    setSeenBand(band)
    setOpenIn(null)
  }
  const open = openIn === band
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      ((pop.current?.contains(target) ?? false) || (button.current?.contains(target) ?? false))
    const onPress = (event: PointerEvent) => {
      if (!inside(event.target)) setOpenIn(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !inside(event.target)) return
      event.preventDefault()
      setOpenIn(null)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className="fw-more"
        aria-expanded={open}
        aria-controls={id}
        aria-label={dict.t('moreOptions')}
        onClick={() => setOpenIn(open ? null : band)}
      >
        …
      </button>
      <div ref={pop} id={id} className={open ? 'fw-more-pop open' : 'fw-more-pop'}>
        {children}
      </div>
    </>
  )
}
