// engine.ts must expose exactly what engine.d.ts promised to the other streams.
import * as engine from './engine.ts'
import type * as Contract from './engine.d.ts'

Deno.test('engine.ts satisfies engine.d.ts', () => {
  const asContract: typeof Contract = engine
  void asContract
})
