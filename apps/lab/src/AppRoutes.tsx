import { Navigate, Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'
import { SavedBoardsRoute } from './routes/SavedBoardsRoute'

export function AppRoutes() {
  return (
    <Routes>
      {/* `/` renders nothing: the lab panel is mounted in App and merely
          hidden off-route, so that a route change neither kills a run nor
          disposes the board's GL context (Ruling 5). */}
      <Route path="/" element={null} />
      <Route path="/boards" element={<SavedBoardsRoute />} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is the lab, not a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
