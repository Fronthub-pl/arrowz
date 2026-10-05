/**
 * The documentation's Markdown: CommonMark with GFM tables and directives
 * (`::name[label]{attrs}`, `:::name … :::`), parsed to mdast. A `##` heading
 * names its section with a trailing `{#id}`, which the parse takes off the
 * heading's text; `sectionIdOf` reads it back. What a page may contain is
 * `shape.ts`; how it is drawn is `DocsMarkdown.tsx`.
 */
import type { Heading, PhrasingContent, Root } from 'mdast'
import { directiveFromMarkdown } from 'mdast-util-directive'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table'
import { directive } from 'micromark-extension-directive'
import { gfmTable } from 'micromark-extension-gfm-table'
import { SECTION_PREFIX } from './pages'

export interface DocsSection {
  /** The heading's DOM id: its `{#id}` behind SECTION_PREFIX. */
  readonly id: string
  readonly title: string
}

/** A link to a section of a page: `docs:<page>#<id>`. */
export const DOCS_LINK = /^docs:([a-z]+)#([a-z][a-z0-9-]*)$/

const ID_SUFFIX = /\s*\{#([a-z][a-z0-9-]*)\}$/

// Beside the tree rather than in `heading.data`: mdast's `data` is typed for
// its own utilities, and widening it would mean augmenting the module.
const ids = new WeakMap<Heading, string>()

export function parseDocs(markdown: string): Root {
  const root = fromMarkdown(markdown, {
    extensions: [directive(), gfmTable()],
    mdastExtensions: [directiveFromMarkdown(), gfmTableFromMarkdown()],
  })
  for (const node of root.children) {
    if (node.type !== 'heading') continue
    const last = node.children.at(-1)
    if (last?.type !== 'text') continue
    const m = ID_SUFFIX.exec(last.value)
    if (m?.[1] === undefined) continue
    last.value = last.value.slice(0, m.index)
    ids.set(node, m[1])
  }
  return root
}

/** The `{#id}` a heading carried, without SECTION_PREFIX. */
export function sectionIdOf(heading: Heading): string | undefined {
  return ids.get(heading)
}

/** What a reader sees of phrasing content: the text and the code spans, without the markup. */
export function plainText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => ('value' in node ? node.value : 'children' in node ? plainText(node.children) : ''))
    .join('')
}

export function sectionsOf(root: Root): DocsSection[] {
  const out: DocsSection[] = []
  for (const node of root.children) {
    if (node.type !== 'heading' || node.depth !== 2) continue
    const id = sectionIdOf(node)
    if (id !== undefined) out.push({ id: SECTION_PREFIX + id, title: plainText(node.children) })
  }
  return out
}

/** One line of inline Markdown as phrasing: how a reference table's description is written. */
export function inlineOf(text: string): PhrasingContent[] {
  const first = parseDocs(text).children[0]
  return first?.type === 'paragraph' ? first.children : [{ type: 'text', value: text }]
}
