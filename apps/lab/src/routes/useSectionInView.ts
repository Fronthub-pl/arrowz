import { type RefObject, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { DOCS_SECTIONS, type DocsPage, sectionOf } from './DocsNav'

/** How far down the panel a heading must come before its section is the one in view. */
const LINE = 0.2
/** The gap left above a heading the panel is scrolled to. */
const GAP = 8

/**
 * The documentation panel's scrolling: it scrolls to the section an address
 * names, and it reports which section is in view for the navigation column's
 * `aria-current`.
 *
 * Scrolling follows the location, keyed on `location.key`, so every click on a
 * section link scrolls, also a second click on the same one after the reader
 * has scrolled away. The navigation's state names a heading (`sectionOf` says
 * why not the hash); none is the top of the page. It is the panel that moves:
 * the shell has a fixed height and the document does not scroll.
 *
 * The section in view is the last one whose heading has passed a line a fifth
 * of the way down the panel, or the first when none has. An
 * `IntersectionObserver` rooted on the panel, its bottom pulled up to that
 * line, calls when a heading crosses it, and the callback reads the geometry
 * rather than the entries, so the answer never depends on one batch.
 *
 * Until the reader scrolls, the section in view is the one the navigation
 * named: otherwise jumping to the last section of a page too short to bring
 * its heading up to the line would light the section above it.
 */
export function useSectionInView(panel: RefObject<HTMLElement | null>, page: DocsPage): string {
  const location = useLocation()
  const sections: readonly { readonly id: string }[] = DOCS_SECTIONS[page]
  const first = sections[0]?.id ?? ''
  const asked = sectionOf(location.state)
  const named = sections.some(({ id }) => id === asked) ? asked : null
  const [reading, setReading] = useState<{ key: string; id: string } | null>(null)
  // What the observer's callback needs of the current render; it outlives it.
  const here = useRef({ key: location.key, named })

  useEffect(() => {
    here.current = { key: location.key, named }
    const box = panel.current
    if (box === null) return
    const heading = named === null ? null : box.querySelector<HTMLElement>(`#${named}`)
    const top =
      heading === null ? 0 : box.scrollTop + heading.getBoundingClientRect().top - box.getBoundingClientRect().top - GAP
    box.scrollTo({ top })
  }, [panel, location.key, named])

  useEffect(() => {
    const box = panel.current
    if (box === null) return
    const headings = sections
      .map(({ id }) => box.querySelector<HTMLElement>(`#${id}`))
      .filter((heading) => heading !== null)
    const pick = () => {
      const { key, named: target } = here.current
      const frame = box.getBoundingClientRect()
      const held = target === null ? null : box.querySelector<HTMLElement>(`#${target}`)
      if (held !== null) {
        const at = held.getBoundingClientRect()
        if (at.bottom > frame.top && at.top < frame.bottom) return
      }
      const line = frame.top + box.clientHeight * LINE
      let inView = first
      for (const heading of headings) if (heading.getBoundingClientRect().top <= line) inView = heading.id
      setReading({ key, id: inView })
    }
    const observer = new IntersectionObserver(pick, {
      root: box,
      rootMargin: `0px 0px -${(1 - LINE) * 100}% 0px`,
    })
    for (const heading of headings) observer.observe(heading)
    return () => observer.disconnect()
  }, [panel, sections, first])

  if (reading !== null && reading.key === location.key) return reading.id
  return named ?? first
}
