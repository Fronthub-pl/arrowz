// One word per concept for everything a player reads: the retired words of
// the glossary in docs/superpowers/specs/2026-09-25-lab-glossary-design.md
// may not come back into the lab's dictionaries, the knob texts or the CLI's
// help. An exception names its key and why.
import { assert } from '@std/assert'
import { helpText } from './command.ts'
import { INACTIVE_REASONS, PARAM_SPEC, RULE_REASONS } from './engine.ts'
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
const LAB_ONLY = [/\bknobs?\b/i, /(?:^|\s)--[a-z]/]
const PL_RETIRED = [
  /\belement(?:y|u|ów|em|ami|ach|ie|owi)?\b/i,
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
  /pokrętł/i,
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
  refuse(enTexts(), [...EN_RETIRED, ...LAB_ONLY])
})

// RULE_REASONS print in the CLI's refusals too, so they get the CLI's list.
Deno.test('the rule reasons use no retired word', () => {
  refuse(leaves(RULE_REASONS, 'RULE_REASONS', []), EN_RETIRED)
})

Deno.test('the Polish lab strings use no retired word', () => {
  refuse(leaves(PL, 'PL', []), PL_RETIRED)
})

Deno.test('the CLI help uses no retired word outside flag, variable and group names', () => {
  const text = helpText({ knobs: true })
    .replace(/--[a-z-]+/g, ' ')
    .replace(/\b[A-Z_]{3,}\b/g, ' ')
    .replace(/\[[a-z]+\]/g, ' ')
    .replace(/deno task carve/g, ' ')
  refuse(text.split('\n').map((line, i): [string, string] => [`helpText line ${i + 1}`, line]), EN_RETIRED)
})
