import { useEffect, useRef, useState } from 'react'

/**
 * A Copy button's state: `copy(text)` writes to the clipboard, and `copied`
 * stays true for 1.2 s after a write that succeeded. Shared by `LiveCommand`
 * and `DocsBlock`, so a refusal is handled once.
 */
export function useCopy(): { readonly copied: boolean; readonly copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = (text: string) => {
    const clipboard = navigator.clipboard
    // Undefined outside a secure context, so the call below would throw before
    // there is a promise to catch; the catch covers the rejections (a denied
    // permission, a document without focus). Either way the button keeping its
    // normal label is the honest signal that nothing was copied.
    if (clipboard === undefined) return
    void clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  return { copied, copy }
}
