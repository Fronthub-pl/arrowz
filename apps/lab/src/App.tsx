import { defaultParams } from '@arrowz/engine'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './AppRoutes'
import { TabRow } from './shell/TabRow'
import { TopBar } from './shell/TopBar'

// The knobs are PR 3; until then the top bar shows the defaults a run uses.
const params = defaultParams()

export function App() {
  return (
    <BrowserRouter>
      <div className="fw">
        <TopBar W={params.W} H={params.H} />
        <TabRow />
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}
