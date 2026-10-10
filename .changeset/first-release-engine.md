---
'@fronthub/arrowz-engine': minor
---

First release on npm: the Arrowz board generator with its parameters and safe limits, the board file, the game rules and the SVG export, under the entry points `.`, `./command` and `./simple`. The commands it prints start with `arrowz carve` (`COMMAND_PREFIX`). It also reads commands written as `deno task carve`: `COMMAND_PREFIXES` lists both spellings and `commandPrefixOf` tells which one a command starts with.
