import { Navigate, Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'

export function AppRoutes() {
  return (
    <Routes>
      {/* `/` and `/boards` render nothing: both are the workspace, which App
          mounts beside <Routes> and merely hides off-route, so that a route
          change neither kills a run nor disposes the board's GL context
          (Ruling 5 of PR 2, and Ruling 5 here). A board's own address is a
          route all the same, or the wildcard below would redirect it. */}
      <Route path="/" element={null} />
      <Route path="/boards" element={null} />
      <Route path="/boards/:size/:id" element={null} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is the lab, not a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
