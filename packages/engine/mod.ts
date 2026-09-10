// Public surface of @arrowz/engine: the generator, its parameter table and
// the board types. The command parser, the simple view, the presets and
// the dictionaries are separate subpath exports (see deno.json).
export * from './engine.ts'
export { pieceShape, voidStrips } from './geometry.ts'
export type { Dir, PieceShape, ShapeOptions } from './geometry.ts'
export { newSession, play } from './game.ts'
export type { Move, Session } from './game.ts'
export type * from './types.ts'
