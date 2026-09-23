import { useEffect, useRef, useState } from 'react'

/**
 * A Copy button's state: `copy(text)` writes to the clipboard, and `copied`
 * stays true for 1.2 s after a write that succeeded. Shared by the live
 * command (LiveCommand.tsx) and the documentation's blocks (DocsBlock.tsx),
 * so a refusal is handled once.
 */
export function useCopy(): { readonly copied: boolean; readonly copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = (text: string) => {
    const clipboard = navigator.clipboard
    // Undefined outside a secure context, where the Clipboard interface is
    // not exposed at all — so the call below would throw before there is a
    // promise to catch. The catch on that call covers the other two
    // refusals, which are rejections rather than throws: a denied
    // permission and a document without focus. Either way the button
    // staying on its normal label is the honest signal that nothing was
    // copied; a visible error is a UI decision this task does not make.
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
