// One word per concept for everything a player reads: the retired words of
// the glossary in docs/superpowers/specs/2026-09-25-lab-glossary-design.md
// may not come back into the lab's dictionaries, the knob texts or the CLI's
// help. An exception names its key and why.
import { assert } from '@std/assert'
import { dirname, fromFileUrl, join } from '@std/path'
import { helpText } from './command.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.ts'
import { docsFor } from './lab-docs.ts'
import { EN, EN_CHOICES, PL } from './lab-i18n.ts'

const EN_RETIRED = [
  /\bpieces?\b/i,
  /\bclos(?:e|ed|es|ing)\b/i,
  /\bjam(?:s|med|ming)?\b/i,
  /\bgiants?\b/i,
  /\bprobes?\b/i,
  /\bcarv(?:e|ed|es|ing)\b/i,
  /\banticoil\b/i,
  /\bpaper\b/i,
  /\bink\b/i,
  /\bgrid units?\b/i,
  /\bserpentine\b/i,
  /\bbackbite\b/i,
  /\bcorridor\b/i,
  /\bfragments?\b/i,
  /\babsorb/i,
  /\blateral\b/i,
  /\bjitter\b/i,
  /golden-angle/i,
  /\bpoint grid\b/i,
]
// "knob" is the CLI's own word for a setting (its "Knobs." section and
// "knob" column), so it is refused in the lab's strings only.
const LAB_ONLY_KNOB = /\bknobs?\b/i
// A `--flag` is the CLI's own spelling; the lab's own strings, in either
// language, never quote one.
const LAB_ONLY_FLAG = /(?:^|\s)--[a-z]/
// Named, so a docs page can lift the one that is the right word there (`plFor`).
const PL_ELEMENT = /\belement(?:y|u|ów|em|ami|ach|ie|owi)?\b/i
const PL_KNOB = /pokrętł/i
const PL_RETIRED = [
  PL_ELEMENT,
  /domkn/i,
  /zaklin/i,
  /zacina/i,
  /zacię/i,
  /\bsond/i,
  /wycię/i,
  /wycin/i,
  /\bprostota\b/i,
  /podziałk/i,
  /\bpapier/i,
  /\btusz/i,
  /kolor rysunku/i,
  /antyzwij/i,
  /wchłan/i,
  /serpentyn/i,
  /kubeł/i,
  /koszyk/i,
  /\bfragment/i,
  /generacj/i,
  PL_KNOB,
  /siatk\S* punktów/i,
]

/** A dictionary path whose value may keep a retired word, and why. */
const ALLOWED: Record<string, string> = {
  'EN.ui.cmdHintClose': '"close" the palette, a verb about the dialog',
  'EN.ui.cmdPlaceholder': '"knob" in the palette search hint, where a developer types',
  'PL.ui.cmdPlaceholder': '"pokrętła" in the palette search hint, as in English',
  'PL.ui.docsElement': '"Element planszy", the web component',
  'EN.ui.storeEmpty': 'the command deno task carve',
  'PL.ui.storeEmpty': 'the command deno task carve',
  'pl.props.enableColors': '"element", the web component, not an arrow',
  'pl.members.emit': '"element", the web component, not an arrow',
  'pl.slots.colors': '"element", the web component, not an arrow',
  'pl.slots.gestures': '"element", the web component, not an arrow',
}

/** The arrows' old Polish name, in the plural forms the component's name never takes. */
const PL_ELEMENTS = /\belement(?:y|ów|om|ami|ach)\b/i

/**
 * The Polish list for one docs page. On the CLI page "pokrętło" is the CLI's
 * own word, as in `ui.cmdPlaceholder`; on the element page the singular
 * "element" names the component, as `ui.docsElement` does.
 */
function plFor(page: string): RegExp[] {
  const lifted = page === 'cli' ? PL_KNOB : page === 'element' ? PL_ELEMENT : null
  return [...PL_RETIRED.filter((re) => re !== lifted), ...(page === 'element' ? [PL_ELEMENTS] : [])]
}

/** Code spans blanked: a key or a flag in backticks is code, not a word. */
const withoutCode = (text: string): string => text.replace(/`[^`\n]*`/g, ' ')

/** The descriptions of the Docs tab's tables, the element's and the lab's. */
function docsRows(lang: 'en' | 'pl'): [string, string][] {
  const docs = docsFor(lang)
  return ([
    'props',
    'members',
    'events',
    'slots',
    'types',
    'functions',
    'constants',
    'classes',
    'keys',
    'palette',
    'linkFields',
    'env',
  ] as const)
    .flatMap((group) => leaves(docs[group], `${lang}.${group}`, []))
    .map(([path, text]): [string, string] => [path, withoutCode(text)])
}

/** Every string a dictionary can produce, keyed by its path; a function is called with 2 for each parameter. */
function leaves(value: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') out.push([path, String(value(...Array(value.length).fill(2)))])
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}.${i}`, out))
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out)
  }
  return out
}

function refuse(texts: [string, string][], patterns: RegExp[]): void {
  for (const [path, text] of texts) {
    if (Object.hasOwn(ALLOWED, path)) continue
    for (const re of patterns) assert(!re.test(text), `${path} uses a retired word (${re}): "${text}"`)
  }
}

