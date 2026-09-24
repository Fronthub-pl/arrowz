import type { BoardFile, WorkerIn, WorkerOut } from '@arrowz/engine'
import { downloadBlob } from './download'

type SvgRequest = Extract<WorkerIn, { type: 'svg' }>

/**
 * Draws one board file as an SVG in a worker of its own and downloads it:
 * tens of megabytes of text at Insane, off the page's thread, and not in the
 * generation worker, which a new run terminates. `failed` hears why a drawing
 * failed; `ended` runs once whichever way it ends, after the worker is gone.
 * The worker is returned so that its owner can take it down on unmount.
 *
 * Shared by the run column's exports and the saved boards' right column, so
 * the two cannot drift in how a drawing is started, named or ended.
 */
export function drawSvg(
  file: BoardFile,
  options: SvgRequest['options'],
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
