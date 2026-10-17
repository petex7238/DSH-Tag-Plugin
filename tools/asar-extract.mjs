// Minimal ASAR reader: lists or extracts entries from an Electron asar archive.
// usage: node asar-extract.mjs <archive> list <regex> [limit]
//        node asar-extract.mjs <archive> extract <regex> <outDir>
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

const [archive, mode, pattern, extra] = process.argv.slice(2)
if (!archive || !mode || !pattern) {
  console.error('usage: node asar-extract.mjs <archive> list|extract <regex> [outDir]')
  process.exit(2)
}

const buf = readFileSync(archive)
const u32 = (o) => buf.readUInt32LE(o)
const headerPickleSize = u32(4)
const jsonLen = u32(12)
const headerJson = buf.subarray(16, 16 + jsonLen).toString('utf8')
const header = JSON.parse(headerJson)
const dataStart = 8 + headerPickleSize // files are stored relative to here

const re = new RegExp(pattern, 'i')
const out = []
function walk(node, prefix) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const full = prefix ? `${prefix}/${name}` : name
    if (child.files) walk(child, full)
    else if (re.test(full)) {
      const offset = Number(child.offset)
      out.push({ path: full, size: child.size ?? 0, offset: dataStart + offset, unpacked: Boolean(child.unpacked) })
    }
  }
}
walk(header, '')

if (mode === 'list') {
  out.sort((a, b) => a.path.localeCompare(b.path))
  const limit = Number(extra ?? 400)
  for (const e of out.slice(0, limit)) console.log(`${String(e.size).padStart(9)} ${e.unpacked ? 'U' : ' '} ${e.path}`)
  console.log(`\n${out.length} match(es); showing ${Math.min(limit, out.length)}`)
} else if (mode === 'extract') {
  const outDir = extra
  if (!outDir) throw new Error('extract needs an outDir')
  for (const e of out) {
    if (e.unpacked) {
      console.log(`skip (unpacked): ${e.path}`)
      continue
    }
    const dest = join(outDir, e.path.split('/').join(sep))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf.subarray(e.offset, e.offset + e.size))
  }
  console.log(`extracted ${out.filter((e) => !e.unpacked).length} file(s) to ${outDir}`)
} else {
  throw new Error(`unknown mode ${mode}`)
}
