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
import { useStore } from '../state/store'
import { shortId } from './BoardList'
import { raiseNotice } from './notices'
import { refreshLibrary } from './useLibraryList'
import { useOpenPreview } from './useOpenPreview'
import { cancelPendingSave } from './useViewSave'

/**
 * The stage's right column on the saved boards (handoff 2, PR 6), where the
 * lab has its run column and in the same track: the open board's command,
 * Load into lab as the primary action, Delete from disk, its two exports, and
 * what it is. With no board open it says how to open one, rather than offering
 * an empty command and a Delete with nothing to delete (Ruling 6 of PR 5b).
 *
 * Mounted under the open board's key (Workspace.tsx), as the old detail was
 * (Ruling 10): an armed Delete, a Copied label and a drawing's error are all
 * about the board they were raised on, and a new board is a new instance.
 */

/** The board column's id, which the phone's Board sheet button controls (handoff 2, PR 7). */
export const BOARD_COLUMN_ID = 'board-column'

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
      </section>
    )
  }
  const { stored, size } = open
  const meta = stored.meta

  const copy = () => {
    const clipboard = navigator.clipboard
    // Undefined outside a secure context, where the interface is not exposed
    // at all — the same guard `LiveCommand` carries, and for the same reason:
    // the button staying on its normal label is the honest signal.
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

  // Ruling 9: the knobs, then the view, then the lab — and no run. `setMany`
  // is the machine path and does not move `edits`, which is the only thing
  // `useAutoRun` watches.
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
    view.setFlag('hilite', saved.top > 0)
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
    // Before anything reaches the store: a view save still waiting on its timer
    // would otherwise land after the delete and write the board back to disk,
    // which review round 2 measured against a real store (Rulings 11 and 12).
    cancelPendingSave()
    // The address's directory, not `${meta.W}x${meta.H}`: the store finds a
    // board by the directory it listed, and a folder called `08x08` lists
    // boards whose `W` is 8. Reconstructing the size sent the DELETE to a
    // directory the store has not got, and Ruling 11 turned its 404 into
    // "deleted" while the board stayed on disk.
    const name = `${size}/${meta.id}`
    void deleteBoard(size, meta.id).then((outcome) => {
      if (!outcome.ok) {
        raiseNotice({ kind: 'deleteFailed' })
        return
      }
      // Whether the store had it or not, it is gone now (Ruling 11). The
      // address is replaced rather than pushed: the board it names is off the
      // disk, and Back must not offer it again (spec §5.6).
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
  const facts: [string, string, string?][] = [
    [dict.t('factLayout'), `${size}/${shortId(meta.id)}`, meta.id],
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
          {/* The engine's `toSvg` never learns a theme's colours (spec §9). */}
          {theme === '' ? null : <p className="fw-export-note">{dict.t('svgThemeNote')}</p>}
          {drawError === null ? null : (
            <p className="fw-export-error" role="alert">
              {`${dict.t('exportError')} ${drawError}`}
            </p>
          )}
        </div>
      </MoreMenu>
      <dl className="fw-bmeta" aria-label={dict.t('boardFacts')}>
        {facts.map(([term, value, full]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd {...(full === undefined ? {} : { title: full })}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
