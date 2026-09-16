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
        // No `optimizeDeps` here, unlike apps/lab's browser project, and that is
        // measured rather than assumed (2026-09-17). The lab's trap needs a
        // dependency no source names: `react-dom/client` is imported by
        // `vitest-browser-react` at render time, so a cold optimizer meets it
        // mid-run, re-bundles, reloads the tester page and strands the next
        // file's iframe. Every bare module these tests reach is named by source
        // the first pass scans instead — `lit`, by arrowz-board.ts and by
        // lit.browser.test.ts, and the engine, which is a workspace link — and
        // they drive the DOM themselves, with no wrapper importing anything on
        // their behalf. Two cold runs (`rm -rf node_modules/.vite`) passed, 17
        // files and 270 tests, with nothing discovered late; the cache they left
        // holds `lit` and vitest's own internals. Nothing to pre-bundle.
        test: {
          name: 'chromium',
          include: ['src/**/*.browser.test.ts'],
          // One file at a time. Parallel files share one browser, and on a
          // GPU-less runner one software WebGL renderer: the element's heavy
          // files space the frames out far enough that an exit ride (at most
          // 600 ms) in gl-layer.browser.test.ts ends before a single frame is
          // sampled. Reproduced with SwiftShader, which is what CI draws with;
          // with files in parallel the two ride tests fail every run, one at a
          // time they pass (PR #40).
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            // The headless SHELL is a separate, stripped binary rasterising in
            // software at one device pixel per CSS pixel. `channel: 'chromium'`
            // is Playwright's new headless mode — the real Chrome engine,
            // headless — and deviceScaleFactor 2 gives it the pixel count a
            // Retina host rasterises. Measured, the pair moves the ceiling case
            // from 83 ms a frame to 104 ms: closer, not close. The frame time a
            // person actually sees is ten times that again, and the difference
            // is compositing onto a display, which nothing headless does. The
            // header of perf.browser.test.ts carries the three figures.
            provider: playwright({
              launchOptions: { channel: 'chromium' },
              contextOptions: { deviceScaleFactor: 2 },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
