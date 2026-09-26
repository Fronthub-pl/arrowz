import type { ReactElement, ReactNode } from 'react'

/** A titled run of rows, a group named by its heading. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactElement {
  return (
    <div className="kv-sect" role="group" aria-labelledby={id}>
      <div className="kv-sub" id={id}>
        {title}
      </div>
      {children}
    </div>
  )
}
