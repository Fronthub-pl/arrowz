import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Two projects: the pure modules run in Node, the element runs in a real
// Chromium (real SVG geometry, real pointer events, real frame timings).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          // The demo's pure modules (the inspector's snippet and event log)
          // run here too: they touch no DOM, and they are what a test can pin.
          include: ['src/**/*.test.ts', 'demo/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        // ARROWZ_* reaches the browser too, so perf.browser.test.ts can read
        // ARROWZ_MEASURE from import.meta.env (Vite only forwards VITE_* by default).
        envPrefix: ['VITE_', 'ARROWZ_'],
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
