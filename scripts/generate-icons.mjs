/**
 * Generates all PWA icons from scripts/source-icon.png.
 * Run: node scripts/generate-icons.mjs
 *
 * To update icons with a new source image, replace scripts/source-icon.png
 * (must be at least 512×512, square, PNG) then re-run this script.
 */
import sharp from "sharp"
import { mkdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = join(__dirname, "..")
const iconsDir  = join(root, "public", "icons")
const src       = join(__dirname, "source-icon.png")

mkdirSync(iconsDir, { recursive: true })

// ── PNG icons ─────────────────────────────────────────────────────────────────
const PNG_TARGETS = [
  { out: join(iconsDir, "icon-512.png"),                 size: 512 },
  { out: join(iconsDir, "icon-192.png"),                 size: 192 },
  { out: join(iconsDir, "icon-32.png"),                  size: 32  },
  { out: join(root, "public", "apple-touch-icon.png"),   size: 180 },
]

for (const { out, size } of PNG_TARGETS) {
  await sharp(src).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
  console.log("  ✓", out.replace(root + "\\", "").replace(root + "/", ""))
}

// ── favicon.ico — ICO container embedding the 32×32 PNG ──────────────────────
const pngBuf   = await sharp(src).resize(32, 32).png().toBuffer()
const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0)   // reserved
icoHeader.writeUInt16LE(1, 2)   // type = ICO
icoHeader.writeUInt16LE(1, 4)   // image count = 1

const icoEntry = Buffer.alloc(16)
icoEntry.writeUInt8(32,             0)  // width
icoEntry.writeUInt8(32,             1)  // height
icoEntry.writeUInt8(0,              2)  // color count
icoEntry.writeUInt8(0,              3)  // reserved
icoEntry.writeUInt16LE(1,           4)  // planes
icoEntry.writeUInt16LE(32,          6)  // bit count
icoEntry.writeUInt32LE(pngBuf.length, 8)  // size of image data
icoEntry.writeUInt32LE(22,         12)  // offset = 6 (header) + 16 (entry)

writeFileSync(
  join(root, "public", "favicon.ico"),
  Buffer.concat([icoHeader, icoEntry, pngBuf]),
)
console.log("  ✓ public/favicon.ico")
console.log("\nAll icons generated.")
