import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'
import { openFilePicker } from './BoardFileInput'

export function OpenFileButton({ className }: { className?: string }): ReactElement {
  const dict = useDictionary()
  return (
    <button type="button" className={className} onClick={openFilePicker}>
      {dict.t('openFile')}
    </button>
  )
}
