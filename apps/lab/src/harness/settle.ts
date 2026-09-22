/**
 * One frame for the layout that followed the last store write, then every CSS
 * transition running on the page played out. A class toggled in a test starts
 * its transitions on the next frame, so waiting on `getAnimations()` at once
 * would find none; a rail tab or a drawer is still mid-way through its slide
 * or its 120ms background one frame later. A cancelled transition settles too.
 */
export async function settleTransitions(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await Promise.all(
    document
      .getAnimations()
      .filter((a) => a instanceof CSSTransition)
      .map((a) => a.finished.catch(() => undefined)),
  )
}
