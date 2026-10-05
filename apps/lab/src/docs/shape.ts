/**
 * The rules a documentation page keeps, as data a test can compare.
 * `problemsOf` lists what the renderer would not show (`DocsMarkdown.tsx`
 * handles exactly these node types); `shapeOf` is a page with its prose taken
 * out, which both languages must share. `content.test.ts` runs both over every
 * page. The directives' rules are `DIRECTIVES` and `CONTAINERS`; a board's
 * command is checked by `readBoardCmd` (boards.ts).
 */
import type { Nodes, Root } from 'mdast'
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive'
import { aboutProblem, DOCS_BOARD_MAX, readBoardCmd, statsProblem } from './boards'
import { EXPORT_TABLES } from './exportTables'
import { DOCS_LINK, sectionIdOf } from './markdown'
import { RULE_BOARD_NAMES } from './ruleBoards'

/** What an attribute may hold: one of a list, or whatever `check` lets through (it returns the problem). */
type AttributeRule = readonly string[] | ((value: string) => string | null)

interface DirectiveRule {
  /** `[…]` after the name: a board's caption. The other directives take none. */
  readonly label: boolean
  readonly required: Readonly<Record<string, AttributeRule>>
  readonly optional: Readonly<Record<string, AttributeRule>>
}

const cmdProblem = (value: string): string | null => {
  const { problems } = readBoardCmd(value)
  return problems.length === 0 ? null : `cmd: ${problems.join('; ')}`
}

/** Each leaf directive by name: its label, and the values each attribute may take. */
export const DIRECTIVES: Readonly<Record<string, DirectiveRule>> = {
  table: {
    label: false,
    required: {
      of: [
        'element-props',
        'element-members',
        'element-events',
        'element-slots',
        ...EXPORT_TABLES,
        'themes',
        'keys',
        'palette',
        'link-fields',
        'knobs',
        'rules',
        'env',
      ],
    },
    optional: {},
  },
  help: { label: false, required: { form: ['short', 'knobs'] }, optional: {} },
  play: { label: false, required: { board: RULE_BOARD_NAMES }, optional: {} },
  board: {
    label: true,
    required: { cmd: cmdProblem },
    // `manual` is a bare word: the parser reads it as an empty value.
    optional: { stats: statsProblem, manual: [''], about: aboutProblem },
  },
}

/** `:::compare` holds boards side by side; its `stats` speak for every board in it. */
export const CONTAINERS: Readonly<Record<string, DirectiveRule>> = {
  compare: { label: false, required: {}, optional: { stats: statsProblem } },
}

/** Fenced code is coloured as its language; `text` is a terminal's output and stays plain. */
export const CODE_LANGS: readonly string[] = ['html', 'sh', 'json', 'text']

const SHOWN = new Set([
  'root',
  'heading',
  'paragraph',
  'text',
  'emphasis',
  'strong',
  'inlineCode',
  'code',
  'list',
  'listItem',
  'table',
  'tableRow',
  'tableCell',
  'link',
  'break',
  'blockquote',
  'leafDirective',
  'containerDirective',
])

type Directive = LeafDirective | ContainerDirective

/** A check names its own key; a listed value keeps the wording tests pin: `of="x" is not one of …`. */
function ruleProblems(key: string, rule: AttributeRule, value: string): string | null {
  if (typeof rule === 'function') return rule(value)
  return rule.includes(value) ? null : `${key}="${value}" is not one of ${rule.join(', ')}`
}

function attributeProblems(node: Directive, rule: DirectiveRule, at: string): string[] {
  const out: string[] = []
  const attributes = node.attributes ?? {}
  const mark = node.type === 'containerDirective' ? ':::' : '::'
  for (const [key, value] of Object.entries(attributes)) {
    // hasOwn first: `::toString` or `constructor="x"` would read Object.prototype.
    const allowed = Object.hasOwn(rule.required, key)
      ? rule.required[key]
      : Object.hasOwn(rule.optional, key)
        ? rule.optional[key]
        : undefined
    if (allowed === undefined) {
      out.push(`${at}: ${mark}${node.name} takes no ${key}`)
      continue
    }
    const problem = ruleProblems(key, allowed, value ?? '')
    if (problem !== null) out.push(`${at}: ${problem}`)
  }
  for (const key of Object.keys(rule.required))
    if (!(key in attributes)) out.push(`${at}: ${mark}${node.name} needs ${key}`)
  return out
}

function boardProblems(node: LeafDirective, at: string): string[] {
  const attributes = node.attributes ?? {}
  const out: string[] = []
  const manual = 'manual' in attributes
  if (manual !== 'about' in attributes) out.push(`${at}: manual and about go together`)
  const spec = readBoardCmd(attributes['cmd'] ?? '').spec
  if (spec !== null && !manual && Math.max(spec.params.W, spec.params.H) > DOCS_BOARD_MAX)
    out.push(
      `${at}: a board larger than ${DOCS_BOARD_MAX}×${DOCS_BOARD_MAX} waits for its button: add manual about="…"`,
    )
  return out
}

