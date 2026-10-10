# The board file and the layout hash

A board travels as a `.board.json` file: the CLI writes it, the store keeps
it, the lab downloads and opens it, and a game decodes it before the board
element draws it. The file is a small JSON header a person can read, around
a packed `body` that only `decodeBoard` reads. The code is
`packages/engine/board-file.ts`; the exported names and their signatures are
in [the engine's README](../packages/engine/README.md#arrowzengine).

A board in a file has two identities. The `fingerprint` names one exact
board, arrow ids and order included. The layout hash, `sha256-<64 hex>`,
names the arrangement of arrows, whatever seed and settings made it, and it
is the board's file name in the store.

## An example

The 6×6 board of seed 1 (`arrowz carve --width=6 --height=6 --seed=1`),
148 bytes on disk, shown indented here:

```json
{
  "format": "arrowz-board",
  "v": 1,
  "W": 6,
  "H": 6,
  "pieces": 6,
  "voids": 0,
  "unfilled": 0,
  "fingerprint": "39aff76f",
  "body": "Ah4/AgwXAhoaAhsSAggTAgoIVQHwH8MbmQsA"
}
```

Its layout hash is
`sha256-45bb9696f7c75119a10a98a94fb24909bbaa77d488be20d72f3ea903ce45f731`,
the `id` that `--dry-run` prints. A 1000×1000 board file is about a megabyte.

## The header

| Field | Meaning |
|---|---|
| `format` | Always `'arrowz-board'` (`BOARD_FORMAT`): what tells a board file from any other JSON. |
| `v` | The format version, `1` (`BOARD_FILE_VERSION`). See [Versions](#versions). |
| `W`, `H` | Width and height in cells, each within the generator's own range for the side (`PARAM_SPEC`, 4 to 1000). |
| `pieces` | How many arrows the board holds. |
| `voids` | How many cells are holes left on purpose, what the code calls voids (`-2` in `owner`). Only test and measurement boards have them, through `generate`'s `voidFrac`. |
| `unfilled` | How many cells no arrow filled (`-1` in `owner`); `0` on a complete board. |
| `fingerprint` | The board's `fingerprint()`, checked last when the file is read. |
| `body` | The arrows and the holes, packed, in standard base64 with padding. |

The counts let a reader list or sort boards without decoding the body.

## The body

The body follows the decoded board, `BoardData` (`types.ts`): `W`, `H`, an
`owner` grid with the arrow id of each cell, and `pieces`, the arrows. An
arrow has an `id`, its `cells` from head (`cells[0]`) to tail, and `dir`,
the index in `DIRS` of the way its head points: 0 up, 1 right, 2 down,
3 left. A cell index is `y * W + x`.

Numbers are unsigned LEB128 varints. Three sections follow one another:

1. **Arrows**, in the order of `board.pieces`. Per arrow: the zigzag-encoded
   difference between its id and the previous arrow's (the first arrow's
   previous id is -1, so ids numbered from 0 cost one byte each), its head
   cell index, and `length * 4 + dir`.
2. **Steps**, one bit stream for every arrow in turn. The step from
   `cells[i]` to `cells[i + 1]` is its index in `DIRS`, two bits, low bits
   first; the last byte is padded with zero bits.
3. **Holes**: their count, then their cell indices in ascending order as
   differences, the first one from 0.

Every other cell without an arrow is unfilled. In the example the body
starts with `02 1e 3f`: id 0 (a difference of 1 from -1, zigzag-encoded as
2), head cell 30 (x 0, y 5), and 15 cells pointing left (15 · 4 + 3 = 63).
The step stream starts with `55`: four steps right.

The codec carries its own base64 and needs no platform API; `layoutHash`
uses Web Crypto, which Deno, Node and a browser worker all have.

## Reading a file

`decodeBoard(file)` takes any parsed JSON and returns the board exactly as
it was written: ids, the order of the arrows and the order of cells within
each arrow are kept. Ids matter beyond drawing: a saved game names the
removed arrows by id. `decodeBoardFile` returns the same board and the very
object it was given, typed as a `BoardFile`.

It never guesses. It throws `BoardFileError`, with the reason in the
message, when:

- `format` or `v` is not the expected value, a field is missing or of the
  wrong type, or `W` or `H` is outside its range;
- the header counts more arrows than the board has cells;
- the base64 is malformed, the body ends early, has bytes left over, or
  holds a number longer than five bytes;
- an id is negative, repeats, or is not below the number of cells;
- a head or a step leaves the board, an arrow runs into a cell that is
  already taken, by another arrow or by itself, or an arrow has no cells or
  more cells than the board;
- the step stream is not padded with zero bits;
- a hole is listed twice, lies outside the board, or holds an arrow;
- the header's `voids` or `unfilled` disagree with the body;
- the rebuilt board's `fingerprint` differs from the header.

`encodeBoard` checks one thing only, that every arrow is a path of
neighbouring cells, and throws `BoardFileError` when one is not. Overlaps
are ruled out earlier, by the generator or by `decodeBoard`.

## Versions

This engine writes and reads version 1 only. A file with any other `v` is
refused with a message naming both versions. A change to the header's
meaning or to the body's packing needs a new `v`.

Header keys a reader does not know are ignored. They do not survive into
the store: the store server decodes a posted board and stores it as
`encodeBoard` writes it, and the lab re-encodes a file it opens.

The layout hash is worked out from the decoded board, never from the file's
bytes, so a new file version leaves every board's name as it was.

## The fingerprint

`fingerprint(board)` (`engine.ts`) is a 32-bit FNV-1a, in hex, over the
`owner` grid and, per arrow in order, its `dir` and its cell indices. Any
change in which cell belongs to which arrow, or in the order of the arrows
or of their cells, changes it. It is the "same seed, same board" guarantee:
the tests freeze reference boards with it, `--dry-run` prints it, a file
carries it, and a saved game (`SessionSnapshot`) refuses a board whose
fingerprint is not the one it was played on.

Because it sees ids and order, the same arrows numbered differently get
another fingerprint. The example board with its arrows reversed and
renumbered from 100 has the fingerprint `7fedd375`, and the same layout hash.

## The layout hash

`layoutHash(board)` returns `sha256-` and the 64 lowercase hex digits of
SHA-256 over a canonical form of the board. It is asynchronous because Web
Crypto's digest is. The canonical bytes, in order:

1. the ASCII tag `arrowz-layout/1`, with no terminator;
2. varints `W`, `H` and the number of arrows;
3. per arrow, **in ascending order of its head cell index**: varint head
   index, varint `length * 4 + dir`, then its steps as 2-bit `DIRS`
   indices, low bits first, padded with zero bits to a whole byte per arrow;
4. varint count of holes, then each hole's cell index in ascending order,
   as an absolute varint.

What the form leaves out, and why:

- **Arrow ids and the order the generator made the arrows in.** These are
  what makes two runs of the same arrangement differ, so they are what
  makes the fingerprint unfit as a name. Sorting by head cell needs no tie
  rule: a cell belongs to at most one arrow, so no two heads share an index.
- **Unfilled cells.** They are every cell no arrow and no hole holds.

What it keeps: the order of cells within an arrow, because that draws the
shape, and `dir`, because the format accepts any `dir` and the board element
draws it, so two files that differ only there are two drawings. The
identity is exact: a rotated or mirrored board is another layout.

The form differs from the body on purpose. The body is packed for size; the
form only has to be unambiguous, so each arrow is padded to whole bytes and
holes are absolute indices.

The result: two recipes (a seed and settings) that make the same arrows get
the same name, and `fingerprint` still tells their files apart. A new
canonical form would get a new tag, and with it a new name for every stored
board.

## Names in the store

The store (`packages/cli/store.ts`) keeps each layout in a directory per
size, `packages/cli/boards/<W>x<H>/`, or under `ARROWZ_BOARDS_DIR` when it
is set:

| File | Content |
|---|---|
| `sha256-<hex>.board.json` | The board file. |
| `sha256-<hex>.json` | The meta (`BoardMeta`): `id` is the layout hash, and `sources` lists every recipe that made this layout. |
| `sha256-<hex>.svg` | The preview, only when the latest save asked for one. |

- **The store works the name out itself.** `saveBoard` decodes the board and
  hashes it; no caller's name is taken, and nothing a caller sends reaches a
  path.
- **One layout, one set of files.** Saving a layout already stored adds a
  recipe to its meta, or replaces the recipe with the same settings (keyed by
  `boardId(params)`). "Has this board been made before?" is "is its file
  there?", and `carve --count=N` counts only new layouts.
- **The board file is written once.** A later recipe of the same layout may
  number its arrows differently, so its file would have another
  fingerprint. The store keeps the first file, so a name keeps one byte
  sequence and one fingerprint, and a saved game stays valid. The meta's
  `fingerprint` and `boardBytes` describe that file. A board file the lab
  downloads under the same name holds the same layout, and may number its
  arrows differently.
- **Only layout-hash names count.** `listBoards` lists a layout only when
  both its `.json` and `.board.json` are there and the name matches
  `^sha256-[0-9a-f]{64}$`; `deleteBoard` refuses any other name and removes
  all three files.

The store server (`deno task store`) serves the files under
`/store/<W>x<H>/<name>` and takes saves through `POST /api/boards`. The
lab names the board-file download of a run or a stored board
`sha256-<hex>.board.json`, while an opened file keeps its own name. When it
opens a board file with a meta beside it, it refuses the pair unless the
meta's `id` is the board's layout hash. The everyday view of the store is in
[the command line's README](../packages/cli/README.md#where-boards-are-saved).
