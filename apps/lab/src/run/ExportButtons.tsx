import type { BoardFile } from '@arrowz/engine'
import { layoutHash } from '@arrowz/engine'
import { svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'
import { useSvgDrawing } from './useSvgDrawing'

/** The layout hash of one board file, or why it could not be worked out. */
interface Named {
  readonly file: BoardFile
  readonly hash: string | null
  readonly error: string | null
}

/**
 * The mock's two ghost buttons: the board on screen as an SVG and as its board
 * file. Both read the result slice, so a run in flight exports the board beside
 * it, not the one being carved.
 *
 * The SVG is drawn by `useSvgDrawing`, one at a time. The board file is the file itself, named by its
 * layout hash like the store names it. The hash is asynchronous and a download
 * has to start in its click, so it is worked out when the board arrives.
 *
 * An export error belongs to the board it failed to export, so it is the result
 * slice's: the next SVG export clears it, another board clears it, and a
 * failure that arrives after that is dropped. A hash that cannot be worked out
 * is not an export error: it is shown in its own words until the board changes.
 */
export function ExportButtons(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const error = useStore((state) => state.result.exportError)
  const { busy, draw } = useSvgDrawing()
  const [named, setNamed] = useState<Named | null>(null)

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
  // `named` keeps the last board's hash until the new one arrives. The file
  // comparison covers the early window (the old name offered for the new
  // board); the effect's `ignore` covers the late one (an old hash landing
  // after the new one would overwrite `named` and leave the button dead).
  const current = result !== null && named !== null && named.file === result.file ? named : null
  const hash = current?.hash ?? null

  const exportSvg = () => {
    if (result === null || busy) return
    const about = result.file
    const { W, H, seed } = result.params
    const name = `arrowz-${W}x${H}-seed${seed}.svg`
    // The view of the moment, cell included: the export field is what `cell` is for.
    const view = useStore.getState().view
    useStore.getState().result.exported(about, null)
    draw(result.file, { ...svgOptions(viewOf(view)), voids: view.voids }, name, (reason) =>
      useStore.getState().result.exported(about, reason),
    )
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
