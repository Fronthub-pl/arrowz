import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { CommandText } from './CommandText'
import { useCopy } from './useCopy'

/**
 * A CLI command under its caption, with a Copy button: the lab's live command
 * and a library board's command.
 *
 * `<figure>` around the mock's `<pre>`: a `<pre>` has no role and cannot be
 * named, and an unlabelled block of preformatted text is an accessibility gap.
 */
export function CommandFigure({
  label,
  caption,
  command,
}: {
  label: string
  caption: string
  command: string
}): ReactElement {
  const dict = useDictionary()
  const { copied, copy } = useCopy()
  return (
    <figure className="fw-cmdfig" aria-label={label}>
      <figcaption className="fw-cmdhd">
        <span className="caps">{caption}</span>
        <button type="button" onClick={() => copy(command)}>
          {copied ? dict.t('copied') : dict.t('copy')}
        </button>
      </figcaption>
      <pre className="fw-cmd">
        <CommandText command={command} />
      </pre>
    </figure>
  )
}
