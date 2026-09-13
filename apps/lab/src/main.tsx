import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './design/tokens.css'
import './design/shell.css'

const root = document.getElementById('root')
// A missing mount point is a broken index.html, not a runtime condition to
// paper over: failing here names the cause.
if (!root) throw new Error('#root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
