import type { BoardFile, WorkerIn, WorkerOut } from '@fronthub/arrowz-engine'
import { useEffect, useRef, useState } from 'react'
import { downloadBlob } from './download'

/** What the drawing worker is asked to draw with. */
export type SvgOptions = Extract<WorkerIn, { type: 'svg' }>['options']

/**
 * Draws one board file as an SVG in a worker of its own and downloads it:
 * tens of megabytes of text at Insane, off the page's thread, and not in the
 * generation worker, which a new run terminates. `failed` hears why a drawing
 * failed; `ended` runs once whichever way it ends, after the worker is gone.
 * The worker is returned so that its owner can take it down on unmount.
 */
function drawSvg(
  file: BoardFile,
  options: SvgOptions,
  name: string,
  failed: (reason: string) => void,
  ended: () => void,
): Worker {
  const worker = new Worker(new URL('../worker/generate.worker.ts', import.meta.url), { type: 'module' })
  const end = () => {
    worker.terminate()
    ended()
  }
  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const message = event.data
    if (message.type === 'svg') downloadBlob(new Blob([message.svg], { type: 'image/svg+xml' }), name)
    else if (message.type === 'error') failed(message.message)
    end()
  }
  worker.onerror = (event) => {
    failed(event.message)
    end()
  }
  worker.postMessage({ type: 'svg', board: file, options } satisfies WorkerIn)
  return worker
}

/**
 * One drawing at a time for the component that owns it: `busy` while it runs,
 * and taken down when the component unmounts. Shared by the run column's
 * exports and the saved boards' column, so the two cannot drift in how a
 * drawing is started, named or ended. `draw` does nothing while one runs.
 */
export function useSvgDrawing(): {
  busy: boolean
  draw: (file: BoardFile, options: SvgOptions, name: string, failed: (reason: string) => void) => void
} {
  const drawing = useRef<Worker | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => drawing.current?.terminate(), [])
  const draw = (file: BoardFile, options: SvgOptions, name: string, failed: (reason: string) => void) => {
    if (drawing.current !== null) return
    setBusy(true)
    drawing.current = drawSvg(file, options, name, failed, () => {
      drawing.current = null
      setBusy(false)
    })
  }
  return { busy, draw }
}
