#!/usr/bin/env node
// Run: node scripts/check-visibility.mjs
//
// Fails if any TypeScript/JavaScript source file reads a raw property-scoped
// table directly (e.g. .from("bookings")) instead of going through a
// visible_* view, unless the file is in scripts/visibility-allowlist.json.
//
// Usage in CI: node scripts/check-visibility.mjs
// Output format on failure: file:line: raw table access to "<table>"

import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"
import { fileURLToPath } from "url"

const root   = join(fileURLToPath(import.meta.url), "../..")
const config = JSON.parse(readFileSync(join(root, "scripts/visibility-allowlist.json"), "utf8"))

const PROPERTY_SCOPED_TABLES = [
  "bookings",
  "pricing",
  "occupancy_snapshots",
  "reviews",
  "market_data",
  "community_insights",
  "recommendations",
  "alert_settings",
  "alert_history",
  "sync_log",
  "cleaning_records",
  "maintenance_issues",
  "property_operational_info",
  "vendor_contacts",
  "property_info_changelog",
  "recurring_maintenance",
  "tasks",
  "property_amenities",
  "listing_changes",
  "proposed_changes",
]

// Regex: .from("table") or .from('table') — catches both quote styles
const TABLE_PATTERN = new RegExp(
  `\\.from\\(["'](${PROPERTY_SCOPED_TABLES.join("|")})["']\\)`,
  "g",
)

function isAllowlisted(relPath) {
  const normalized = relPath.replace(/\\/g, "/")
  if (config.files.some(f => normalized === f)) return true
  if (config.prefixes.some(p => normalized.startsWith(p))) return true
  return false
}

function walkDir(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === ".claude") continue
    const full = join(dir, entry)
    const st   = statSync(full)
    if (st.isDirectory()) {
      walkDir(full, out)
    } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const files      = walkDir(root)
const violations = []

for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/")
  if (isAllowlisted(rel)) continue

  const src   = readFileSync(file, "utf8")
  const lines = src.split("\n")

  for (let i = 0; i < lines.length; i++) {
    TABLE_PATTERN.lastIndex = 0
    let m
    while ((m = TABLE_PATTERN.exec(lines[i])) !== null) {
      // Look at this line + next 3 lines to find the first chained method after .from("table")
      const window    = lines.slice(i, Math.min(i + 4, lines.length)).join(" ")
      const fromToken = `.from("${m[1]}")`
      const afterFrom = window.slice(window.indexOf(fromToken) + fromToken.length)
      const firstWrite = afterFrom.search(/\.(insert|update|delete|upsert)\(/)
      const firstRead  = afterFrom.search(/\.select\(/)
      // Skip confirmed writes: write method appears before any SELECT
      if (firstWrite >= 0 && (firstRead < 0 || firstWrite < firstRead)) continue
      violations.push(`${rel}:${i + 1}: raw table access to "${m[1]}" — use visible_${m[1]} or add to allowlist`)
    }
  }
}

if (violations.length === 0) {
  console.log("check-visibility: OK — no raw property-scoped table accesses found outside allowlist")
  process.exit(0)
} else {
  console.error(`check-visibility: FAIL — ${violations.length} violation(s):\n`)
  for (const v of violations) console.error("  " + v)
  console.error("\nFix: replace .from(\"<table>\") with .from(\"visible_<table>\") or add the file to scripts/visibility-allowlist.json")
  process.exit(1)
}
