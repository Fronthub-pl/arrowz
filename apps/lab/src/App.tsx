import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'
import { useGenerator } from './worker/useGenerator'

// The knobs are PR 3; until then the top bar shows the defaults a run uses.
const params = defaultParams()

function Shell() {
  // Above the routes on purpose: §6. A route change must not kill a run.
  useGenerator()
  return (
    <div className="fw">
      <TopBar W={params.W} H={params.H} />
      <TabRow />
      <AppRoutes />
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
