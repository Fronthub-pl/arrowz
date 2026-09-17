import { useMatch } from 'react-router'

/**
 * Which board the address names. `useMatch` and not `useParams`: the workspace
 * is `<Routes>`' sibling, so it is inside the router but outside any route, and
 * `useParams` would answer with nothing. The pattern is the one `AppRoutes`
 * declares, so the two cannot drift apart without a test noticing.
 */
export function useOpenBoard(): { size: string | null; id: string | null } {
  const match = useMatch('/boards/:size/:id')
  return { size: match?.params.size ?? null, id: match?.params.id ?? null }
}
