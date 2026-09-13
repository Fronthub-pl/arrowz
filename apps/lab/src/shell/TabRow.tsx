import type { KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useDictionary } from '../i18n'

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

  // Arrow keys move the selection and the focus together; the pattern wraps at
  // both ends, and Home/End jump. A mouse user never meets this path, which is
  // exactly why the mock has none of it. The listener sits on each tab, not on
  // the tablist: the event still fires from the focused button either way, and
  // the tablist container is then never a target of a handler or a click, so
  // it needs no tabIndex of its own.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = TABS.length - 1
    const next =
      event.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : event.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
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
          ref={(node) => {
            // Focus follows the selection, but only while the strip already
            // has it: clicking a tab must not steal focus back from a panel.
            if (node && i === current && node.parentElement?.contains(document.activeElement)) node.focus()
          }}
          onClick={() => void navigate(tab.path)}
          onKeyDown={onKeyDown}
        >
          {dict.t(tab.key)}
        </button>
      ))}
    </div>
  )
}
