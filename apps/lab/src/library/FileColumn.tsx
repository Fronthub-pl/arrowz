import { svgOptions } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { CommandText } from '../run/CommandText'
import type { RunControl } from '../run/useRun'
import { useRunState } from '../stage/useRunState'
import type { OpenedFile } from '../state/result.slice'
import { useStore } from '../state/store'
import { lookOf, viewOf } from '../state/view.slice'
import { BOARD_COLUMN_ID } from './boardColumnId'
import { loadIntoLab } from './loadIntoLab'
import { OpenFileButton } from './OpenFileButton'
import { SavedExports } from './SavedExports'

/**
 * The board column for a board opened from disk. Not in the store, so no
 * Delete; with its meta it has a command and Load into lab, without one only
 * what the file itself carries.
 */
export function FileColumn({ opened, control }: { opened: OpenedFile; control: RunControl }): ReactElement {
  const dict = useDictionary()
  const navigate = useNavigate()
  const { library } = useRunState()
  const { meta, file, name, id } = opened
  const stem = name.replace(/\.board\.json$|\.json$/, '')

  // Drawn as the stage draws it: the meta's view when there is one, the lab's otherwise.
  const exportOptions = () => {
    const view = useStore.getState().view
    return {
      ...svgOptions({ ...(meta === null ? viewOf(view) : meta.view), ...lookOf(view) }),
      voids: meta === null ? view.voids : meta.ok === false,
    }
  }

  return (
    <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
      {meta === null ? null : (
        <>
          <figure className="fw-cmdfig" aria-label={dict.t('boardCommand')}>
            <figcaption className="fw-cmdhd">
              <span className="caps">{dict.t('cliThisBoard')}</span>
            </figcaption>
            <pre className="fw-cmd">
              <CommandText command={meta.command} />
            </pre>
          </figure>
          <button
            type="button"
            className="fw-go"
            onClick={() => loadIntoLab(meta, control, (path) => void navigate(path))}
          >
            {dict.t('loadIntoLab')}
          </button>
        </>
      )}
      <p className={library?.bad === true ? 'fw-runstate bad' : 'fw-runstate'} aria-hidden="true">
        {library?.text ?? ''}
      </p>
      <div className="fw-alt">
        <OpenFileButton />
      </div>
      <SavedExports
        file={file}
        options={exportOptions}
        svgName={`${stem}.svg`}
        fileName={name.endsWith('.json') ? name : `${stem}.board.json`}
      />
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        <div>
          <dt>{dict.t('factFile')}</dt>
          <dd className="wrap-text">{name}</dd>
        </div>
        <div>
          <dt>{dict.t('factLayout')}</dt>
          <dd className="wrap">{id}</dd>
        </div>
      </dl>
    </section>
  )
}
