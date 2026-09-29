import type { CSSProperties, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { render } from 'vitest-browser-react'

/** A node at an address, inside the `.fw` root every lab rule hangs from. */
export function renderAt(node: ReactNode, { path = '/', style }: { path?: string; style?: CSSProperties } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <div className="fw" style={style}>
        {node}
      </div>
    </MemoryRouter>,
  )
}
