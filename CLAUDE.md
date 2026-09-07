# Arrowz — repository rules

## Language

- **Everything in the repository is in English**: code, identifiers, comments,
  tests, documentation (specs, plans, README), branch names, commit messages,
  pull request titles and descriptions.
- **Conversation with the user is in Polish.** Only the chat is Polish; nothing
  Polish goes into files, except translation dictionaries of user-facing text.
- **User-facing tools ship bilingual UI (Polish and English).** The generator
  lab (`prototype/lab.html`) has a language switch; every visible string,
  parameter label, help text and "inactive" reason lives in the dictionary
  (`prototype/lab-i18n.mjs`), with English as the source language in code
  (`PARAM_SPEC`) and Polish as the translation.

## Prototype

- `node --test prototype/` must pass after every change.
- The engine (`prototype/engine.mjs`) knows neither `process` nor DOM; never
  spread arrays proportional to the number of cells or pieces
  (`Math.min(...arr)`) — it overflows the worker stack in Chrome.
- No attribution lines in commit messages or PR descriptions.
