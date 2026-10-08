/**
 * Settles once the docs body's chunk (`DocsRoute`'s lazy `DocsBody`) has
 * loaded: the very module the route imports, so a failed load throws here.
 * Its first load in a file outlasts a poll's default second on a busy machine
 * (measured up to 9s at load 25); the render after it took under 0.25s, so a
 * marker polled after this keeps the default timeout and a missing marker
 * still fails within a second.
 */
export async function docsChunk(): Promise<void> {
  await import('../routes/DocsBody')
}
