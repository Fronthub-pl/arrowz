// The straightness a board needs to close, and the rule that enforces it.
//
// Round 14 (2026-09-12): 485 runs with restarts off over 100 settings, on
// square boards from 300 to 1000 a side. Two findings drove the rule. The
// floor rises with the board on its own — 0.6 closes 500x500 but not
// 600x600, 0.65 closes 700 but not 800, and 1000 needs 0.8. And the two
// winding knobs move that floor both ways: closing off nooks below its
// default, or the coiling penalty above its, makes a board behave as if it
// were larger, while a high nook rule or a low coiling penalty makes it
// behave smaller. Neither knob jams a board on its own at any setting.
//
// The table below is the campaign, cell by cell: side, straightness, nook
// rule, coiling penalty, boards closed, boards run.
import { assert, assertEquals } from '@std/assert'
import { defaultParams, formatViolation, straightFloor, validateParams } from './engine.ts'
import type { Params } from './types.ts'

const withDefaults = (over: Partial<Params>): Params => ({ ...defaultParams(), ...over })
/** Whether the envelope refuses this setting because of the straightness floor. */
const refused = (p: Params): boolean => validateParams(p).some((v) => v.kind === 'rule' && v.key === 'straightFloor')

type Cell = readonly [side: number, pStraight: number, warns: number, anticoil: number, closed: number, runs: number]
const CAMPAIGN: readonly Cell[] = [
  [300, 0.65, 2, 6, 5, 5],
  [400, 0.65, 2, 6, 5, 5],
  [450, 0.65, 2, 6, 5, 5],
  [500, 0.6, 2, 6, 0, 5],
  [500, 0.6, 4, 6, 15, 15],
  [500, 0.6, 4, 10, 3, 5],
  [500, 0.65, 2, 6, 1, 9],
  [500, 0.65, 2, 10, 0, 4],
  [500, 0.65, 3, 6, 4, 4],
  [500, 0.65, 3, 10, 6, 7],
  [500, 0.65, 4, 6, 9, 9],
  [500, 0.65, 4, 8, 4, 4],
  [500, 0.65, 4, 9, 5, 5],
  [500, 0.65, 4, 10, 9, 9],
  [500, 0.7, 2, 6, 9, 9],
  [500, 0.7, 2, 10, 4, 5],
  [500, 0.7, 3, 6, 4, 4],
  [500, 0.7, 3, 10, 4, 4],
  [500, 0.7, 4, 6, 4, 4],
  [500, 0.7, 4, 8, 4, 4],
  [500, 0.7, 4, 10, 4, 4],
  [500, 0.75, 2, 6, 4, 4],
  [500, 0.75, 2, 10, 4, 4],
  [500, 0.75, 3, 6, 4, 4],
  [500, 0.75, 3, 10, 4, 4],
  [500, 0.75, 4, 6, 4, 4],
  [500, 0.75, 4, 8, 4, 4],
  [500, 0.75, 4, 10, 4, 4],
  [500, 0.8, 2, 6, 4, 4],
  [500, 0.8, 2, 10, 4, 4],
  [500, 0.8, 3, 6, 4, 4],
  [500, 0.8, 3, 10, 4, 4],
  [500, 0.8, 4, 6, 4, 4],
  [500, 0.8, 4, 8, 4, 4],
  [500, 0.8, 4, 10, 4, 4],
  [600, 0.6, 4, 6, 22, 30],
  [600, 0.6, 8, 6, 3, 3],
  [600, 0.65, 2, 6, 0, 9],
  [600, 0.65, 2, 10, 0, 4],
  [600, 0.65, 3, 6, 2, 9],
  [600, 0.65, 3, 10, 0, 4],
  [600, 0.65, 4, 6, 14, 14],
  [600, 0.65, 4, 8, 3, 4],
  [600, 0.65, 4, 9, 4, 5],
  [600, 0.65, 4, 10, 3, 9],
  [600, 0.7, 2, 6, 2, 13],
  [600, 0.7, 2, 10, 0, 4],
  [600, 0.7, 3, 6, 4, 4],
  [600, 0.7, 3, 10, 3, 4],
  [600, 0.7, 4, 6, 4, 4],
  [600, 0.7, 4, 8, 4, 4],
  [600, 0.7, 4, 10, 9, 9],
  [600, 0.75, 2, 6, 9, 9],
  [600, 0.75, 2, 10, 13, 14],
  [600, 0.75, 3, 6, 4, 4],
  [600, 0.75, 3, 10, 4, 4],
  [600, 0.75, 4, 6, 4, 4],
  [600, 0.75, 4, 8, 4, 4],
  [600, 0.75, 4, 10, 4, 4],
  [600, 0.8, 2, 6, 9, 9],
  [600, 0.8, 2, 10, 7, 7],
  [600, 0.8, 3, 6, 4, 4],
  [600, 0.8, 3, 10, 4, 4],
  [600, 0.8, 4, 6, 4, 4],
  [600, 0.8, 4, 8, 4, 4],
  [600, 0.8, 4, 10, 4, 4],
  [600, 0.85, 2, 6, 5, 5],
  [600, 0.85, 3, 6, 5, 5],
  [600, 0.85, 4, 10, 5, 5],
  [700, 0.65, 4, 6, 6, 7],
  [800, 0.65, 2, 6, 0, 3],
  [800, 0.65, 4, 6, 0, 3],
  [800, 0.65, 8, 6, 3, 3],
  [800, 0.7, 4, 6, 3, 3],
  [800, 0.75, 2, 6, 1, 3],
  [800, 0.75, 4, 10, 3, 3],
  [800, 0.8, 2, 6, 2, 3],
  [800, 0.85, 2, 6, 3, 3],
  [1000, 0.65, 4, 6, 0, 3],
  [1000, 0.7, 2, 6, 0, 2],
  [1000, 0.7, 4, 6, 0, 3],
  [1000, 0.7, 5, 6, 1, 3],
  [1000, 0.7, 6, 4, 3, 3],
  [1000, 0.7, 6, 6, 2, 3],
  [1000, 0.7, 8, 2, 3, 3],
  [1000, 0.7, 8, 6, 15, 15],
  [1000, 0.72, 5, 4, 3, 3],
  [1000, 0.75, 2, 6, 0, 3],
  [1000, 0.75, 4, 6, 2, 3],
  [1000, 0.75, 4, 10, 0, 3],
  [1000, 0.8, 2, 6, 2, 3],
  [1000, 0.8, 3, 8, 1, 2],
  [1000, 0.8, 4, 6, 3, 3],
  [1000, 0.8, 4, 8, 15, 15],
  [1000, 0.8, 4, 10, 15, 15],
  [1000, 0.85, 2, 6, 15, 15],
  [1000, 0.85, 3, 6, 3, 3],
  [1000, 0.85, 3, 8, 15, 15],
  [1000, 0.85, 4, 6, 3, 3],
  [1000, 0.85, 4, 10, 3, 3],
]

