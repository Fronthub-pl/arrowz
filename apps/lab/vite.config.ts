import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'
import { labProxy } from './vite.proxy.ts'

// Cross-origin isolation, for the SharedArrayBuffer Stop writes into
// (`useGenerator`). The lab loads nothing from another origin.
export const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// The React Compiler, measured in `lab-review.md` (refactor 11); `LAB_REACT_COMPILER=0`
// leaves plain `react()`, for an A/B run.
export function reactPlugins(): PluginOption[] {
  if (process.env['LAB_REACT_COMPILER'] === '0') return [react()]
  return [react(), babel({ presets: [reactCompilerPreset()] })]
}

export default defineConfig({
  plugins: reactPlugins(),
  // 8777 is the store server, 8778 is the board element's demo.
  server: { port: 8779, proxy: labProxy(), headers: ISOLATION },
  preview: { headers: ISOLATION },
  build: { target: 'es2022' },
})
