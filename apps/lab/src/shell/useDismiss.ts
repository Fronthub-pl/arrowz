import { type RefObject, useEffect, useEffectEvent } from 'react'

/**
 * How a popover closes, while `open`: a press outside every `inside` element
 * closes it and leaves the focus alone; Escape pressed inside is consumed in
 * the capture phase, so it reaches no drawer (see `WORKSPACE_KEYS`), closes it
 * and focuses `refocus`; with `closeOnFocusOut`, focus leaving the popover for
 * an element outside closes it too. A key pressed outside is left alone: an
 * Escape in a knob entry discards that entry's draft.
 */
export function useDismiss({
  open,
  inside,
  onClose,
  refocus,
  closeOnFocusOut = false,
}: {
  open: boolean
  inside: readonly RefObject<Element | null>[]
  onClose(): void
  refocus?: RefObject<HTMLElement | null> | undefined
  closeOnFocusOut?: boolean | undefined
}): void {
  // Effect events: callers pass fresh callbacks and ref arrays each render, and the listeners must not re-register.
  const isInside = useEffectEvent(
    (target: EventTarget | null) =>
      target instanceof Node && inside.some((ref) => ref.current?.contains(target) ?? false),
  )
  const close = useEffectEvent((viaEscape: boolean) => {
    onClose()
    if (viaEscape) refocus?.current?.focus()
  })
  useEffect(() => {
    if (!open) return
    const onPress = (event: PointerEvent) => {
      if (!isInside(event.target)) close(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isInside(event.target)) return
      event.preventDefault()
      close(true)
    }
    // A `null` `relatedTarget` is focus to nowhere, a press on the page's body, which `onPress` handles.
    const onFocusOut = (event: FocusEvent) => {
      if (!isInside(event.target)) return
      const next = event.relatedTarget
      if (next instanceof Node && !isInside(next)) close(false)
    }
    document.addEventListener('pointerdown', onPress)
    document.addEventListener('keydown', onKey, true)
    if (closeOnFocusOut) document.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPress)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [open, closeOnFocusOut])
}
