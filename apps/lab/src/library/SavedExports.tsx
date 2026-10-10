import type { BoardFile } from '@fronthub/arrowz-engine'
import { type ReactElement, useState } from 'react'
import { useDictionary } from '../i18n'
import { downloadBlob } from '../run/download'
import { MoreMenu } from '../run/MoreMenu'
import { type SvgOptions, useSvgDrawing } from '../run/useSvgDrawing'

/**
 * The two exports of a board in the library, a saved one or one opened from
 * disk, behind the column's More menu. The file goes out untouched. `options`
 * is read at the click, so the drawing takes the look on screen at that moment;
 * a drawing's error stays with the board, as the column is keyed by it.
 */
export function SavedExports({
  file,
  options,
  svgName,
  fileName,
}: {
  file: BoardFile
  options: () => SvgOptions
  svgName: string
  fileName: string
}): ReactElement {
  const dict = useDictionary()
  const { busy, draw } = useSvgDrawing()
  const [error, setError] = useState<string | null>(null)

  const exportSvg = () => {
    if (busy) return
    setError(null)
    draw(file, options(), svgName, setError)
  }
  const exportFile = () => downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), fileName)

  return (
    <MoreMenu>
      <div className="fw-ghost fw-exports" role="group" aria-label={dict.t('exportsGroup')}>
        <button type="button" onClick={exportSvg} disabled={busy}>
          {dict.t('downloadSvg')}
        </button>
        <button type="button" onClick={exportFile}>
          {dict.t('downloadBoardFile')}
        </button>
        {error === null ? null : (
          <p className="fw-export-error" role="alert">
            {`${dict.t('exportError')} ${error}`}
          </p>
        )}
      </div>
    </MoreMenu>
  )
}
