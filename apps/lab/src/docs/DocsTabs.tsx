/**
 * A tab group of a docs page: `::::tabs{group}` with one `:::tab{id}` per tab
 * of its group (`TAB_GROUPS`), checked by `shape.ts`. Every group of the same
 * name follows one remembered choice, `ui.docsTabs`. The keyboard is
 * `TabRow`'s: the arrows wrap, Home and End jump, and only the chosen panel
 * is in the document. `panel` draws a tab's blocks, so this file does not
 * import the renderer that imports it.
 */
import type { ContainerDirective } from 'mdast-util-directive'
import { type KeyboardEvent, type ReactElement, type ReactNode, useId } from 'react'
import { nextIndex, useFocusFollowsSelection } from '../shell/roving'
import { useStore } from '../state/store'
import { isTabGroup, TAB_GROUPS } from './tabs'
import { useDocs } from './useDocs'

export function DocsTabs({
  node,
  panel,
}: {
  node: ContainerDirective
  panel: (tab: ContainerDirective, label: string) => ReactNode
}): ReactElement | null {
  const docs = useDocs()
  const base = useId()
  const group = node.attributes?.['group']
  const chosen = useStore((state) => (isTabGroup(group) ? state.ui.docsTabs[group] : null))
  const setDocsTab = useStore((state) => state.ui.setDocsTab)
  const focusRef = useFocusFollowsSelection(chosen)
  if (!isTabGroup(group)) return null
  const tabs = TAB_GROUPS[group]
  const current = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === chosen),
  )
  // `current` is already inside the tuple; `?? tabs[0]` only satisfies the index type.
  const selected = tabs[current] ?? tabs[0]
  const content = node.children.find(
    (child) => child.type === 'containerDirective' && child.name === 'tab' && child.attributes?.['id'] === selected.id,
  )

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextIndex(event.key, current, tabs.length, { axis: 'horizontal', wrap: true })
    const tab = next === null ? undefined : tabs[next]
    if (tab === undefined || !isTabGroup(group)) return
    event.preventDefault()
    setDocsTab(group, tab.id)
  }

  return (
    <div className="fw-docs-tabs">
      <div className="fw-docs-tablist" role="tablist" aria-label={docs.frameworkLabel}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${base}-${tab.id}`}
            aria-selected={i === current}
            // Only the chosen panel is in the document; pointing at an absent id is worse than not pointing.
            {...(i === current ? { 'aria-controls': `${base}-panel` } : {})}
            tabIndex={i === current ? 0 : -1}
            ref={i === current ? focusRef : undefined}
            onClick={() => setDocsTab(group, tab.id)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="fw-docs-tabpanel"
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-${selected.id}`}
        // A panel of prose has no control of its own; as in `Workspace`, the panel is the Tab stop.
        tabIndex={0}
      >
        {content?.type === 'containerDirective' ? panel(content, selected.label) : null}
      </div>
    </div>
  )
}
