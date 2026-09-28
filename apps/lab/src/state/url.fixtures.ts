import type { HashView } from './url'
import { VIEW_DEFAULTS } from './viewSchema'

/** A complete view as the lab writes it, so a round trip returns it unchanged. */
export const VIEW: HashView = { ...VIEW_DEFAULTS, highlightLongest: true, lang: 'en' }
