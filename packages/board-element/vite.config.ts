import { defineConfig } from 'vite'

// The demo page only; the package itself is emitted by tsc.
export default defineConfig({
  root: 'demo',
  server: { port: 8778 },
  build: { target: 'es2022' },
})
