# @fronthub/arrowz-engine

## 0.1.0

### Minor Changes

- [#200](https://github.com/Fronthub-pl/arrowz/pull/200) [`bdebf88`](https://github.com/Fronthub-pl/arrowz/commit/bdebf889a3dc1c2dd3d536c569b94651fef481d1) Thanks [@tomashpl](https://github.com/tomashpl)! - First release on npm: the Arrowz board generator with its parameters and safe limits, the board file, the game rules and the SVG export, under the entry points `.`, `./command` and `./simple`. The commands it prints start with `arrowz carve` (`COMMAND_PREFIX`). It also reads commands written as `deno task carve`: `COMMAND_PREFIXES` lists both spellings and `commandPrefixOf` tells which one a command starts with.
