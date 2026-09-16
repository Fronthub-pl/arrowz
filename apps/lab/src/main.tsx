import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// The two design-system faces, as local files rather than a request to a font
// service: the lab is a local tool and must look right offline. Each package
// is one variable file covering the whole weight range, and each declares a
// family name ending in "Variable" — which is why the tokens below name that
// first and the plain name second.
import '@fontsource-variable/archivo'
import '@fontsource-variable/jetbrains-mono'
import './design/tokens.css'
import './design/shell.css'
import './design/console.css'
import './design/run.css'
import './design/report.css'

const root = document.getElementById('root')
// A missing mount point is a broken index.html, not a runtime condition to
// paper over: failing here names the cause.
if (!root) throw new Error('#root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
