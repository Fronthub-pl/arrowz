// The other half of the documentation guard. Its twin in the engine
// (lab-docs.test.ts) reads the element's declarations and answers "is anything
// public undocumented?"; this one asks the runtime class "does everything
// documented actually exist?" — the question a text parser cannot answer.
//
// Importing the module registers the element, and registration is what makes
// Lit finalise the class, so the accessors are on the prototype from the import
// on. No instance is needed (measured: the name list is identical before and
// after createElement).
import type { PropertyDeclaration } from 'lit'
import { expect, test } from 'vitest'
import { ELEMENT_MEMBERS, ELEMENT_PROPS } from '@arrowz/engine/docs'
import { ArrowzBoard } from './mod.ts'

// `lit` is a dependency of this package, so the declaration type is available
// and no cast through `unknown` is needed. The lab could not have done this.
const declared: Record<string, PropertyDeclaration | undefined> = ArrowzBoard.properties

test('every documented property is declared on the element', () => {
  for (const row of ELEMENT_PROPS) {
    expect(declared[row.key], `property ${row.key}`).toBeDefined()
  }
})

// Per key, and not per set. Comparing the two SETS of attribute names passes a
// table that swaps `show-points` and `point-color` between two rows: the set is
// unchanged while the mapping lies. The spec's own second review measured that
// (§10, round two, item 3), which is the reason this test reads the declaration
// rather than only the observed list.
test('every documented attribute is the one its property declares', () => {
  for (const row of ELEMENT_PROPS) {
    const decl = declared[row.key]
    expect(decl, `property ${row.key}`).toBeDefined()
    // Lit's rule: `false` means no attribute, a string names it, and anything
    // else (a bare `true`, or nothing at all) takes the lower-cased key.
    const attr = decl?.attribute
    const actual = attr === false ? null : typeof attr === 'string' ? attr : row.key.toLowerCase()
    expect(actual, `attribute of ${row.key}`).toBe(row.attribute)
  }
})

// The second, weaker net, and a case of its own rather than a tail of the loop
// above: a loop stops at the first row it dislikes, so one wrong mapping used to
// leave this comparison unreached. It answers the other direction — an attribute
// the element answers to and the page never mentions.
test('the element observes exactly the documented attributes', () => {
  const observed = [...ArrowzBoard.observedAttributes].sort()
  const documented = ELEMENT_PROPS.map((row) => row.attribute).filter((a) => a !== null).sort()
  expect(observed, 'observedAttributes against the documented attributes').toEqual(documented)
})

test('every documented method and getter is on the element prototype', () => {
  const own = new Set(Object.getOwnPropertyNames(ArrowzBoard.prototype))
  for (const row of ELEMENT_MEMBERS) {
    expect(own.has(row.key), `member ${row.key}`).toBe(true)
  }
})

// Where this file stops. Both loops walk the documentation, so a row DELETED
// from the tables is invisible here — measured: dropping `view`, which has no
// attribute, leaves all three tests green. That direction belongs to the engine
// test of Task 2, which walks the element's declarations instead. Rows with an
// attribute are caught anyway, by the `observedAttributes` comparison above.
