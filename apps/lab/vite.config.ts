import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // 8777 is the lab server, 8778 is the board element's demo.
  server: { port: 8779 },
  build: { target: 'es2022' },
})
