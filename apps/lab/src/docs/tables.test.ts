// The lab's tables on the Docs tab take their rows from the lab's code and
// their descriptions from `lab-docs.ts`, which cannot import that code. Each
// is compared with the code both ways: a key bound without a description fails
// here as surely as a description left behind for a key that is gone. The two
// languages share their keys by type, so English stands for both.
import { ENV_VARS, KNOB_ROWS } from '@arrowz/engine/command'
import { docsFor } from '@arrowz/engine/docs'
import { dictionary } from '@arrowz/engine/i18n'
import { expect, test } from 'vitest'
import { docsPaletteRows } from '../palette/commands'
import { shownKeys } from '../shell/hotkeys'
import { useStore } from '../state/store'
import { LINK_FIELDS } from '../state/url'
import { VIEW_KEYS } from '../state/viewSchema'
import { knobHelp } from './DocsTable'

const sorted = (values: Iterable<string>) => [...values].sort()
const docs = docsFor('en')

test('the key descriptions are the keys the lab binds', () => {
  expect(sorted(Object.keys(docs.keys))).toEqual(sorted(shownKeys()))
})

test('the palette descriptions are the run and go-to rows', () => {
  const ids = docsPaletteRows(dictionary('en'), useStore.getState()).map((row) => row.id)
  expect(sorted(Object.keys(docs.palette))).toEqual(sorted(ids))
})

test('the link field descriptions are the fields a link carries', () => {
  expect(sorted(Object.keys(docs.linkFields))).toEqual(sorted(LINK_FIELDS))
  // The list itself: the preview's fields, then the language a link may name.
  expect(LINK_FIELDS).toEqual([...VIEW_KEYS, 'lang'])
})

test('the env descriptions are the variables the CLI reads', () => {
  expect(sorted(Object.keys(docs.env))).toEqual(sorted(ENV_VARS.map((v) => v.name)))
})

// The knob table's descriptions are the lab's knob help: one per row, in both languages, translated.
test('every knob row has the lab\u2019s help, in both languages', () => {
  for (const row of KNOB_ROWS) {
    const en = knobHelp(dictionary('en'), row)
    const pl = knobHelp(dictionary('pl'), row)
    expect(en, row.flag).not.toBe('')
    expect(pl, row.flag).not.toBe('')
    expect(pl, row.flag).not.toBe(en)
  }
})
