// Read-only DOM probe against the running DSH web GUI.
// usage: node probe-dom.mjs [url] [outJson]
import puppeteer from 'file:///E:/DSHarness/.dsh/profiles/desktop/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js'
import { writeFileSync } from 'node:fs'

const url = process.argv[2] ?? 'http://127.0.0.1:19387/'
const out = process.argv[3] ?? 'E:\\文件\\DSH 插件设计\\tmp\\dom-probe.json'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
})
const page = await browser.newPage()
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await new Promise((r) => setTimeout(r, 6000))

const report = await page.evaluate(() => {
  const attrCount = new Map()
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.getAttributeNames()) {
      if (!a.startsWith('data-')) continue
      attrCount.set(a, (attrCount.get(a) ?? 0) + 1)
    }
  }
  const scrollables = []
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight - el.clientHeight > 40) {
      scrollables.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 120),
        data: [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`).join(' '),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        children: el.children.length,
      })
    }
  }
  const pre = document.querySelector('pre')
  const code = document.querySelector('code')
  return {
    title: document.title,
    url: location.href,
    bodyDataAttrs: [...document.body.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`),
    htmlDataAttrs: [...document.documentElement.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`),
    topDataAttributes: [...attrCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    scrollables: scrollables.slice(0, 12),
    preSample: pre ? pre.outerHTML.slice(0, 600) : null,
    codeSample: code ? code.outerHTML.slice(0, 400) : null,
    preCount: document.querySelectorAll('pre').length,
    userSelectOnPre: pre ? getComputedStyle(pre).userSelect : null,
    highlights: typeof CSS !== 'undefined' && 'highlights' in CSS,
    messageCandidates: [...document.querySelectorAll('[data-event-seq],[data-seq],[data-message-id],[data-turn]')].slice(0, 5).map((el) => ({
      tag: el.tagName.toLowerCase(),
      attrs: [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `${a.name}=${a.value}`),
      cls: String(el.className).slice(0, 80),
    })),
  }
})

writeFileSync(out, JSON.stringify({ report, logs: logs.slice(-40) }, null, 2), 'utf8')
await browser.close()
console.log('written', out)
