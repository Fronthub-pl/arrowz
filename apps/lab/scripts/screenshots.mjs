// Retakes the screenshots README.md shows, from the record of how each one was
// taken: docs/screenshots.json.
//
// Run: pnpm nx run lab:screenshots [out ...]
//
// The lab runs as `nx serve lab` runs it, Vite with the store behind its proxy,
// but on free ports and over a store in a temporary directory, filled first by
// the CLI with the manifest's `boards`: a retake never writes to
// packages/cli/boards/, and never meets a lab already running on 8779.
// Naming shots on the command line retakes only those.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { labProxy } from '../vite.proxy.ts'

const labDir = fileURLToPath(new URL('..', import.meta.url))
const root = join(labDir, '..', '..')
const outDir = join(labDir, 'docs', 'screenshots')
const manifest = JSON.parse(readFileSync(join(labDir, 'docs', 'screenshots.json'), 'utf8'))
const only = process.argv.slice(2)

const unknown = only.filter((out) => !manifest.shots.some((shot) => shot.out === out))
if (unknown.length > 0) {
  console.error(`not in docs/screenshots.json: ${unknown.join(', ')}`)
  process.exit(1)
}

/** A port nothing listens on, from the system. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForOk(url, timeoutMs) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${url} did not answer within ${timeoutMs} ms`)
}

/**
 * A run finished, the fonts in, and the drawers' transitions over. Not
 * `networkidle`: Vite's client keeps a connection open, so it never comes.
 */
async function settle(page) {
  await page.waitForFunction('document.querySelector(\'[aria-busy="true"]\') === null', null, { timeout: 120_000 })
  await page.evaluate('document.fonts.ready')
  await page.waitForTimeout(600)
}

async function runStep(page, step) {
  if ('press' in step) await page.keyboard.press(step.press)
  else if ('click' in step) await page.locator(step.click).first().click()
  else throw new Error(`unknown step ${JSON.stringify(step)}`)
}

const boards = mkdtempSync(join(tmpdir(), 'arrowz-screenshots-'))
const env = { ...process.env, ARROWZ_BOARDS_DIR: boards }
let store = null
let vite = null
let browser = null
try {
  for (const flags of manifest.boards) {
    execFileSync('deno', ['task', 'carve', ...flags], { cwd: root, env, stdio: 'ignore' })
  }
  const storePort = await freePort()
  // Its own process group, so that the shell and the Deno server it execs stop together.
  store = spawn('sh', [join(root, 'packages', 'cli', 'store.sh'), String(storePort)], {
    env,
    stdio: 'ignore',
    detached: true,
  })
  await waitForOk(`http://127.0.0.1:${storePort}/api/boards`, 30_000)

  vite = await createServer({
    root: labDir,
    configFile: join(labDir, 'vite.config.ts'),
    logLevel: 'warn',
    server: { port: await freePort(), strictPort: true, proxy: labProxy(`http://127.0.0.1:${storePort}`) },
  })
  await vite.listen()
  const base = vite.resolvedUrls?.local[0]
  if (base === undefined) throw new Error('Vite reported no local address')

  mkdirSync(outDir, { recursive: true })
  browser = await chromium.launch({ channel: 'chromium' })
  for (const shot of manifest.shots) {
    if (only.length > 0 && !only.includes(shot.out)) continue
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      locale: 'en-US',
    })
    // Text, not a function: it runs in the page, where this file's globals are not.
    await context.addInitScript({
      content: `for (const [k, v] of Object.entries(${JSON.stringify(shot.storage ?? {})})) localStorage.setItem(k, v)`,
    })
    const page = await context.newPage()
    const hash = shot.hash === undefined ? '' : '#' + encodeURIComponent(JSON.stringify(shot.hash))
    await page.goto(new URL(shot.path, base).href + hash)
    await settle(page)
    for (const step of shot.steps ?? []) {
      await runStep(page, step)
      await settle(page)
    }
    await page.screenshot({ path: join(outDir, `${shot.out}.png`) })
    console.log(`${shot.out}.png`)
    await context.close()
  }
} finally {
  await browser?.close()
  await vite?.close()
  if (store?.pid !== undefined) process.kill(-store.pid)
  rmSync(boards, { recursive: true, force: true })
}
