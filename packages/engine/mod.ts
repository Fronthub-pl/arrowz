// Public surface of @arrowz/engine: the generator, its parameter table and
// the board types. The command parser, the simple view, the presets and
// the dictionaries are separate subpath exports (see deno.json).
//
// The list is explicit rather than a star: `Carver`, `mulberry32` and
// `render` stay internal, because only this workspace's own tests and the
// report task build a carver by hand.
export {
  analyse,
  defaultParams,
  DIRS,
  fingerprint,
  formatViolation,
  generate,
  GenerateAbort,
  INACTIVE_REASONS,
  InvalidParamsError,
  PARAM_SPEC,
  RULE_REASONS,
  RULES,
  toSvg,
  validateParams,
} from './engine.ts'
// The recommended entry point for an application: a board from the CLI's
// vocabulary. The lab keeps using simpleParams through @arrowz/engine/simple.
export { presetParams } from './lab-simple.ts'
export { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED, pieceShape, voidStrips } from './geometry.ts'
export type { Dir, PieceShape, ShapeOptions } from './geometry.ts'
export { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard } from './board-file.ts'
export { goneIds, loadSession, newSession, play, saveSession } from './game.ts'
export type { Move, Session, SessionSnapshot } from './game.ts'
export type * from './types.ts'
