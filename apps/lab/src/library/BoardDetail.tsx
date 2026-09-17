import { readParams } from '@arrowz/engine'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { deleteBoard } from '../api/boards'
import { ViewFlagSwitch, ViewNumberField } from '../console/ViewPanel'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { LIBRARY_VIEW_FIELDS, LIBRARY_VIEW_FLAGS } from './libraryFields'
import { raiseNotice } from './notices'
import { useOpenBoard } from './useOpenBoard'
import { cancelPendingSave, useViewSave } from './useViewSave'

/**
 * One stored board's detail, under the list (spec §5.1, §10 row 5b). It is the
 * old lab's three boxes — `libCommandBox`, `libView` and `libDetail` — gathered
 * into one, because here they are one thing: what this board is and what can be
 * done with it.
 *
 * Absent rather than disabled when the address names no board (Ruling 6): an
 * empty command box and a Delete button with nothing to delete are worse than
 * nothing at all.
 */
export function BoardDetail({ refresh }: { refresh(): void }): ReactElement | null {
  const dict = useDictionary()
  const preview = useStore((state) => state.result.preview)
  const open = useOpenBoard()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const commitView = useViewSave(refresh)

  // A component unmounted inside the confirmation window must not write state
  // afterwards; StrictMode makes that happen in tests.
  useEffect(() => () => clearTimeout(timer.current), [])

  // Ruling 15: not merely "is there a preview", but "is it this address's".
  // The hook leaves the board before this one on the stage until the next file
  // lands, and in that window the detail would describe — and offer to delete —
  // the board the user has just clicked away from.
  //
  // The id alone. A layout hash already binds the board to its dimensions,
  // while the address's size is a directory name: review round 2 measured a
  // folder called `08x08` listing boards whose `W` is 8, where a `WxH`
  // comparison hid the detail of a board the stage and the line both described.
  if (preview === null || preview.meta.id !== open.id) return null
  const meta = preview.meta

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

  // Ruling 9, parity with the old lab's `libLoad`: the knobs, then the view,
  // then the lab — and no run. `setMany` is the machine path and does not move
  // `edits`, which is the only thing `useAutoRun` watches.
  const loadIntoLab = () => {
    const { params, ui, view } = useStore.getState()
    ui.raiseClamped(params.setMany(readParams(meta.params)))
    const stored = meta.view
    view.setNumber('cell', String(stored.cell))
    view.setNumber('stroke', String(stored.stroke))
    view.setNumber('headWidth', String(stored.headWidth))
    view.setNumber('headHeight', String(stored.headHeight))
    view.setFlag('rounded', stored.rounded !== false)
    view.setFlag('colored', stored.colored)
    // A stored board carries no highlight, so this lands off; when one somehow
    // does, its count comes with it, as the old lab copies it.
    view.setFlag('hilite', stored.top > 0)
    if (stored.top > 0) view.setNumber('top', String(stored.top))
    void navigate('/')
  }

  // Two clicks, as the old lab asks: the first arms, the second removes. A
  // different board is a different instance of this component (Ruling 10), so
  // there is no armed flag to carry across boards and nothing to disarm.
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
    const name = `${meta.W}x${meta.H}/${meta.id}`
    void deleteBoard(`${meta.W}x${meta.H}`, meta.id).then((outcome) => {
      if (!outcome.ok) {
        raiseNotice({ kind: 'deleteFailed' })
        return
      }
      // Whether the store had it or not, it is gone now (Ruling 11). The
      // address is replaced rather than pushed: the board it names is off the
      // disk, and Back must not offer it again (spec §5.6).
      raiseNotice({ kind: 'deleted', name })
      void navigate('/boards', { replace: true })
      refresh()
    })
  }

  return (
    <section className="fw-lib-detail" aria-label={dict.t('boardDetail')}>
      <figure className="fw-cmdfig" aria-label={dict.t('boardCommand')}>
        <figcaption className="fw-cmdhd">
          <span className="caps">{dict.t('boardCommand')}</span>
          <button type="button" onClick={copy}>
            {copied ? dict.t('copied') : dict.t('copy')}
          </button>
        </figcaption>
        <pre className="fw-cmd">{meta.command}</pre>
      </figure>
      <div className="fw-grid">
        {LIBRARY_VIEW_FIELDS.map((field) => (
          <ViewNumberField
            key={field.field}
            field={field}
            value={meta.view[field.field]}
            onCommit={(value) => commitView({ ...meta.view, [field.field]: value })}
          />
        ))}
        {LIBRARY_VIEW_FLAGS.map(({ flag, label }) => (
          <ViewFlagSwitch
            key={flag}
            flag={flag}
            label={label}
            on={flag === 'rounded' ? meta.view.rounded !== false : meta.view.colored}
            onToggle={() =>
              commitView(
                flag === 'rounded'
                  ? { ...meta.view, rounded: meta.view.rounded === false }
                  : { ...meta.view, colored: !meta.view.colored },
              )
            }
          />
        ))}
      </div>
      <div className="fw-lib-buttons">
        <button type="button" onClick={loadIntoLab}>
          {dict.t('loadIntoLab')}
        </button>
        <button type="button" className={armed ? 'danger armed' : 'danger'} onClick={remove}>
          {armed ? dict.t('confirmDelete') : dict.t('deleteBoard')}
        </button>
      </div>
    </section>
  )
}
