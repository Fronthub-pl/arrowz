// Public surface of @arrowz/engine: the generator, its parameter table and
// the board types. The command parser, the simple view, the presets, the
// dictionaries and the run report are separate subpath exports (see deno.json).
//
// The list is explicit rather than a star: `Carver`, `mulberry32` and
// `render` stay internal, because only this workspace's own tests and the
// report task build a carver by hand.
export {
  analyse,
  clampParam,
  defaultParams,
  DIRS,
  fingerprint,
  formatViolation,
  generate,
  GenerateAbort,
  giantStraightFloor,
  INACTIVE_REASONS,
  InvalidParamsError,
  isFiniteNumber,
  longestSummary,
  PARAM_SPEC,
  readParams,
  RULE_REASONS,
  RULES,
  snapToStep,
  stepsAround,
  straightFloor,
  toSvg,
  validateParams,
} from './engine.ts'
// The recommended entry point for an application: a board from the CLI's
// vocabulary. The lab keeps using simpleParams through @arrowz/engine/simple.
export { presetParams } from './lab-simple.ts'
export { DEFAULT_HEAD_HEIGHT, DEFAULT_ROUNDED, pieceShape, voidStrips } from './geometry.ts'
// The diagnostic palette, published for the same reason the shapes are: the
// board element draws from it, and a consumer colours a legend with it.
export { hueBytes, hueDegrees, hueOf } from './colors.ts'
// The palette assignment, for the same reason: the SVG export and the board
// element colour a piece from one assignment.
export { assignPalette } from './palette.ts'
// The look, for the same reason: the SVG export, the CLI and the element read one set of themes and bounds.
export {
  DEFAULT_COLOURS,
  DEFAULT_PAD,
  DEFAULT_POINT_COLOR,
  DEFAULT_POINT_RADIUS,
  DEFAULT_SHOW_POINTS,
  isHexColour,
  PAD_RANGE,
  PALETTE_CAP,
  POINT_RADIUS_RANGE,
  resolveColours,
  themeOf,
  THEMES,
} from './look.ts'
export type { BoardColours, BoardTheme } from './look.ts'
export type { Dir, PieceShape, ShapeOptions } from './geometry.ts'
export { BOARD_FILE_VERSION, BOARD_FORMAT, BoardFileError, decodeBoard, encodeBoard, layoutHash } from './board-file.ts'
export { goneIds, loadSession, newSession, play, saveSession } from './game.ts'
export type { Move, Session, SessionSnapshot } from './game.ts'
export type * from './types.ts'
