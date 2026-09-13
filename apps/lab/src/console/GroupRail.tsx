import type React from 'react'
import { useDictionary } from '../i18n'
import { type RailEntry, RAIL_GROUPS } from '../state/ui.slice'
import { useStore } from '../state/store'
import { countsByGroup } from './violationCounts'

/** Every entry, in rail order: the generator's groups, then the element's section. */
const ENTRIES: readonly RailEntry[] = [...RAIL_GROUPS, 'preview']

export const tabId = (entry: RailEntry) => `rail-tab-${entry}`
export const panelId = (entry: RailEntry) => `rail-panel-${entry}`

/**
 * The console's left rail. A vertical tablist rather than the mock's plain
 * `<nav>`: picking an entry replaces the panel beside it, and that
 * relationship has to be in the markup, not only in the layout (Ruling 13).
 *
 * The violation count is in the tab's accessible name and says what it counts;
 * the colour only repeats it.
 */
export function GroupRail() {
  const dict = useDictionary()
  const entry = useStore((state) => state.ui.entry)
  const select = useStore((state) => state.ui.select)
  const violations = useStore((state) => state.params.violations)
  const counts = countsByGroup(violations)

  const move = (delta: number) => {
    const at = ENTRIES.indexOf(entry)
    const next = ENTRIES[(at + delta + ENTRIES.length) % ENTRIES.length]
    if (next) select(next)
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => select('board'),
      End: () => select('preview'),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  /**
   * Focus follows the selection, but only while the rail already owns focus —
   * the same guard `TabRow.tsx:65-69` uses, so that selecting a group from
   * elsewhere does not steal focus out of whatever the user was in.
   */
  const focusIfSelected = (selected: boolean) => (node: HTMLButtonElement | null) => {
    if (node && selected && node.parentElement?.contains(document.activeElement)) node.focus()
  }

  const tab = (value: RailEntry, name: string, count?: number) => (
    <button
      key={value}
      type="button"
      role="tab"
      id={tabId(value)}
      aria-selected={entry === value}
      // Pointing at an id that is not in the document is worse than not
      // pointing at all; only the selected panel is rendered.
      {...(entry === value ? { 'aria-controls': panelId(value) } : {})}
      // A bare digit announces "lengths 1". The name says what the 1 is.
      {...(count === undefined ? {} : { 'aria-label': dict.t('violationsInGroup', name, count) })}
      tabIndex={entry === value ? 0 : -1}
      ref={focusIfSelected(entry === value)}
      onKeyDown={onKeyDown}
      onClick={() => select(value)}
    >
      <span>{name}</span>
      {count === undefined ? null : <span className="n">{count}</span>}
    </button>
  )

  return (
    <div className="fw-rail" role="tablist" aria-orientation="vertical" aria-label={dict.t('railLabel')}>
      {/* A tablist owns tabs. The two section headings are a visual grouping,
          so they are hidden from the accessibility tree rather than left in it
          as children the role does not allow; the tab names carry the meaning. */}
      <span className="sec caps" aria-hidden="true">
        {dict.t('railGenerator')}
      </span>
      {RAIL_GROUPS.map((group) => tab(group, dict.d.groups[group], counts[group]))}
      <span className="sec caps" aria-hidden="true">
        {dict.t('railElement')}
      </span>
      {tab('preview', dict.t('preview'))}
    </div>
  )
}
