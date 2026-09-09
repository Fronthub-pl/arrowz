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
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
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
