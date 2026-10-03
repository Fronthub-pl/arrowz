import { svgOptions } from '@arrowz/engine/command'
import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { useStore } from '../state/store'
import { viewOf } from '../state/view.slice'
import { downloadBlob } from './download'
import { useSvgDrawing } from './useSvgDrawing'

/**
 * The mock's two ghost buttons: the board on screen as an SVG and as its board
 * file. Both read the result slice, so a run in flight exports the board beside
 * it, not the one being carved.
 *
 * The SVG is drawn by `useSvgDrawing`, one at a time. The board file is the file itself, named by its
 * layout hash like the store names it. A download has to start in its click,
 * so the hash is the result slice's (`useShownHash`), ready before the click.
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
  // `useShownHash` works it out when the board arrives, and only for the board on screen.
  const current = useStore((state) => state.result.hash)
  const hash = current?.value ?? null

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
