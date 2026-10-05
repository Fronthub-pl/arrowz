import type { Link as MdLink, PhrasingContent } from 'mdast'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { Link, useLocation } from 'react-router'
import { DOCS_LINK, inlineOf } from './markdown'
import { SECTION_PREFIX } from './pages'

/** Phrasing content as the page shows it; `problemsOf` (shape.ts) refuses every type not handled here. */
export function Inline({ nodes }: { nodes: readonly PhrasingContent[] }): ReactElement {
  return (
    <>
      {nodes.map((node, i) => (
        <Phrase key={i} node={node} />
      ))}
    </>
  )
}

function Phrase({ node }: { node: PhrasingContent }): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value
    case 'inlineCode':
      return <code>{node.value}</code>
    case 'emphasis':
      return (
        <em>
          <Inline nodes={node.children} />
        </em>
      )
    case 'strong':
      return (
        <strong>
          <Inline nodes={node.children} />
        </strong>
      )
    case 'break':
      return <br />
    case 'link':
      return <DocsLink node={node} />
    default:
      return null
  }
}

/**
 * A `docs:` link is the navigation column's kind of link: its page's address,
 * the lab's fragment kept, the section in the router's state (`sectionOf` in
 * DocsNav says why). Any other link leaves the lab, in a new tab.
 */
function DocsLink({ node }: { node: MdLink }): ReactElement {
  const { hash } = useLocation()
  const children = <Inline nodes={node.children} />
  const m = DOCS_LINK.exec(node.url)
  if (m === null)
    return (
      <a href={node.url} target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  return (
    <Link to={{ pathname: `/docs/${m[1] ?? ''}`, hash }} state={{ docsSection: SECTION_PREFIX + (m[2] ?? '') }}>
      {children}
    </Link>
  )
}

/** One line of inline Markdown: a reference table's description. */
export function InlineMarkdown({ text }: { text: string }): ReactElement {
  const nodes = useMemo(() => inlineOf(text), [text])
  return <Inline nodes={nodes} />
}
