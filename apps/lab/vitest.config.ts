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
