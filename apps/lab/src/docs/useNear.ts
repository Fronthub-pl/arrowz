import { type RefObject, useEffect, useState } from 'react'

/**
 * How far past the panel's top and bottom edges a board counts as near: a
 * quarter of the panel each way. Near, it is generated and mounted; away, it
 * unmounts and gives back its WebGL context, of which a page gets about
 * sixteen. The scroll test holds the count this margin gives.
 */
export const NEAR_MARGIN = '25% 0px'

export function useNear(target: RefObject<Element | null>, root: RefObject<HTMLElement | null> | null): boolean {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const element = target.current
    if (element === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries.at(-1)
        if (last !== undefined) setNear(last.isIntersecting)
      },
      { root: root?.current ?? null, rootMargin: NEAR_MARGIN },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [target, root])
  return near
}
