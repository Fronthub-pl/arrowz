---
'@fronthub/arrowz-board': patch
'@fronthub/arrowz-engine': patch
---

`<arrowz-board>` announces the piece under a mouse or pen as `piece-hover`, with `detail: { pieceId }`, only when that piece changes. `pieceId` is `null` over the background, when the pointer leaves the board, when a pan starts and when the board changes, and touch never fires it. The `PieceHoverEvent` type is exported. The engine's lab dictionary gains the readout's words, and its Docs tables the new event and type.
