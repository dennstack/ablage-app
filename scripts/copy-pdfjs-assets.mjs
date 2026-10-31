// pdf.js needs wasm decoders (JPX/JBIG2 scans), CMaps and standard fonts at runtime.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = dirname(require.resolve('pdfjs-dist/package.json'))
const target = join(import.meta.dirname, '..', 'src', 'renderer', 'public', 'pdfjs')

mkdirSync(target, { recursive: true })
for (const dir of ['wasm', 'cmaps', 'standard_fonts']) {
  cpSync(join(pkg, dir), join(target, dir), { recursive: true })
}
console.log(`pdf.js assets copied to ${target}`)
