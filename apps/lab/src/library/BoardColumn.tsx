import type { BoardFile } from '@arrowz/engine'
import { readParams } from '@arrowz/engine'
import { svgOptions } from '@arrowz/engine/command'
import { genSeconds } from '@arrowz/engine/report'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteBoard } from '../api/boards'
import { useDictionary } from '../i18n'
import { CommandText } from '../run/CommandText'
import { downloadBlob } from '../run/download'
import { drawSvg } from '../run/drawSvg'
import { MoreMenu } from '../run/MoreMenu'
import { type StateLine, useRunState } from '../stage/useRunState'
import { useStore } from '../state/store'
import { raiseNotice } from './notices'
import { refreshLibrary } from './useLibraryList'
import { useOpenPreview } from './useOpenPreview'
import { cancelPendingSave } from './useViewSave'

/**
 * The stage's right column on the saved boards, in the run column's track: the
 * open board's command, Load into lab, Delete, two exports, and its facts. With
 * no board open it says how to open one instead of offering an empty command.
 *
 * `Workspace` keys it by the open board: an armed Delete, a Copied label and a
 * drawing's error belong to the board they were raised on.
 */

/** The board column's id, which the phone's Board sheet button controls. */
export const BOARD_COLUMN_ID = 'board-column'

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

export function BoardColumn(): ReactElement {
  const dict = useDictionary()
  const open = useOpenPreview()
  const lang = useStore((state) => state.lang.lang)
  const theme = useStore((state) => state.view.theme)
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState(false)
  const [drawError, setDrawError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const { library } = useRunState()

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests. Leaving the page takes a
  // drawing down with it.
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      drawing.current?.terminate()
    },
    [],
  )
  if (open === null) {
    return (
      <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
        <p className="fw-lib-empty">{dict.t('openBoardHint')}</p>
        <LibraryLine line={library} />
      </section>
    )
  }
  const { stored, size } = open
  const meta = stored.meta

  const copy = () => {
    const clipboard = navigator.clipboard
    // Undefined outside a secure context; the label staying put is the honest signal.
    if (clipboard === undefined) return
    void clipboard
      .writeText(meta.command)
      .then(() => {
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }

  // The knobs, then the view, then the lab, and no run: `setMany` does not
  // move `edits`, the only thing `useAutoRun` watches.
  const loadIntoLab = () => {
    const { params, ui, view } = useStore.getState()
    ui.raiseClamped(params.setMany(readParams(meta.params)))
    const saved = meta.view
    view.setNumber('cell', String(saved.cell))
    view.setNumber('stroke', String(saved.stroke))
    view.setNumber('headWidth', String(saved.headWidth))
    view.setNumber('headHeight', String(saved.headHeight))
    view.setFlag('rounded', saved.rounded !== false)
    view.setFlag('colored', saved.colored)
    // A stored board carries no highlight, so this lands off; when one somehow
    // does, its count comes with it.
    view.setFlag('highlightLongest', saved.top > 0)
    if (saved.top > 0) view.setNumber('top', String(saved.top))
    void navigate('/')
  }

  // Two clicks: the first arms, the second removes.
  const remove = () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    // First: a view save still waiting on its timer would land after the
    // delete and write the board back to disk.
    cancelPendingSave()
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

  // The file as the store holds it: `decodeBoard` accepted it when it loaded,
  // and it goes out untouched, named by its layout hash — which is the id.
  const exportFile = () =>
    downloadBlob(new Blob([JSON.stringify(stored.file)], { type: 'application/json' }), `${meta.id}.board.json`)

  // The board as it is drawn here: its own saved view, and its jammed cells
  // when it did not close, as `BoardFrame` draws them.
  const exportSvg = () => {
    if (drawing.current !== null) return
    setBusy(true)
    setDrawError(null)
    drawing.current = drawSvg(
      stored.file as BoardFile,
      { ...svgOptions(meta.view), voids: meta.ok === false },
      `arrowz-${meta.W}x${meta.H}-seed${meta.seed}.svg`,
      setDrawError,
      () => {
        drawing.current = null
        setBusy(false)
      },
    )
  }

  const created = meta.createdAt ? new Date(meta.createdAt).toLocaleString(lang === 'pl' ? 'pl' : 'en-GB') : ''
  // The layout row alone carries the full hash and wraps for it: a hash this
  // long has no useful shortening, and a `title` nobody can select is worse
  // than letting the row grow.
  const facts: [string, string, boolean?][] = [
    [dict.t('factLayout'), `${size}/${meta.id}`, true],
    [dict.t('factSeed'), String(meta.seed)],
    [dict.t('factSource'), meta.source],
    [dict.t('factGenerated'), [`${genSeconds(meta, '—')} s`, created].filter((part) => part !== '').join(' · ')],
  ]

  return (
    <section id={BOARD_COLUMN_ID} className="fw-run-col fw-bcol" aria-label={dict.t('boardDetail')}>
      <figure className="fw-cmdfig" aria-label={dict.t('boardCommand')}>
        <figcaption className="fw-cmdhd">
          <span className="caps">{dict.t('cliThisBoard')}</span>
          <button type="button" onClick={copy}>
            {copied ? dict.t('copied') : dict.t('copy')}
          </button>
        </figcaption>
        <pre className="fw-cmd">
          <CommandText command={meta.command} />
        </pre>
      </figure>
      <button type="button" className="fw-go" onClick={loadIntoLab}>
        {dict.t('loadIntoLab')}
      </button>
      <LibraryLine line={library} />
      <div className="fw-alt">
        <button type="button" className={armed ? 'danger armed' : 'danger'} onClick={remove}>
          {armed ? dict.t('confirmDelete') : dict.t('deleteBoard')}
        </button>
      </div>
      <MoreMenu>
        <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
          <button type="button" onClick={exportSvg} disabled={busy}>
            {dict.t('downloadSvg')}
          </button>
          <button type="button" onClick={exportFile}>
            {dict.t('downloadBoardFile')}
          </button>
          {/* The engine's `toSvg` never learns a theme's colours. */}
          {theme === '' ? null : <p className="fw-export-note">{dict.t('svgThemeNote')}</p>}
          {drawError === null ? null : (
            <p className="fw-export-error" role="alert">
              {`${dict.t('exportError')} ${drawError}`}
            </p>
          )}
        </div>
      </MoreMenu>
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        {facts.map(([term, value, wrap]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd className={wrap === true ? 'wrap' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
