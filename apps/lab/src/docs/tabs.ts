/**
 * The tab groups a docs page may hold, `::::tabs{group}`, and their tabs in
 * order. A label is a name and is not translated. Pure: the content guard
 * reads it in Node, and the store reads the remembered choice through
 * `docsTabsOf`.
 */
export const TAB_GROUPS = {
  framework: [
    { id: 'html', label: 'HTML' },
    { id: 'angular', label: 'Angular' },
    { id: 'react', label: 'React' },
    { id: 'vue', label: 'Vue' },
    { id: 'svelte', label: 'Svelte' },
  ],
} as const

export type TabGroup = keyof typeof TAB_GROUPS

/** The chosen tab of every group, by id. */
export type DocsTabs = Readonly<Record<TabGroup, string>>

export function isTabGroup(name: string | null | undefined): name is TabGroup {
  return typeof name === 'string' && Object.hasOwn(TAB_GROUPS, name)
}

export const TAB_IDS: readonly string[] = Object.values(TAB_GROUPS).flatMap((tabs) => tabs.map((tab) => tab.id))

/** The remembered choice, as stored JSON; anything missing, damaged or unknown is the group's first tab. */
export function docsTabsOf(stored: string | null): DocsTabs {
  let saved: unknown = null
  try {
    saved = stored === null ? null : JSON.parse(stored)
  } catch {
    saved = null
  }
  const pick = (group: TabGroup): string => {
    const value = typeof saved === 'object' && saved !== null ? Reflect.get(saved, group) : undefined
    const tabs = TAB_GROUPS[group]
    return tabs.find((tab) => tab.id === value)?.id ?? tabs[0].id
  }
  return { framework: pick('framework') }
}
