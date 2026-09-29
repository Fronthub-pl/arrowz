import type { KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDictionary } from '../i18n'
import { nextIndex, useFocusFollowsSelection } from './roving'

// The strip is the application's only navigation, so the route is the
// selection: no second copy of "which tab is open" to drift from the URL.
const TABS = [
  { path: '/', panel: 'lab-panel', key: 'tabLab' },
  { path: '/boards', panel: 'boards-panel', key: 'tabLibrary' },
  { path: '/docs/element', panel: 'docs-panel', key: 'tabDocs' },
] as const

export function selectedIndex(pathname: string): number {
  if (pathname.startsWith('/boards')) return 1
  if (pathname.startsWith('/docs')) return 2
  return 0
}

export function TabRow() {
  const dict = useDictionary()
  const navigate = useNavigate()
  const current = selectedIndex(useLocation().pathname)
  const focusRef = useFocusFollowsSelection(current)

  // Arrow keys move the selection and the focus together; the pattern wraps at
  // both ends, and Home/End jump. The listener sits on each tab, not on the
  // tablist, so the tablist is never a target and needs no tabIndex of its own.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, current, TABS.length, { axis: 'horizontal', wrap: true })
    if (next === null) return
    event.preventDefault()
    const tab = TABS[next]
    if (tab) void navigate(tab.path)
  }

  return (
    <div className="fw-tabrow" role="tablist" aria-label={dict.t('tabsLabel')}>
      {TABS.map((tab, i) => (
        <button
          key={tab.path}
          type="button"
          role="tab"
          id={`tab-${tab.panel}`}
          aria-selected={i === current}
          // Only the selected panel is in the document; pointing at an absent
          // id is worse than not pointing at all.
          {...(i === current ? { 'aria-controls': tab.panel } : {})}
          tabIndex={i === current ? 0 : -1}
          ref={i === current ? focusRef : undefined}
          onClick={() => void navigate(tab.path)}
          onKeyDown={onKeyDown}
        >
          {dict.t(tab.key)}
        </button>
      ))}
    </div>
  )
}
