// Runs the dsh-code-marks harness page in headless Chrome and prints the results.
// usage: node run.mjs [--headed]
import puppeteer from 'file:///E:/DSHarness/.dsh/profiles/desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'

const page_url = 'file:///E:/%E6%96%87%E4%BB%B6/DSH%20%E6%8F%92%E4%BB%B6%E8%AE%BE%E8%AE%A1/tools/harness/page.html'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

await page.goto(page_url, { waitUntil: 'load', timeout: 30000 })
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
