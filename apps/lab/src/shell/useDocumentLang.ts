import { useEffect } from 'react'
import { useStore } from '../state/store'

/**
 * The document speaks the page's language: `index.html` ships `lang="en"`, and
 * a screen reader pronounces Polish text with English rules until this is
 * moved.
 */
export function useDocumentLang(): void {
  const lang = useStore((state) => state.lang.lang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
}
