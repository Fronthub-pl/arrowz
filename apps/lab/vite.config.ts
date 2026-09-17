import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { labProxy } from './vite.proxy.ts'

export default defineConfig({
  plugins: [react()],
  // 8777 is the store server, 8778 is the board element's demo.
  server: { port: 8779, proxy: labProxy() },
  build: { target: 'es2022' },
})
