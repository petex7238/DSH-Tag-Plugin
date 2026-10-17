// Keeps the local development mirror pointing at the real package files.
//
// Why this exists: a running DSH host caches each plugin's resolved package
// path until it restarts. This repository used to live in `dsh-code-marks/`,
// so a `dsh-code-marks/` directory is kept at the repo root for hosts that
// still resolve there. That directory is gitignored and is NOT part of the
// repo — delete it after the next DSH restart.
//
// The mirror is not a copy: every file is a **hard link** to the real one, so
// one physical file has two names and edits never drift. (A copy would mean
// running the tool after every change, which is exactly the bug this avoids.)
//
// usage: node tools/sync-dev-mirror.mjs
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mirror = join(repo, 'dsh-code-marks')

if (!existsSync(mirror)) {
  console.log('no mirror directory; nothing to do (that is the normal state).')
  process.exit(0)
}

const files = [
  ['package.json', 'package.json'],
  ['cordis.patch.yml', 'cordis.patch.yml'],
  [join('plugin', 'index.mjs'), join('plugin', 'index.mjs')],
  [join('plugin', 'client.js'), join('plugin', 'client.js')],
]

const sameFile = (left, right) => {
  try {
    const a = statSync(left)
    const b = statSync(right)
    return a.ino !== 0 && a.ino === b.ino && a.dev === b.dev
  } catch {
    return false
  }
}

for (const [from, to] of files) {
  const source = join(repo, from)
  const target = join(mirror, to)
  if (!existsSync(source)) {
    console.error(`missing source: ${from}`)
    process.exit(1)
  }
  if (sameFile(source, target)) {
    console.log(`linked   ${from}  (already one physical file)`)
    continue
  }
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) rmSync(target, { force: true })
  try {
    linkSync(source, target)
    console.log(`linked   ${from}  -> dsh-code-marks/${to}`)
  } catch (error) {
    // A hard link needs the same volume; fall back to a copy on mismatch.
    copyFileSync(source, target)
    console.log(`copied   ${from}  -> dsh-code-marks/${to}  (${error.code}; re-run after edits)`)
  }
}

const linked = files.every(([from, to]) => sameFile(join(repo, from), join(mirror, to)))
console.log(linked ? '\nmirror is hard-linked to the package: edits apply to both paths.' : '\nmirror is a copy; re-run this after editing.')
