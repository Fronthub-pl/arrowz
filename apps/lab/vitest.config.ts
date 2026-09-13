import { defineConfig } from 'vitest/config'

// Task 4 adds the node-integration and chromium projects beside this one.
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
    ],
  },
})
