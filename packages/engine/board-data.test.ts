// The board element and the game read only W, H, owner and pieces. A board
// that went through a file has nothing else, so every reader must take it.
import { assertEquals } from '@std/assert'
import { analyse, defaultParams, fingerprint, generate, render, toSvg } from './engine.ts'
import { loadSession, newSession, saveSession } from './game.ts'
import { voidStrips } from './geometry.ts'
import type { BoardData } from './types.ts'

Deno.test('every reader of a board takes the four fields of BoardData and nothing more', () => {
  const full = generate({ ...defaultParams(), W: 25, H: 50, seed: 7 }).board
  const data: BoardData = { W: full.W, H: full.H, owner: full.owner, pieces: full.pieces }
  assertEquals(fingerprint(data), fingerprint(full))
  assertEquals(toSvg(data), toSvg(full))
  assertEquals(render(data), render(full))
  assertEquals(analyse(data).N, analyse(full).N)
  assertEquals(voidStrips(data), voidStrips(full))
  const session = newSession(data)
  assertEquals(loadSession(data, saveSession(session, false)).left, session.left)
})
