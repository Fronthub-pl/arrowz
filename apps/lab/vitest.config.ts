import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          // Vitest mocks CSS imports by default (an empty module); tokens.test.ts
          // reads the actual declarations through `?raw`, so CSS must be processed.
          css: true,
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx', 'src/**/*.node.test.ts'],
        },
      },
      {
        test: {
          name: 'node-integration',
          environment: 'node',
          include: ['src/**/*.node.test.ts'],
          // Each file owns a port and a temporary store directory.
          fileParallelism: false,
          testTimeout: 60_000,
        },
      },
      {
        plugins: [react()],
        // Only `src/main.tsx` imports `react-dom/client`, and no test reaches
        // it: the browser run meets the module for the first time when the
        // first file renders. A cold optimizer therefore discovers it mid-run,
        // re-bundles and reloads the tester page, and the iframe of the file
        // after that never reports ready — the run dies on the 60s iframe
        // timeout (measured 2026-09-17: reproduced on demand by deleting
        // `node_modules/.vite`, which is why only CI, always cold, ever saw
        // it). Naming the module keeps its discovery in the first pass.
        optimizeDeps: { include: ['react-dom/client'] },
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts', 'src/**/*.browser.test.tsx'],
          setupFiles: ['./vitest.setup.ts'],
          // One file at a time, for the reason board-element's config records:
          // parallel files share one browser and, on a GPU-less runner, one
          // software WebGL renderer.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { channel: 'chromium' },
              // `locale` because Chromium otherwise takes the machine's, and
              // the lab picks its starting language from `navigator.language`
              // (src/harness/storage-a.browser.test.ts).
              contextOptions: { deviceScaleFactor: 2, locale: 'en-US' },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
