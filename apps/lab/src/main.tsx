import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// The design-system faces as local files, so the lab looks right offline.
// Each declares a family name ending in "Variable", which is why the tokens
// name that first and the plain name second.
import '@fontsource-variable/archivo'
import '@fontsource-variable/jetbrains-mono'
import './design/tokens.css'
import './design/shell.css'
import './design/console.css'
import './design/library.css'
import './design/run.css'
import './design/report.css'
import './design/docs.css'
import './design/palette.css'

const root = document.getElementById('root')
// A missing mount point is a broken index.html; failing here names the cause.
if (!root) throw new Error('#root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
