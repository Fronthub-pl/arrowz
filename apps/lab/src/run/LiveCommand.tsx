import { buildCommand, COMMAND_PREFIX } from '@arrowz/engine/command'
import { useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'

/**
 * The command that would reproduce what is configured — not what is drawn.
 * The old lab states the rule at `lab-page.ts:741`: "The command matches the
 * CURRENT knobs, not the last board: the lab is a layer over the CLI and must
 * show exactly what would be run."
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
  // The mock draws the flags in `--ink` and the program name in `--ash`. The
  // split is on the prefix the engine exports, so a change to the command's
  // shape cannot leave this cutting in the middle of a word.
  const flags = command.startsWith(COMMAND_PREFIX) ? command.slice(COMMAND_PREFIX.length) : ''
  const head = flags === '' ? command : COMMAND_PREFIX

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1200)
    })
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
        {head}
        <b>{flags}</b>
      </pre>
    </figure>
  )
}