// The price of a floor that is a step function over three knobs: five settings
// closed every board they were given and are refused anyway. They are listed
// rather than tolerated, so that a change to the floor has to say which of them
// it buys back and which it adds.
//
// It was NINE until 2026-09-19. Four of them stood on three or four runs, and a
// setting that really closes eight boards in ten shows a clean sweep of three
// about half the time — so "always closed" was an artefact of the sample, not a
// property of the setting. Run to fifteen seeds each, all four jammed
// (500/0.65/3/10 on seed 7, 500/0.7/2/10 on seed 5, 600/0.75/2/10 on seed 14,
// 700/0.65/4/6 on seed 7). They are ordinary jams now, and CAMPAIGN carries the
// runs that found them.
//
// The five below survived fifteen seeds each, and every one of them is 1000 a
// side — the opposite of where the thin grid was suspected to be.
const CONSERVATIVE = new Set([
  '1000/0.7/8/6',
  '1000/0.8/4/8',
  '1000/0.8/4/10',
  '1000/0.85/2/6',
  '1000/0.85/3/8',
])
const cellKey = (c: Cell): string => `${c[0]}/${c[1]}/${c[2]}/${c[3]}`
const paramsOf = (c: Cell): Params => withDefaults({ W: c[0], H: c[0], pStraight: c[1], warns: c[2], anticoil: c[3] })

Deno.test('straightFloor: every setting that jammed a board is refused', () => {
  let jamming = 0
  for (const c of CAMPAIGN) {
    if (c[4] === c[5]) continue
    jamming++
    assert(refused(paramsOf(c)), `${cellKey(c)} closed ${c[4]}/${c[5]} and the envelope still allows it`)
  }
  assert(jamming >= 25, `${jamming} settings jammed at least once`)
})

Deno.test('straightFloor: every setting that always closed is allowed, bar the nine it costs', () => {
  for (const c of CAMPAIGN) {
    if (c[4] !== c[5]) continue
    const conservative = CONSERVATIVE.has(cellKey(c))
    assertEquals(refused(paramsOf(c)), conservative, `${cellKey(c)} closed ${c[4]}/${c[5]}`)
  }
  // Every name in the list is a real cell, so the list cannot rot quietly.
  const keys = new Set(CAMPAIGN.map(cellKey))
  for (const k of CONSERVATIVE) assert(keys.has(k), `${k} is not a measured setting`)
})

