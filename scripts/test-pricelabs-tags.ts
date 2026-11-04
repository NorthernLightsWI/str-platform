// Run: npx tsx scripts/test-pricelabs-tags.ts
//
// Verifies parsePlTags() handles every shape the PriceLabs GET /v1/listings
// endpoint can return for the `tags` field:
//   - null / undefined   → []
//   - ""                 → []
//   - "single"           → ["single"]
//   - "a,b, c"           → ["a","b","c"]   (comma-separated string from GET)
//   - ["a","b"]          → ["a","b"]       (array — POST response or future change)
//   - ["  spaced  ","x"] → ["spaced","x"]  (array with whitespace)

import { parsePlTags } from "../lib/pricelabs"

const cases: Array<{ label: string; input: unknown; want: string[] }> = [
  { label: "null",                  input: null,                     want: []                   },
  { label: "undefined",             input: undefined,                want: []                   },
  { label: "empty string",          input: "",                       want: []                   },
  { label: "one string",            input: "single-tag",             want: ["single-tag"]       },
  { label: "comma-separated",       input: "tag1,tag2, tag3 , tag4", want: ["tag1","tag2","tag3","tag4"] },
  { label: "array",                 input: ["tag-a","tag-b","tag-c"],want: ["tag-a","tag-b","tag-c"]     },
  { label: "array with whitespace", input: ["  spaced  ","normal"],  want: ["spaced","normal"]  },
  { label: "array with numbers",    input: [1, 2, "three"],          want: ["1","2","three"]    },
]

let passed = 0
let failed = 0

for (const { label, input, want } of cases) {
  const got    = parsePlTags(input)
  const ok     = JSON.stringify(got) === JSON.stringify(want)
  const status = ok ? "PASS" : "FAIL"
  if (ok) passed++; else failed++
  console.log(`${status}  ${label.padEnd(26)} got=${JSON.stringify(got)}${ok ? "" : `  want=${JSON.stringify(want)}`}`)
}

console.log(`\n${passed}/${passed + failed} passed`)
if (failed > 0) process.exit(1)
