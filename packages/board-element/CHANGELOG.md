# @fronthub/arrowz-board

## 0.2.0

### Minor Changes

- [#241](https://github.com/Fronthub-pl/arrowz/pull/241) [`abc9fbe`](https://github.com/Fronthub-pl/arrowz/commit/abc9fbe9bc9ea3a82a7a53f8b611f0b63d376e01) Thanks [@tomashpl](https://github.com/tomashpl)! - Arrows are drawn with square corners and a square tail by default.
  
  - `DEFAULT_ROUNDED` and `DEFAULT_VIEW.rounded` are `false`, and the board element's default view is square.
  - The command line takes `--rounded` to round them, and `<arrowz-board>` takes `view.rounded = true`.
  - `--sharp` is refused: drop it from a command, since square is the default.
  - Boards stored before `rounded` existed still open rounded.
  - The engine's command entry point exports `storedView`, which fills a stored view the way the store reads it.

### Patch Changes

- Updated dependencies [[`abc9fbe`](https://github.com/Fronthub-pl/arrowz/commit/abc9fbe9bc9ea3a82a7a53f8b611f0b63d376e01)]:
  - @fronthub/arrowz-engine@0.2.0

## 0.1.0

### Minor Changes

- [#200](https://github.com/Fronthub-pl/arrowz/pull/200) [`bdebf88`](https://github.com/Fronthub-pl/arrowz/commit/bdebf889a3dc1c2dd3d536c569b94651fef481d1) Thanks [@tomashpl](https://github.com/tomashpl)! - First release on npm: `<arrowz-board>`, a web component that draws an Arrowz board on the GPU and plays it.

### Patch Changes

- Updated dependencies [[`bdebf88`](https://github.com/Fronthub-pl/arrowz/commit/bdebf889a3dc1c2dd3d536c569b94651fef481d1)]:
  - @fronthub/arrowz-engine@0.1.0