Deno.test('straightFloor: the floor a board of each size needs at the default winding', () => {
  const table: readonly [side: number, floor: number][] = [
    [4, 0.6],
    [400, 0.6],
    [500, 0.6],
    [600, 0.65],
    [700, 0.7],
    [800, 0.7],
    [900, 0.75],
    [1000, 0.8],
  ]
  for (const [side, floor] of table) {
    assertEquals(straightFloor(withDefaults({ W: side, H: side })), floor, `${side}`)
  }
})

// Round 15 (2026-09-13): the same walk on RECTANGLES, three seeds a point,
// restarts off, by scripts/measure-straight-floor-shape.ts. Round 14 measured
// squares only, where the longer side, the shorter side and the equivalent
// square are one number, so it could not tell them apart -- and the rule it
// produced read the longer side, on the strength of a README line about tall
// boards being harder. That line is about the PLAYER. These shapes are about
// the carver, and they say the floor is the equivalent square's.
//
// W, H, and the lowest straightness at which all three seeds closed.
const SHAPES: readonly (readonly [W: number, H: number, measured: number])[] = [
  [4, 1000, 0.6],
  [100, 1000, 0.6],
  [250, 1000, 0.6],
  [350, 1000, 0.6],
  [480, 1000, 0.65],
  [490, 1000, 0.7],
  [810, 1000, 0.75],
  [500, 500, 0.6],
  [700, 700, 0.65],
  [900, 900, 0.75],
  [1000, 1000, 0.8],
]

Deno.test('straightFloor: on a rectangle the floor is the equivalent square, both ways', () => {
  for (const [W, H, measured] of SHAPES) {
    const floor = straightFloor(withDefaults({ W, H }))
    // Never under what the shape needed: that is a jam the envelope allows.
    assert(floor >= measured - 1e-9, `${W}x${H} needed ${measured} and the rule asks only ${floor}`)
    // Never more than one step over it: that is a legal board refused, which
    // is what the longer side did to every rectangle on the list.
    assert(floor <= measured + 0.05 + 1e-9, `${W}x${H} closed at ${measured} and the rule asks ${floor}`)
  }
  // 480x1000 is the sharpest of them: its equivalent square is 692.8, just
  // under the step at 700, so the rule grants it 0.65 -- and 0.65 is exactly
  // where it closed, with 0.6 failing on all three seeds. A rectangle just
  // below a step is where a jam would have hidden, and none does.
  assertEquals(straightFloor(withDefaults({ W: 480, H: 1000 })), 0.65)
  // Equal area, different shape: the pair the campaign turned on.
  assertEquals(straightFloor(withDefaults({ W: 490, H: 1000 })), straightFloor(withDefaults({ W: 700, H: 700 })))
  // What the old rule did: a strip of four thousand cells was asked for the
  // straightness of a million.
  assertEquals(straightFloor(withDefaults({ W: 4, H: 1000 })), 0.6)
  assertEquals(straightFloor(withDefaults({ W: 1000, H: 1000 })), 0.8)
})

Deno.test('straightFloor: the nook rule and the coiling penalty move the floor both ways', () => {
  const at = (warns: number, anticoil: number) => straightFloor(withDefaults({ W: 1000, H: 1000, warns, anticoil }))
  assertEquals(at(4, 6), 0.8, 'the defaults are the reference')
  assert(at(2, 6) > at(4, 6), 'a nook rule of 2 makes the board behave larger')
  assert(at(3, 6) > at(4, 6), 'and so does 3')
  assert(at(4, 8) > at(4, 6), 'a coiling penalty above 6 makes the board behave larger')
  assert(at(8, 6) < at(4, 6), 'a high nook rule makes it behave smaller')
  assert(at(4, 4) < at(4, 6), 'and so does a low coiling penalty')
  // The floor never leaves the knob's own range.
  assertEquals(at(2, 10), 1)
  assertEquals(straightFloor(withDefaults({ W: 25, H: 50, warns: 16, anticoil: 1 })), 0.6)
})

Deno.test('straightFloor: the violation names the three knobs and the number this board needs', () => {
  const p = withDefaults({ W: 1000, H: 1000, pStraight: 0.7 })
  const v = validateParams(p).find((x) => x.kind === 'rule' && x.key === 'straightFloor')
  assert(v && v.kind === 'rule', 'the rule fires')
  assertEquals(v.keys, ['pStraight', 'warns', 'anticoil'])
  assertEquals(v.need, 0.8)
  const text = formatViolation(v)
  assert(text.includes('0.8'), text)
})

Deno.test('straightFloor: the defaults and every small board are untouched', () => {
  assertEquals(validateParams(defaultParams()), [])
  for (const side of [4, 25, 100, 400, 500]) {
    const p = withDefaults({ W: side, H: side, pStraight: 0.6 })
    assertEquals(refused(p), false, `${side} at the straightness minimum`)
  }
})
