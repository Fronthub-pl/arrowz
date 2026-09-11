// Public surface of @arrowz/engine: the generator, its parameter table and
// the board types. The command parser, the simple view, the presets and
// the dictionaries are separate subpath exports (see deno.json).
export * from './engine.ts'
export { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED, pieceShape, voidStrips } from './geometry.ts'
export type { Dir, PieceShape, ShapeOptions } from './geometry.ts'
export { goneIds, loadSession, newSession, play, saveSession } from './game.ts'
export type { Move, Session, SessionSnapshot } from './game.ts'
export type * from './types.ts'
