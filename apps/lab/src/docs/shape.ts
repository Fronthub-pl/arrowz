/**
 * The rules a documentation page keeps, as data a test can compare.
 * `problemsOf` lists what the renderer would not show (`DocsMarkdown.tsx`
 * handles exactly these node types); `shapeOf` is a page with its prose taken
 * out, which both languages must share. `content.test.ts` runs both over every
 * page.
 */
import type { Nodes, Root } from 'mdast'
import type { LeafDirective } from 'mdast-util-directive'
import { DOCS_LINK, sectionIdOf } from './markdown'

/** Each directive by name, and the values each of its attributes may take. */
export const DIRECTIVES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  table: { of: ['element-props', 'element-members', 'element-events', 'element-slots'] },
  help: { form: ['short', 'knobs'] },
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
])

function directiveProblems(node: LeafDirective, at: string): string[] {
  // hasOwn first: `::toString` or `constructor="x"` would read Object.prototype.
  const allowed = Object.hasOwn(DIRECTIVES, node.name) ? DIRECTIVES[node.name] : undefined
  if (allowed === undefined) return [`${at}: ::${node.name} is not a docs directive`]
  const out: string[] = []
  const attributes = node.attributes ?? {}
  for (const [key, value] of Object.entries(attributes)) {
    const values = Object.hasOwn(allowed, key) ? allowed[key] : undefined
    if (values === undefined) out.push(`${at}: ::${node.name} takes no ${key}`)
    else if (!values.includes(value ?? ''))
      out.push(`${at}: ${key}="${value ?? ''}" is not one of ${values.join(', ')}`)
  }
  for (const key of Object.keys(allowed)) if (!(key in attributes)) out.push(`${at}: ::${node.name} needs ${key}`)
  if (node.children.length > 0) out.push(`${at}: ::${node.name} takes no label`)
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
    if (node.type === 'leafDirective') out.push(...directiveProblems(node, at))
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
    if (node.type === 'link') out.push(`link ${node.url}`)
    if (node.type === 'blockquote') out.push('note')
    if (node.type === 'list') out.push(`list ${node.ordered === true ? 'ordered' : 'bullet'} ${node.children.length}`)
    if (node.type === 'table') out.push(`table ${node.children.length}×${node.children[0]?.children.length ?? 0}`)
    if ('children' in node) for (const child of node.children) walk(child)
  }
  walk(root)
  return out
}
