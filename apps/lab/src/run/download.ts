/**
 * How long an object URL outlives its download. Some engines resolve the
 * download after the click returns; 40 s is FileSaver.js's delay, not measured here.
 */
export const REVOKE_AFTER_MS = 40_000

/**
 * A Blob to a named file, the way a page with no server behind it saves one;
 * shared by both exports. The anchor is in the document for the length of its
 * click, so the click is an ordinary event there; the object URL is released later.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