const enTexts = (): [string, string][] => [
  ...leaves(EN, 'EN', []),
  ...leaves(EN_CHOICES, 'EN_CHOICES', []),
  ...PARAM_SPEC.flatMap((s): [string, string][] => [
    [`PARAM_SPEC.${s.key}.label`, s.label],
    [`PARAM_SPEC.${s.key}.help`, s.help],
  ]),
  ...leaves(INACTIVE_REASONS, 'INACTIVE_REASONS', []),
]

Deno.test('the English lab strings and knob texts use no retired word', () => {
  refuse(enTexts(), [...EN_RETIRED, LAB_ONLY_KNOB, LAB_ONLY_FLAG])
})

// RULE_REASONS print in the CLI's refusals too, so they get the CLI's list.
Deno.test('the rule reasons use no retired word', () => {
  refuse(leaves(RULE_REASONS, 'RULE_REASONS', []), EN_RETIRED)
})

Deno.test('the Polish lab strings use no retired word', () => {
  refuse(leaves(PL, 'PL', []), [...PL_RETIRED, LAB_ONLY_FLAG])
})

Deno.test('the CLI help uses no retired word outside flag, variable and group names', () => {
  const text = helpText({ knobs: true })
    .replace(/--[a-z-]+/g, ' ')
    .replace(/\b[A-Z_]{3,}\b/g, ' ')
    .replace(/\[[a-z]+\]/g, ' ')
    .replace(/deno task carve/g, ' ')
  refuse(text.split('\n').map((line, i): [string, string] => [`helpText line ${i + 1}`, line]), EN_RETIRED)
})

Deno.test("the Docs tables' descriptions use no retired word", () => {
  refuse(docsRows('en'), [...EN_RETIRED, LAB_ONLY_KNOB, LAB_ONLY_FLAG])
  refuse(docsRows('pl'), [...PL_RETIRED, LAB_ONLY_FLAG])
})

const DOCS_CONTENT = join(dirname(fromFileUrl(import.meta.url)), '..', '..', 'apps', 'lab', 'docs-content')

/**
 * A docs page's prose: code, heading ids, directive lines and link targets
 * blanked, lines kept so a finding names its line. A `{…}` anywhere else is prose.
 */
function proseOf(markdown: string): string {
  return withoutCode(markdown.replace(/^```[\s\S]*?^```/gm, (block) => block.replace(/[^\n]/g, '')))
    .replace(/\{#[a-z0-9-]+\}[ \t]*$/gm, ' ')
    .replace(/^::.*$/gm, '')
    .replace(/\]\([^)\n]*\)/g, ']')
    // The CLI's own name, as the helpText case above strips it: the CLI page's title.
    .replace(/deno task carve/g, ' ')
}

/** A docs page's prose, line by line, each line keyed by its place in the file. */
function proseLines(lang: string, page: string): [string, string][] {
  const text = proseOf(Deno.readTextFileSync(join(DOCS_CONTENT, lang, `${page}.md`)))
  return text.split('\n').map((line, i): [string, string] => [`docs-content/${lang}/${page}.md:${i + 1}`, line])
}

Deno.test('proseOf ends a code span at its line, so a lone backtick hides nothing below', () => {
  const lines = proseOf('A lone ` backtick here\nthe pieces line\nends `code` ok').split('\n')
  assert(lines.length === 3, `${lines.length} lines`)
  assert(lines[1]?.includes('pieces'), `line 2 is "${lines[1]}"`)
})

Deno.test('proseOf keeps braces in prose', () => {
  assert(proseOf('Clicks on {any pieces} are reported.').includes('pieces'))
})

Deno.test('proseOf blanks a heading id', () => {
  const lines = proseOf('## A {#a}\n\nText').split('\n')
  assert(!lines.join('\n').includes('{#a}'))
  assert(lines.length === 3, `${lines.length} lines`)
  assert(lines[2] === 'Text', `line 3 is "${lines[2]}"`)
})

Deno.test('proseOf blanks a directive line whole', () => {
  assert(proseOf('::table{of="element-props"}') === '', `got "${proseOf('::table{of="element-props"}')}"`)
})

Deno.test('proseOf blanks a fenced block and keeps its lines', () => {
  const markdown = 'before\n```sh\ndeno task pieces\n```\nafter'
  const prose = proseOf(markdown)
  assert(prose.split('\n').length === markdown.split('\n').length)
  assert(prose.split('\n').slice(1, 4).every((line) => line === ''), `got "${prose}"`)
})

Deno.test('the docs pages use no retired word', () => {
  const pages = [...Deno.readDirSync(join(DOCS_CONTENT, 'en'))]
    .filter((entry) => entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
  assert(pages.length >= 2, `only ${pages.length} docs pages found — the path is wrong`)
  for (const page of pages) {
    refuse(proseLines('en', page), [...EN_RETIRED, ...(page === 'cli' ? [] : [LAB_ONLY_KNOB]), LAB_ONLY_FLAG])
    refuse(proseLines('pl', page), [...plFor(page), LAB_ONLY_FLAG])
  }
})
