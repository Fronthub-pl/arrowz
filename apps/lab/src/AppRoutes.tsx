import { Route, Routes } from 'react-router'
import { DocsRoute } from './routes/DocsRoute'
import { KeepHashNavigate } from './routes/KeepHashNavigate'

export function AppRoutes() {
  return (
    <Routes>
      {/* `/` and `/boards` render nothing: both are the workspace, which App
          mounts beside <Routes> and hides off-route, so a route change neither
          kills a run nor disposes the board's GL context. A board's own
          address is a route all the same, or the wildcard would redirect it. */}
      <Route path="/" element={null} />
      <Route path="/boards" element={null} />
      <Route path="/boards/:size/:id" element={null} />
      {/* The bare path is a documentation link too. Route order does not
          matter — react-router ranks matches — but it reads better here. */}
      <Route path="/docs" element={<KeepHashNavigate to="/docs/element" />} />
      <Route path="/docs/:what" element={<DocsRoute />} />
      {/* A stale deep link is the lab, not a blank page. */}
      <Route path="*" element={<KeepHashNavigate to="/" />} />
    </Routes>
  )
}
