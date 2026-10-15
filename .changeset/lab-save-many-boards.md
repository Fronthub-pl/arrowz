---
'@fronthub/arrowz-engine': patch
---

The worker protocol carries one seed of a batch of saves: `WorkerIn` gains `{ type: 'fill' }`, answered by `WorkerOut`'s `{ type: 'fillDone' }` with the seed's `SeedRun` and, when the board is complete, its board file. The lab dictionary has the words of Save many boards in English and Polish, and `PaletteId` its command palette row, `run-fill-library`.
