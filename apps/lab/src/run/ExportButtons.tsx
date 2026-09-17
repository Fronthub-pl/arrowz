import type { BoardFile, WorkerIn, WorkerOut } from '@arrowz/engine'
import { layoutHash } from '@arrowz/engine'
import { svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'

/** The layout hash of one board file, or why it could not be worked out. */
interface Named {
  readonly file: BoardFile
  readonly hash: string | null
  readonly error: string | null
}

/**
 * The mock's two ghost buttons, with handlers (spec §5.2): the board on screen
 * as an SVG and as its board file. Both read the result slice, so a run in
 * flight exports the board beside it, not the one being carved.
 *
 * The SVG is drawn in a worker of its own: tens of megabytes of text at
 * Insane, off the page's thread, and not in the generation worker, which a new
 * run terminates. One at a time (Ruling 7). The board file costs no worker: it is
 * the file itself, named by its layout hash, the name the store gives the same
 * arrows (layout hash spec §5). The hash is asynchronous and a download has to
 * start in its click, so it is worked out when the board arrives and the
 * button waits for it; it lives here because this component is its only reader.
 *
 * An export error is about the board it failed to export, so it is the result
 * slice's, beside that board's store answer, and nothing here holds the board
 * it was about: the next SVG export clears it (Ruling 7), another board taking
 * its place clears it, and a failure that arrives after that is dropped (§5.3).
 * A hash that cannot be worked out is not an export error and is not written
 * there: it is shown under its own words and stays until the board changes.
 */
export function ExportButtons(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const error = useStore((state) => state.result.exportError)
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [named, setNamed] = useState<Named | null>(null)

  // An export outlives nothing: leaving the page takes its worker down.
  useEffect(() => () => drawing.current?.terminate(), [])

  // One hash per shown board. The cleanup drops an answer for a board that is
  // no longer shown — and the first of StrictMode's two mount runs. Dropping it
  // is what keeps a slow hash from landing on top of a newer one.
  useEffect(() => {
    if (result === null) return
    let ignore = false
    const { file, board } = result
    layoutHash(board).then(
      (hash) => {
        if (!ignore) setNamed({ file, hash, error: null })
      },
      (reason: unknown) => {
        if (!ignore) setNamed({ file, hash: null, error: reason instanceof Error ? reason.message : String(reason) })
      },
    )
    return () => {
      ignore = true
    }
  }, [result])
  // `named` keeps the last board's hash until the new board's arrives, and the
  // two guards cover the two orders a hash can arrive in. The file comparison
  // covers the early window: without it the button would offer the old board's
  // name for the new one until the new hash lands. The effect's `ignore` covers
  // the late one: an old hash landing after the new one would overwrite
  // `named`, fail this comparison, and leave the button dead until the next run.
  const current = result !== null && named !== null && named.file === result.file ? named : null
  const hash = current?.hash ?? null

  const exportSvg = () => {
    if (result === null || drawing.current !== null) return
    const about = result.file
    const { W, H, seed } = result.params
    const name = `arrowz-${W}x${H}-seed${seed}.svg`
    // The view of the moment, cell included: the export field is what `cell` is for.
    const view = useStore.getState().view
    const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
    const end = () => {
      worker.terminate()
      drawing.current = null
      setBusy(false)
    }
    worker.onmessage = (event: MessageEvent<WorkerOut>) => {
      const message = event.data
      if (message.type === 'svg') downloadBlob(new Blob([message.svg], { type: 'image/svg+xml' }), name)
      else if (message.type === 'error') useStore.getState().result.exported(about, message.message)
      end()
    }
    worker.onerror = (event) => {
      useStore.getState().result.exported(about, event.message)
      end()
    }
    drawing.current = worker
    setBusy(true)
    useStore.getState().result.exported(about, null)
    worker.postMessage({
      type: 'svg',
      board: result.file,
      options: { ...svgOptions(viewOf(view)), voids: view.voids },
    } satisfies WorkerIn)
  }

  const exportFile = () => {
    if (result === null || hash === null) return
    downloadBlob(new Blob([JSON.stringify(result.file)], { type: 'application/json' }), `${hash}.board.json`)
  }

  return (
    <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
      <button type="button" onClick={exportSvg} disabled={result === null || busy}>
        {dict.t('downloadSvg')}
      </button>
      <button type="button" onClick={exportFile} disabled={hash === null}>
        {dict.t('downloadBoardFile')}
      </button>
      {error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('exportError')} ${error}`}
        </p>
      )}
      {current === null || current.error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('layoutHashError')} ${current.error}`}
        </p>
      )}
    </div>
  )
}
