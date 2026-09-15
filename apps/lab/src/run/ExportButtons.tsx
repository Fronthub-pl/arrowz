import type { WorkerIn, WorkerOut } from '@arrowz/engine'
import { boardId, svgOptions } from '@arrowz/engine/command'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'

/**
 * The mock's two ghost buttons, with handlers (spec §5.2): the board on screen
 * as an SVG and as its board file. Both read the result slice, so a run in
 * flight exports the board beside it, not the one being carved.
 *
 * The SVG is drawn in a worker of its own, as the old lab draws it
 * (lab-page.ts:955-989): tens of megabytes of text at Insane, off the page's
 * thread, and not in the generation worker, which a new run terminates. One at
 * a time (Ruling 7). The board file costs no worker: it is the file itself.
 */
export function ExportButtons(): ReactElement {
  const dict = useDictionary()
  const result = useStore((state) => state.result.shown)
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An export outlives nothing: leaving the page takes its worker down.
  useEffect(() => () => drawing.current?.terminate(), [])

  const exportSvg = () => {
    if (result === null || drawing.current !== null) return
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
      else if (message.type === 'error') setError(message.message)
      end()
    }
    worker.onerror = (event) => {
      setError(event.message)
      end()
    }
    drawing.current = worker
    setBusy(true)
    setError(null)
    worker.postMessage({
      type: 'svg',
      board: result.file,
      options: { ...svgOptions(viewOf(view)), voids: view.voids },
    } satisfies WorkerIn)
  }

  const exportFile = () => {
    if (result === null) return
    downloadBlob(
      new Blob([JSON.stringify(result.file)], { type: 'application/json' }),
      `${boardId(result.params)}.board.json`,
    )
  }

  return (
    <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
      <button type="button" onClick={exportSvg} disabled={result === null || busy}>
        {dict.t('downloadSvg')}
      </button>
      <button type="button" onClick={exportFile} disabled={result === null}>
        {dict.t('downloadBoardFile')}
      </button>
      {error === null ? null : (
        <p className="fw-export-error" role="alert">
          {`${dict.t('exportError')} ${error}`}
        </p>
      )}
    </div>
  )
}
