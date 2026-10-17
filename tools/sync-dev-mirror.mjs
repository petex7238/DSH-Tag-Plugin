// Keeps the local development mirror in sync with the real package.
//
// Why this exists: a running DSH host caches each plugin's resolved package
// path until it restarts. This repository used to live in `dsh-code-marks/`,
// so a `dsh-code-marks/` directory containing the package files is kept at the
// repo root as a bridge for hosts that still point there. That directory is
// gitignored; it is NOT part of the repo and should be deleted after the next
// DSH restart, at which point this script has nothing to do.
//
// usage: node tools/sync-dev-mirror.mjs
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mirror = join(repo, 'dsh-code-marks')

if (!existsSync(mirror)) {
  console.log('no mirror directory; nothing to sync (that is the normal state).')
  process.exit(0)
}

const files = [
  ['package.json', 'package.json'],
  ['cordis.patch.yml', 'cordis.patch.yml'],
  [join('plugin', 'index.mjs'), join('plugin', 'index.mjs')],
  [join('plugin', 'client.js'), join('plugin', 'client.js')],
]

for (const [from, to] of files) {
  const source = join(repo, from)
  const target = join(mirror, to)
  if (!existsSync(source)) {
    console.error(`missing source: ${from}`)
    process.exit(1)
  }
  copyFileSync(source, target)
  console.log(`synced ${from} -> dsh-code-marks/${to} (${statSync(source).size} B)`)
}
console.log('\nmirror in sync; reload the DSH page (F5) to pick it up.')
