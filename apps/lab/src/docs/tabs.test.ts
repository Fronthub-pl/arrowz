import { expect, test } from 'vitest'
import { docsTabsOf, isTabGroup, TAB_GROUPS, TAB_IDS } from './tabs'

test('the framework group is HTML, Angular, React, Vue and Svelte, in that order', () => {
  expect(TAB_GROUPS.framework.map((tab) => tab.label)).toEqual(['HTML', 'Angular', 'React', 'Vue', 'Svelte'])
  expect(TAB_IDS).toEqual(['html', 'angular', 'react', 'vue', 'svelte'])
})

test('a group is known by its name only', () => {
  expect(isTabGroup('framework')).toBe(true)
  expect(isTabGroup('toString')).toBe(false)
  expect(isTabGroup(undefined)).toBe(false)
})

// What the page may find stored: nothing, damage, an older or a foreign choice.
test.each([
  [null, 'html'],
  ['', 'html'],
  ['not json', 'html'],
  ['[]', 'html'],
  ['3', 'html'],
  ['{"framework":"solid"}', 'html'],
  ['{"framework":3}', 'html'],
  ['{"framework":"vue"}', 'vue'],
  ['{"framework":"svelte","other":"x"}', 'svelte'],
])('stored %j opens on %s', (stored, id) => {
  expect(docsTabsOf(stored)).toEqual({ framework: id })
})
