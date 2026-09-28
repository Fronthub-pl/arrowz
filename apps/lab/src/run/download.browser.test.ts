import { afterEach, expect, test, vi } from 'vitest'
import { downloadBlob, REVOKE_AFTER_MS } from './download'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

test('the object URL outlives the click and is released afterwards', () => {
  vi.useFakeTimers()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-under-test')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  // No file is written: the anchor's click is cancelled.
  const cancel = (event: MouseEvent) => event.preventDefault()
  document.addEventListener('click', cancel, true)
  try {
    downloadBlob(new Blob(['x']), 'x.txt')
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(REVOKE_AFTER_MS - 1)
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(revoke).toHaveBeenCalledWith('blob:download-under-test')
  } finally {
    document.removeEventListener('click', cancel, true)
  }
})
