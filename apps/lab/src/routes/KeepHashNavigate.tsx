import type { ReactElement } from 'react'
import { Navigate, useLocation } from 'react-router'

/**
 * `<Navigate replace>` that keeps the fragment, which is the lab's link
 * (`useUrlHash`). A plain redirect drops it before that hook reads it:
 * `Navigate` replaces the URL in its effect, and a child's effects run first.
 */
export function KeepHashNavigate({ to }: { to: string }): ReactElement {
  const { hash } = useLocation()
  return <Navigate to={{ pathname: to, hash }} replace />
}
