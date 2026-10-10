import type { BoardFile } from '@fronthub/arrowz-engine'
import type { ReactElement } from 'react'
import { useKnobHelp } from '../console/KnobRow'
import { useDictionary } from '../i18n'

/**
 * The run's fingerprint, read off the board file's header: the value
 * `--dry-run` prints, so a lab board can be matched to a CLI run. A fact, not
 * a statistic: nothing to compare with the previous run.
 */
export function RunFacts({ file }: { file: BoardFile }): ReactElement {
  const dict = useDictionary()
  const { button, paragraph } = useKnobHelp('fingerprint-help', dict.t('fingerprintName'), dict.t('fingerprintHelp'))
  return (
    <>
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        <div>
          <dt>
            {dict.t('factFingerprint')} {button}
          </dt>
          <dd>{file.fingerprint}</dd>
        </div>
      </dl>
      {paragraph}
    </>
  )
}
