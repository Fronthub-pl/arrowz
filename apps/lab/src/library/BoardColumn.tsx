import { svgOptions } from '@arrowz/engine/command'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement, useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteBoard } from '../api/boards'
import { useDictionary } from '../i18n'
import { CommandFigure } from '../run/CommandFigure'
import type { RunControl } from '../run/useRun'
import { type StateLine, useRunState } from '../stage/useRunState'
import { useStore } from '../state/store'
import { lookOf } from '../state/view.slice'
import { BOARD_COLUMN_ID } from './boardColumnId'
import { FileColumn } from './FileColumn'
import { loadIntoLab } from './loadIntoLab'
import { raiseNotice } from './notices'
import { OpenFileButton } from './OpenFileButton'
import { RecipeList } from './RecipeList'
import { SavedExports } from './SavedExports'
import { refreshLibrary } from './useLibraryList'
import { useOpenPreview } from './useOpenPreview'
import { cancelPendingSave } from './useViewSave'

/**
 * The stage's right column on the saved boards, in the run column's track: the
 * open board's command, Load into lab, Delete, two exports, its facts, and
 * its recipes. With
 * no board open it says how to open one instead of offering an empty command.
 *
 * `Workspace` keys it by the open board: an armed Delete, a Copied label and a
 * drawing's error belong to the board they were raised on.
 */

/**
 * The library's events and failures in words, `aria-hidden` because the live
 * `<output>` says the same. From 768 up that output is out of sight, so this is
 * where a person reads them, also with no board open (where Delete and a failed
 * load land).
 */
function LibraryLine({ line }: { line: StateLine | null }): ReactElement {
  return (
    <p className={line?.bad === true ? 'fw-runstate bad' : 'fw-runstate'} aria-hidden="true">
      {line?.text ?? ''}
    </p>
  )
}

export function BoardColumn({ control }: { control: RunControl }): ReactElement {
  const dict = useDictionary()
  const open = useOpenPreview()
  const navigate = useNavigate()
  const [armed, setArmed] = useState(false)
  const { library } = useRunState()

  if (open === null) {
    return (
      <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
        <p className="fw-lib-empty">{dict.t('openBoardHint')}</p>
        <div className="fw-alt">
          <OpenFileButton />
        </div>
        <LibraryLine line={library} />
      </section>
    )
  }
  if (open.origin === 'file') return <FileColumn opened={open.opened} control={control} />
  const { stored, size } = open
  const meta = stored.meta

  // Two clicks: the first arms, the second removes.
  const remove = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    // First: this board's view save still waiting on its timer would land after the delete and write the board back to disk.
    cancelPendingSave(meta.id)
    // The address's directory, not `${meta.W}x${meta.H}`: a folder called
    // `08x08` holds boards whose `W` is 8, and a DELETE to a missing directory
    // answers 404, which reads as "deleted" while the board stays on disk.
    const name = `${size}/${meta.id}`
    void deleteBoard(size, meta.id).then((outcome) => {
      if (!outcome.ok) {
        raiseNotice({ kind: 'deleteFailed' })
        return
      }
      // Gone either way. Replaced, not pushed: Back must not offer a board
      // that is off the disk.
      raiseNotice({ kind: 'deleted', name })
      void navigate('/boards', { replace: true })
      refreshLibrary()
    })
  }

  // The board as it is drawn here: its own saved shape in the page's look, and its jammed cells when it did not close, as `BoardFrame` draws them.
  const exportOptions = () => ({
    ...svgOptions({ ...meta.view, ...lookOf(useStore.getState().view) }),
    voids: meta.ok === false,
  })

  const created = meta.createdAt ? new Date(meta.createdAt).toLocaleString(dict.locale) : ''
  // The layout row alone carries the full hash and wraps anywhere: a hash
  // this long has no useful shortening, and a `title` nobody can select is
  // worse than letting the row grow. The generated row wraps only at the
  // space its own join put between the duration and the date — breaking
  // `21:50:45` itself would be as unreadable as cutting it.
  const facts: [string, string, ('hash' | 'text')?][] = [
    [dict.t('factLayout'), `${size}/${meta.id}`, 'hash'],
    [dict.t('factSeed'), String(meta.seed)],
    [dict.t('factSource'), meta.source],
    [
      dict.t('factGenerated'),
      [`${genSeconds(meta, '—')} s`, created].filter((part) => part !== '').join(' · '),
      'text',
    ],
  ]

  return (
    <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
      <CommandFigure label={dict.t('boardCommand')} caption={dict.t('cliThisBoard')} command={meta.command} />
      <button
        type="button"
        className="fw-go"
        onClick={() => loadIntoLab(meta, control, (path) => void navigate(path), meta.id)}
      >
        {dict.t('loadIntoLab')}
      </button>
      <LibraryLine line={library} />
      <div className="fw-alt">
        <button type="button" className={armed ? 'danger armed' : 'danger'} onClick={remove}>
          {!armed
            ? dict.t('deleteBoard')
            : meta.sources.length >= 2
              ? dict.t('confirmDeleteRecipes', meta.sources.length)
              : dict.t('confirmDelete')}
        </button>
      </div>
      <SavedExports
        file={stored.file}
        options={exportOptions}
        svgName={`arrowz-${meta.W}x${meta.H}-seed${meta.seed}.svg`}
        fileName={`${meta.id}.board.json` /* the id is the layout hash */}
      />
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        {facts.map(([term, value, wrap]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd className={wrap === 'hash' ? 'wrap' : wrap === 'text' ? 'wrap-text' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
      <RecipeList meta={meta} control={control} />
    </section>
  )
}
