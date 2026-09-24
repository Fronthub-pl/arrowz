/** How long a jumped-to knob keeps its outline — the mock's own figure. */
const FLASH_MS = 1200

/**
 * Module scope, like the fade in `library/notices.ts`: the timer outlives the
 * component that armed it, and a `clearTimeout` on unmount would cancel an
 * outline the jump had just started.
 */
let timer: ReturnType<typeof setTimeout> | undefined
let lit: Element | null = null

export function flash(node: Element | null): void {
  cancelFlash()
  if (node === null) return
  lit = node
  node.classList.add('flash')
  timer = setTimeout(() => {
    lit?.classList.remove('flash')
    lit = null
    timer = undefined
  }, FLASH_MS)
}

/** For tests, which must not leak an outline into the case after them. */
export function cancelFlash(): void {
  clearTimeout(timer)
  timer = undefined
  lit?.classList.remove('flash')
  lit = null
}
