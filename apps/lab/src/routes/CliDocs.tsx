import type { ReactElement } from 'react'
import { useDictionary } from '../i18n'

export function CliDocs(): ReactElement {
  const dict = useDictionary()
  return <h2>{dict.t('tabDocs')}</h2>
}
