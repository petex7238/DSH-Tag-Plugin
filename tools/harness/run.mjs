// Runs the harness page in a headless Chromium and prints the assertions.
//
// usage:
//   node tools/harness/run.mjs            # headless
//   node tools/harness/run.mjs --headed   # watch it run
//
// Browser: set CHROME_PATH to override, otherwise the usual Chrome/Edge
// locations are tried (Linux, macOS and Windows).
// Driver: puppeteer-core from node_modules, or the copy a DSH profile already
// ships (DSH_HOME + DSH_PROFILE), so the harness runs without `npm install`.
import { existsSync } from 'node:fs'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter((candidate) => typeof candidate === 'string' && candidate !== '')

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
if (chromePath === undefined) {
  console.error('No Chromium found. Install Chrome/Chromium, or set CHROME_PATH to its executable.')
  process.exit(2)
}

/** Resolve puppeteer-core: local devDependency first, then an installed DSH profile. */
async function loadPuppeteer() {
  try {
    return (await import('puppeteer-core')).default
  } catch {
    /* fall through to the DSH profile copy */
  }
  const home = process.env.DSH_HOME
  const profile = process.env.DSH_PROFILE
  if (home !== undefined && profile !== undefined) {
    const slug = home.replace(/\\/g, '/')
    const candidate = `file:///${slug.replace(/^\/+/, '')}/profiles/${profile}/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js`
    if (existsSync(candidate.replace('file:///', ''))) {
      try {
        return (await import(candidate)).default
      } catch {
        /* fall through to the error below */
      }
    }
  }
  console.error('puppeteer-core not found. Run `npm install` in this repository, or run this from a DSH shell.')
  process.exit(2)
}

const puppeteer = await loadPuppeteer()
const pageUrl = new URL('./page.html', import.meta.url).href

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: process.argv.includes('--headed') ? false : true,
  args: ['--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files'],
  defaultViewport: { width: 1200, height: 900 },
})
const page = await browser.newPage()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(`${message.type()}: ${message.text()}`)
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

await page.goto(pageUrl, { waitUntil: 'load', timeout: 30000 })
await page.waitForFunction('typeof window.__runHarness === "function"', { timeout: 10000 })
const outcome = await page.evaluate(async () => await window.__runHarness())

const results = outcome.results ?? []
const failed = results.filter((entry) => !entry.ok)
for (const entry of results) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ok ? '' : `  -> ${JSON.stringify(entry.detail)}`}`)
}
if (!outcome.ok) console.log(`\nHARNESS ERROR: ${outcome.error}`)
if (consoleErrors.length > 0) {
  console.log('\nconsole:')
  for (const line of consoleErrors.slice(0, 20)) console.log('  ' + line)
}
console.log(`\n${results.length - failed.length}/${results.length} passed`)
await browser.close()
process.exit(failed.length === 0 && outcome.ok ? 0 : 1)