function leafProblems(node: LeafDirective, at: string): string[] {
  const rule = Object.hasOwn(DIRECTIVES, node.name) ? DIRECTIVES[node.name] : undefined
  if (rule === undefined) return [`${at}: ::${node.name} is not a docs directive`]
  const out = attributeProblems(node, rule, at)
  if (rule.label && node.children.length === 0) out.push(`${at}: ::${node.name} needs a label`)
  if (!rule.label && node.children.length > 0) out.push(`${at}: ::${node.name} takes no label`)
  if (node.name === 'board') out.push(...boardProblems(node, at))
  return out
}

function containerProblems(node: ContainerDirective, at: string): string[] {
  const rule = Object.hasOwn(CONTAINERS, node.name) ? CONTAINERS[node.name] : undefined
  if (rule === undefined) return [`${at}: :::${node.name} is not a docs directive`]
  const out = attributeProblems(node, rule, at)
  const boards = node.children.filter((child) => child.type === 'leafDirective' && child.name === 'board')
  if (boards.length !== node.children.length) out.push(`${at}: :::${node.name} holds boards only`)
  if (boards.length < 2) out.push(`${at}: :::${node.name} needs two boards or more`)
  for (const child of boards)
    if (child.type === 'leafDirective' && 'stats' in (child.attributes ?? {}))
      out.push(`${at}: a board in :::${node.name} takes its stats from the comparison`)
  return out
}

/** What in this page the renderer would not show, one message per finding; none is a page that ships. */
export function problemsOf(root: Root, pages: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (node: Nodes): void => {
    const at = `line ${node.position?.start.line ?? '?'}`
    if (!SHOWN.has(node.type)) out.push(`${at}: ${node.type} is not shown by the docs renderer`)
    if (node.type === 'heading') {
      const id = sectionIdOf(node)
      if (node.depth > 3) out.push(`${at}: a heading deeper than ###`)
      if (node.depth === 1 && node !== root.children[0]) out.push(`${at}: # is the page title and comes first`)
      if (node.depth === 2 && id === undefined) out.push(`${at}: ## needs a {#id}`)
      if (node.depth !== 2 && id !== undefined) out.push(`${at}: only ## carries a {#id}`)
      if (id !== undefined && seen.has(id)) out.push(`${at}: {#${id}} twice`)
      if (id !== undefined) seen.add(id)
    }
    if (node.type === 'code' && !CODE_LANGS.includes(node.lang ?? ''))
      out.push(`${at}: code needs one of ${CODE_LANGS.join(', ')}`)
    if (node.type === 'link' && !node.url.startsWith('https://')) {
      const page = DOCS_LINK.exec(node.url)?.[1]
      if (page === undefined || !pages.includes(page))
        out.push(`${at}: ${node.url} is neither docs:<page>#<section> nor https://`)
    }
    if (node.type === 'blockquote' && !node.children.every((child) => child.type === 'paragraph'))
      out.push(`${at}: a note holds paragraphs only`)
    if (
      node.type === 'listItem' &&
      !node.children.every((child) => child.type === 'paragraph' || child.type === 'list')
    )
      out.push(`${at}: a list item holds paragraphs and lists only`)
    if (node.type === 'leafDirective') out.push(...leafProblems(node, at))
    if (node.type === 'containerDirective') out.push(...containerProblems(node, at))
    if ('children' in node) for (const child of node.children) walk(child)
  }
  const first = root.children[0]
  if (first?.type !== 'heading' || first.depth !== 1) out.push('line 1: a page opens with its # title')
  walk(root)
  return out
}

/** A `sh` block without its comments, which are prose and are translated. */
const codeOf = (lang: string | null | undefined, value: string): string =>
  lang === 'sh'
    ? value
        .split('\n')
        .map((line) => line.replace(/(^|\s+)#.*$/, ''))
        .join('\n')
    : value

const attributesOf = (attributes: LeafDirective['attributes']): string =>
  Object.entries(attributes ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value ?? ''}`)
    .join(' ')

/** A page with its prose taken out: headings, code, directives, links, notes, tables and lists. */
export function shapeOf(root: Root): string[] {
  const out: string[] = []
  const walk = (node: Nodes): void => {
    if (node.type === 'heading')
      out.push(node.depth === 2 ? `## {#${sectionIdOf(node) ?? ''}}` : '#'.repeat(node.depth))
    if (node.type === 'code') out.push(`code ${node.lang ?? ''}: ${codeOf(node.lang, node.value)}`)
    if (node.type === 'leafDirective') out.push(`::${node.name}{${attributesOf(node.attributes)}}`)
    if (node.type === 'containerDirective') out.push(`:::${node.name}{${attributesOf(node.attributes)}}`)
    if (node.type === 'link') out.push(`link ${node.url}`)
    if (node.type === 'blockquote') out.push('note')
    if (node.type === 'list') out.push(`list ${node.ordered === true ? 'ordered' : 'bullet'} ${node.children.length}`)
    if (node.type === 'table') out.push(`table ${node.children.length}×${node.children[0]?.children.length ?? 0}`)
    if ('children' in node) for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}
