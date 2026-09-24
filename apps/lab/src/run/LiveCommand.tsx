import { buildCommand } from '@arrowz/engine/command'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { CommandText } from './CommandText'
import { useCopy } from './useCopy'

/**
 * The command that would reproduce what is configured, not what is drawn: the
 * lab is a layer over the CLI and must show exactly what would be run.
 *
 * `<figure>` around the mock's `<pre>`: a `<pre>` has no role and cannot be
 * named, and an unlabelled block of preformatted text is an accessibility gap.
 */
export function LiveCommand() {
  const dict = useDictionary()
  const values = useStore((state) => state.params.values)
  const view = useStore((state) => state.view)
  const { copied, copy } = useCopy()

  const command = buildCommand(values, viewOf(view))

  return (
    <figure className="fw-cmdfig" aria-label={dict.t('commandHead')}>
      <figcaption className="fw-cmdhd">
        <span className="caps">{dict.t('cliLabel')}</span>
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
