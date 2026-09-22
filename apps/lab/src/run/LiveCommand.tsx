import { buildCommand } from '@arrowz/engine/command'
import { useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { CommandText } from './CommandText'

/**
 * The command that would reproduce what is configured — not what is drawn.
 * The rule: the command matches the CURRENT knobs, not the last board — the
 * lab is a layer over the CLI and must show exactly what would be run.
 *
 * `<figure>` around the mock's `<pre>`: a `<pre>` has no role and cannot be
 * named, and an unlabelled block of preformatted text is one of the §7.2 gaps.
 */
export function LiveCommand() {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const view = useStore((state) => state.view)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  const command = buildCommand(values, viewOf(view))

  const copy = () => {
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
      .writeText(command)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  return (
    <figure className="fw-cmdfig" aria-label={dict.t('commandHead')}>
      <figcaption className="fw-cmdhd">
        <span className="caps">{dict.t('cliLabel')}</span>
        <button type="button" onClick={copy}>
          {copied ? dict.t('copied') : dict.t('copy')}
        </button>
      </figcaption>
      <pre className="fw-cmd">
        <CommandText command={command} />
      </pre>
    </figure>
  )
}
