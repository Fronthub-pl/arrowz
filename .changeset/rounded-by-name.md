---
'@fronthub/arrowz-engine': minor
'@fronthub/arrowz-board': minor
'@fronthub/arrowz-cli': minor
---

Arrows are drawn with square corners and a square tail by default.

- `DEFAULT_ROUNDED` and `DEFAULT_VIEW.rounded` are `false`, and the board element's default view is square.
- The command line takes `--rounded` to round them, and `<arrowz-board>` takes `view.rounded = true`.
- `--sharp` is refused: drop it from a command, since square is the default.
- Boards stored before `rounded` existed still open rounded.
- The engine's command entry point exports `storedView`, which fills a stored view the way the store reads it.
