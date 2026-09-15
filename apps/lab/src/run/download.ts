/**
 * A Blob to a named file, the way a page with no server behind it saves one —
 * shared by both exports. The anchor is in the document for the length of its
 * click, so the click is an ordinary event there (PR 4b, Ruling 8); the object
 * URL is revoked at once, as the old lab does (lab-page.ts:976).
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
