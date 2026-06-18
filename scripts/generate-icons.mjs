/**
 * Generates PWA icons using sharp + inline SVG.
 * Run once: node scripts/generate-icons.mjs
 */
import sharp from "sharp"
import { mkdirSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root      = join(__dirname, "..")
const iconsDir  = join(root, "public", "icons")
mkdirSync(iconsDir, { recursive: true })

const BG    = "#0A0D10"
const CORAL = "#E88159"
const TEAL  = "#6FA1AF"

function houseSvg(size) {
  // All coordinates are in a 100×100 viewBox, scaled to `size`.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <!-- Background -->
  <rect width="100" height="100" fill="${BG}" rx="${size >= 192 ? 18 : 8}"/>
  <!-- Chimney -->
  <rect x="60" y="20" width="8" height="16" fill="${CORAL}" rx="1"/>
  <!-- Roof -->
  <polygon points="10,55 50,14 90,55" fill="${CORAL}"/>
  <!-- House body -->
  <rect x="18" y="53" width="64" height="37" fill="${CORAL}" rx="2"/>
  <!-- Left window -->
  <rect x="22" y="59" width="15" height="12" fill="${TEAL}" rx="1.5"/>
  <!-- Right window -->
  <rect x="63" y="59" width="15" height="12" fill="${TEAL}" rx="1.5"/>
  <!-- Door -->
  <rect x="41" y="68" width="18" height="22" fill="${TEAL}" rx="2"/>
  <!-- Door knob -->
  <circle cx="56" cy="79" r="1.5" fill="${CORAL}"/>
</svg>`
}

async function gen(svgStr, outPath) {
  await sharp(Buffer.from(svgStr)).png({ compressionLevel: 9 }).toFile(outPath)
  console.log("  ✓", outPath.replace(root + "\\", "").replace(root + "/", ""))
}

// ── PNG icons ─────────────────────────────────────────────────────────────────
await gen(houseSvg(512), join(iconsDir, "icon-512.png"))
await gen(houseSvg(192), join(iconsDir, "icon-192.png"))
await gen(houseSvg(180), join(root, "public", "apple-touch-icon.png"))

// ── favicon.ico — ICO container with embedded 32×32 PNG ───────────────────────
const pngBuf = await sharp(Buffer.from(houseSvg(32))).png().toBuffer()
const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0)   // reserved
icoHeader.writeUInt16LE(1, 2)   // type = ICO
icoHeader.writeUInt16LE(1, 4)   // image count = 1

const icoEntry = Buffer.alloc(16)
icoEntry.writeUInt8(32,            0)  // width
icoEntry.writeUInt8(32,            1)  // height
icoEntry.writeUInt8(0,             2)  // color count
icoEntry.writeUInt8(0,             3)  // reserved
icoEntry.writeUInt16LE(1,          4)  // planes
icoEntry.writeUInt16LE(32,         6)  // bit count
icoEntry.writeUInt32LE(pngBuf.length, 8) // size of image data
icoEntry.writeUInt32LE(22,        12)  // offset = 6 + 16

writeFileSync(join(root, "public", "favicon.ico"), Buffer.concat([icoHeader, icoEntry, pngBuf]))
console.log("  ✓ public/favicon.ico")

console.log("\nAll icons generated.")
