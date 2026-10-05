/**
 * A parsed documentation page as React elements, block by block: no HTML
 * string reaches the DOM. The node types handled here are the ones
 * `problemsOf` (shape.ts) lets a page use, the `::table`, `::play`, `::help`
 * and `::board` leaf directives and the `:::compare` container included;
 * anything else renders nothing, and the content guard fails before such a
 * page ships. Headings move one level down, because the shell owns `h1`.
 */
import { helpText } from '@arrowz/engine/command'
import type { Blockquote, Code, Heading, List, Root, RootContent, Table } from 'mdast'
import type { LeafDirective } from 'mdast-util-directive'
import type { ReactElement } from 'react'
import { DocsBlock } from '../routes/DocsBlock'
import { aboutOf, statKeysOf } from './boards'
import { type CodeToken, highlightHtml, highlightJson, highlightSh } from './codeTokens'
import { DocsBoard, DocsCompare } from './DocsBoard'
import { DocsTable } from './DocsTable'
import { Inline } from './Inline'
import { type DocsSection, plainText, sectionIdOf } from './markdown'
import { SECTION_PREFIX } from './pages'
import { isRuleBoard } from './ruleBoards'
import { RulePlay } from './RulePlay'
import { TokenSpans } from './TokenSpans'
import { useDocs } from './useDocs'

interface Placed {
  readonly node: RootContent
  /** The section the block sits in: a table is labelled by it. */
  readonly section: DocsSection | null
  /** The nearest heading above the block, `##` or `###`: Copy is named after it. */
  readonly title: string
}

function placed(root: Root): Placed[] {
  const out: Placed[] = []
  let section: DocsSection | null = null
  let title = ''
  for (const node of root.children) {
    const id = node.type === 'heading' && node.depth === 2 ? sectionIdOf(node) : undefined
    if (node.type === 'heading' && id !== undefined) {
      section = { id: SECTION_PREFIX + id, title: plainText(node.children) }
      title = section.title
    }
    if (node.type === 'heading' && node.depth === 3) title = plainText(node.children)
    out.push({ node, section, title })
  }
  return out
}

export function DocsMarkdown({ root }: { root: Root }): ReactElement {
  return (
    <>
      {placed(root).map((block, i) => (
        <Block key={i} node={block.node} section={block.section} title={block.title} />
      ))}
    </>
  )
}

function Block({ node, section, title }: Placed): ReactElement | null {
  switch (node.type) {
    case 'heading':
      return <HeadingView node={node} />
    case 'paragraph':
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      )
    case 'code':
      return <CodeView node={node} title={title} />
    case 'list':
      return <ListView node={node} />
    case 'table':
      return <ProseTable node={node} />
    case 'blockquote':
      return <Note node={node} />
    case 'leafDirective':
      return <Directive node={node} section={section} title={title} />
    case 'containerDirective':
      return node.name === 'compare' ? <DocsCompare node={node} /> : null
    default:
      return null
  }
}

function HeadingView({ node }: { node: Heading }): ReactElement {
  const text = <Inline nodes={node.children} />
  const id = sectionIdOf(node)
  if (node.depth === 1) return <h2>{text}</h2>
  if (node.depth === 2) return <h3 id={id === undefined ? undefined : SECTION_PREFIX + id}>{text}</h3>
  return <h4>{text}</h4>
}

function tokensOf(lang: string | null | undefined, code: string): CodeToken[] | null {
  if (lang === 'html') return highlightHtml(code)
  if (lang === 'sh') return highlightSh(code)
  if (lang === 'json') return highlightJson(code)
  return null
}

function CodeView({ node, title }: { node: Code; title: string }): ReactElement {
  const tokens = tokensOf(node.lang, node.value)
  if (tokens === null)
    return (
      <DocsBlock kind="term" section={title} text={node.value}>
        {node.value}
      </DocsBlock>
    )
  return (
    <DocsBlock kind="code" section={title} text={node.value}>
      <code>
        <TokenSpans tokens={tokens} />
      </code>
    </DocsBlock>
  )
}

/**
 * A loose list draws every item's text as a paragraph, a tight one as bare
 * text. CommonMark decides per list: blank lines between any two items, or
 * inside any one, make the whole list loose.
 */
function ListView({ node }: { node: List }): ReactElement {
  const loose = node.spread === true || node.children.some((item) => item.spread === true)
  const items = node.children.map((item, i) => (
    <li key={i}>
      {item.children.map((child, j) =>
        child.type === 'paragraph' ? (
          loose ? (
            <p key={j}>
              <Inline nodes={child.children} />
            </p>
          ) : (
            <Inline key={j} nodes={child.children} />
          )
        ) : child.type === 'list' ? (
          <ListView key={j} node={child} />
        ) : null,
      )}
    </li>
  ))
  return node.ordered === true ? <ol>{items}</ol> : <ul>{items}</ul>
}

function ProseTable({ node }: { node: Table }): ReactElement {
  const [head, ...body] = node.children
  return (
    <table className="fw-docs-table">
      <thead>
        <tr>
          {head?.children.map((cell, i) => (
            <th key={i} scope="col">
              <Inline nodes={cell.children} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {row.children.map((cell, i) => (
              <td key={i}>
                <Inline nodes={cell.children} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** The note's mark, a drawn info glyph. Decoration only: the note is named by its `aside`. */
function InfoIcon(): ReactElement {
  return (
    <svg className="i" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function Note({ node }: { node: Blockquote }): ReactElement {
  const docs = useDocs()
  return (
    <aside className="fw-docs-info" aria-label={docs.infoLabel}>
      <InfoIcon />
      {node.children.map((child, i) =>
        child.type === 'paragraph' ? (
          <p key={i}>
            <Inline nodes={child.children} />
          </p>
        ) : null,
      )}
    </aside>
  )
}

function Directive({
  node,
  section,
  title,
}: {
  node: LeafDirective
  section: DocsSection | null
  title: string
}): ReactElement | null {
  const attributes = node.attributes ?? {}
  if (node.name === 'table') return <DocsTable of={attributes['of'] ?? ''} labelledBy={section?.id} />
  if (node.name === 'play') {
    const board = attributes['board']
    return isRuleBoard(board) ? <RulePlay name={board} /> : null
  }
  if (node.name === 'board')
    return (
      <DocsBoard
        label={node.children}
        cmd={attributes['cmd'] ?? ''}
        stats={statKeysOf(attributes['stats'])}
        about={aboutOf(attributes)}
      />
    )
  if (node.name !== 'help') return null
  const text = helpText({ knobs: attributes['form'] === 'knobs' })
  return (
    <DocsBlock kind="term" section={title} text={text}>
      {text}
    </DocsBlock>
  )
}
