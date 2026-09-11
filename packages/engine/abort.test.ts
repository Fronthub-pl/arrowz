// Two promises the CLI's time budget rests on: a `trace` callback may stop a
// run by throwing GenerateAbort, and the callback is called at least once a
// second even while the piece count circles one value in a thrash.
import { assert, assertEquals, assertThrows } from '@std/assert'
import { defaultParams, generate, GenerateAbort } from './engine.ts'
import type { GenerateOptions } from './types.ts'

// A thrash inside a single attempt: a third of the cells are voids, nothing
// absorbs the crumbs, and the undo budget keeps the carver busy for seconds
// without ever closing. Outside the envelope on purpose, hence `unchecked`.
const THRASH = {
  ...defaultParams(),
  W: 100,
  H: 100,
  seed: 1,
  absorbLimit: 0,
  restarts: 2,
  maxBack: 1000,
}
/** The voids of the thrash live in the options now, beside the escape hatch. */
const THRASH_OPTS: GenerateOptions = { unchecked: true, voidFrac: 0.3 }

Deno.test('generate: a GenerateAbort thrown from trace ends the run, keeps the partial board and skips the restarts', () => {
  let calls = 0
  const r = generate(THRASH, {
    ...THRASH_OPTS,
    trace: () => {
      calls++
      throw new GenerateAbort('time budget exhausted')
    },
  })
  assertEquals(calls, 1, 'the run stops at the first throw')
  assertEquals(r.ok, false)
  assertEquals(r.aborted, true)
  assertEquals(r.restartsUsed, 0, 'an aborted attempt is not restarted')
  assert(r.board.pieces.length > 0, 'the board carved so far is returned')
  assert(r.stuck, 'an aborted run reports its leftover like a jam')
  assert(r.stuck.remaining > 0)
  assertEquals(r.stuck.remaining, r.board.remaining)
  assert(r.stuck.sizes.length > 0, 'the leftover is measured at the abort, not left empty')
})

Deno.test('generate: a jam that is not aborted reports aborted false', () => {
  const r = generate({ ...defaultParams(), W: 12, H: 12, seed: 1, absorbLimit: 0, restarts: 0 }, {
    unchecked: true,
    voidFrac: 0.5,
  })
  assertEquals(r.ok, false)
  assertEquals(r.aborted, false)
})

Deno.test('generate: any other error thrown from trace propagates', () => {
  assertThrows(
    () =>
      generate(THRASH, {
        ...THRASH_OPTS,
        trace: () => {
          throw new Error('not an abort')
        },
      }),
    Error,
    'not an abort',
  )
})

Deno.test('run: the trace fires at least once a second during a thrash', () => {
  // With the trace tied to multiples of 500 pieces only, a thrash that circles
  // one piece count for seconds never reports, and a budget that aborts from
  // the callback never gets its turn.
  const at: number[] = []
  const t0 = performance.now()
  const r = generate({ ...THRASH, restarts: 0 }, { ...THRASH_OPTS, trace: () => at.push(performance.now() - t0) })
  assertEquals(r.ok, false, 'the fixture must thrash, not close')
  assert(r.genMs > 1500, `the fixture must run over a second, ran ${r.genMs.toFixed(0)} ms`)
  assert(at.length >= 1, `no trace in ${r.genMs.toFixed(0)} ms`)
  let prev = 0
  for (const t of [...at, r.genMs]) {
    assert(t - prev < 2000, `silence of ${(t - prev).toFixed(0)} ms between traces`)
    prev = t
  }
})
