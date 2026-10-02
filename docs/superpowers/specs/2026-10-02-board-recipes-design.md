# Board recipes: say when a layout was already stored, and show its recipes

A stored board is a layout, named by its hash; the ways of producing it are
recipes, kept in `BoardMeta.sources`. The store already merges a run that
lands on a known layout into that layout's meta, and the CLI says so. The lab
says nothing: after such a run its status line reads "saved" as for a new
board, the library gains no row, the open board's column shows only the
latest recipe, and Delete removes every recipe without saying how many.
This spec closes those three gaps. Checked against `main` at `9b48343`.

One branch, `lab/board-recipes`, base `main`. Bead `arrowz-200`.

## Goal

After a run, the lab says whether the board was new to the library or a
layout it already had. A board with more than one recipe lists them in its
column, each with its own command and a way to load it. Deleting such a board
says how many recipes go with it.

## How the store behaves today

- `saveBoard` (`packages/cli/store.ts`) names the layout from the decoded
  board (`layoutHash`), never from the caller. Two parameter sets that produce
  the same layout write to the same `<WxH>/<sha256>.json`.
- A recipe's id is `boardId(params)`: the seed and a hash of every
  `PARAM_SPEC` key. A save whose id is already in `sources` replaces that
  recipe (keeping its `createdAt`); any other save appends one.
- The board file is written once, by the first save of the layout, so its
  fingerprint does not move.
- The meta's top-level recipe fields (`seed`, `params`, `view`, `command`,
  `source`, `genMs`, `restarts`, `backtracks`, `aborted`) copy the recipe of
  the latest save.
- `saveBoard` returns `layoutExisted` and `recipeExisted`; `carve --save`
  prints "layout already stored, recipe added|updated". `POST /api/boards`
  answers with the meta alone, so the lab never learns either flag.
- `deleteBoard` removes `<id>.board.json`, `<id>.json` and `<id>.svg`: the
  layout with every recipe in it. There is no way to remove one recipe.

## Measured before this spec

The repository's store (`packages/cli/boards`) holds 21 layouts, each with
exactly one recipe. A second recipe arises when a layout is produced again
with different parameters. In practice that means the same seed run again
with a different limit (`restarts`, `maxBack`, `stall`, `warns`) that the run
never reached. Two seeds giving one layout is practically impossible except
on very small boards. The commonest case after this spec is therefore "known layout,
same recipe": Generate twice on one seed.

## Decisions

- **The store server reports what the save did.** `POST /api/boards` answers
  `201` with `{ meta, layoutExisted, recipeExisted }` instead of the meta
  alone. The lab's `api/boards.ts` is the response's only reader; the CLI
  calls `saveBoard` directly. No compatibility shim.
- **The run's status line says it.** The store's answer appended to the run's
  live line (`useRunState`, today " — saved" or " — not saved (no store
  server)") becomes one of:
  - new layout: " — saved" (unchanged);
  - known layout, new recipe: " — already in the library; recipe added";
  - known layout, same recipe: " — already in the library; recipe updated".
  The library's live line about an open stored board (`savedBoard`) is not
  touched: it describes a board, not a save.
- **Recipes are listed only when there are two or more.** With one, the list
  would repeat the command the column already shows (`CommandFigure`). The
  list sits after the facts (`.fw-bmeta`) and follows their band rule: shown
  at L and in the XS Board sheet, hidden at S and M, where the column is a
  bar under the board.
- **Each listed recipe can be loaded.** `loadIntoLab` takes
  `Pick<BoardMeta, 'params' | 'view'>` instead of the whole meta, so a
  `Recipe` passes as it is; its two callers (`BoardColumn`, `FileColumn`)
  pass a meta as before. The recipe the top-level fields copy is marked
  "latest"; it is found by `recipe.id === boardId(meta.params)`.
- **Delete says how many recipes it removes.** With two or more recipes the
  armed button reads "Really delete? Its N recipes go too." / "Na pewno
  usunąć? Razem z przepisami (N)." With one, the text is today's.
- **Removing one recipe is out of scope.** It needs a store function that
  recomputes the top-level fields from the remaining recipes, a rule for the
  last recipe, a server route and a lab control, with no stored board to use
  it on today. A deferred bead records it.

## The list

`RecipeList` (`apps/lab/src/library/RecipeList.tsx`), rendered by
`BoardColumn` after the facts when `meta.sources.length >= 2`:

- a heading "Recipes (N)" / "Przepisy (N)";
- one item per recipe in `sources` order (the order they were first saved):
  - seed, source, the last save's date (`updatedAt`, the column's locale) and
    generation time (`genSeconds`, "—" when unknown). `genSeconds` in
    `packages/engine/lab-report.ts` takes `Pick<BoardMeta, 'genMs'>` instead
    of the whole meta: a type narrowing, no value changes;
  - "stopped" / "zatrzymany" when `aborted`;
  - "latest" / "ostatni" on the recipe the top-level fields copy;
  - the recipe's command in a `CommandFigure` (copy included);
  - a "Load into lab" button, calling `loadIntoLab(recipe, control, navigate)`.

Every visible string is in `lab-i18n.ts`, English in code and Polish as the
translation. A series in flight blocks loading exactly as it blocks the
column's own button (`loadIntoLab` returns early).

## Data flow

1. `store-server.ts`: the POST handler sends
   `{ meta, layoutExisted, recipeExisted }` from `saveBoard`'s result.
2. `api/boards.ts`: `SaveOutcome`'s success case becomes
   `{ ok: true; meta: BoardMeta; layoutExisted: boolean; recipeExisted: boolean }`,
   read from that body. `useViewSave`, which reads `outcome.meta`, keeps working.
3. `useRunState`: the appended answer picks its text from the two flags.
4. `BoardColumn`: renders `RecipeList` and passes the recipe count to the
   delete button's armed text. Both read `meta.sources` from the listing the
   lab already holds; nothing new is fetched.

## Testing

Each case is red before its change.

- **Deno, `store-server.test.ts`:** a first POST answers
  `layoutExisted: false, recipeExisted: false`. The same body posted again
  answers `true, true`. A body for the same layout with one limit changed answers
  `true, false`, and the listing then shows two recipes. The existing cases
  read `meta` from the new body.
- **Node, `api/boards.node.test.ts`:** the success outcome carries both flags
  from the body.
- **Browser, `useRunState` / `RunStatusBar`:** the three answers, in English
  and Polish; "not saved" unchanged.
- **Browser, `BoardColumn`:**
  - no list with one recipe; a list of two with two;
  - "latest" on the right recipe;
  - "Load into lab" on the other recipe sets that recipe's knobs (a fixture of
    two recipes differing in `restarts`) and goes to the lab;
  - the armed Delete names the count with two recipes and is today's text
    with one.
- **Layout:** `LayoutInvariants` through the full gate, since the column
  gains a section. The fixture boards used there have one recipe, so the
  list's own geometry is checked by one case at 1440×900 and in the XS sheet
  with a two-recipe fixture: no horizontal overflow of the column.
- **Live check:** the lab on a store in `/tmp` holding a board saved twice
  with different `restarts`: the status line after a rerun, the list, loading
  the older recipe, the armed Delete text.

## Out of scope

- Removing one recipe (deferred bead, see Decisions).
- The CLI's wording: `carve` already reports a known layout.
- Showing recipes in the library's row list: a row is a layout.
