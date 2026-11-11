/**
 * Seam sandbox end-to-end test.
 *
 * Run:
 *   npx ts-node --project tsconfig.json scripts/thermostat-sandbox-test.ts
 *   # or:
 *   SEAM_API_KEY=seam_test_... npx tsx scripts/thermostat-sandbox-test.ts
 *
 * Requires SEAM_API_KEY in environment (sandbox key from console.seam.co).
 * Also needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for DB reads
 * when checking existing app_settings (optional — script reads env directly too).
 */

import { Seam } from "seam"
import { SeamThermostatProvider } from "../lib/thermostat/seam"

const SEP = "─".repeat(60)

function log(label: string, value: unknown) {
  console.log(`\n${label}:`)
  console.log(JSON.stringify(value, null, 2))
}

async function main() {
  // ── 1. Resolve API key ───────────────────────────────────────────────────────
  let apiKey = process.env.SEAM_API_KEY ?? ""

  if (!apiKey) {
    // Try reading from Supabase app_settings if DB env vars are present
    const url     = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && svcKey) {
      try {
        const { createClient } = await import("@supabase/supabase-js")
        const admin = createClient(url, svcKey, { auth: { persistSession: false } })
        const { data } = await admin.from("app_settings").select("value").eq("key", "seam_api_key").single()
        apiKey = typeof data?.value === "string" ? data.value.trim() : ""
      } catch {
        // ignore
      }
    }
  }

  if (!apiKey) {
    console.error(`
MISSING: SEAM_API_KEY environment variable (or seam_api_key in app_settings).

To run this test:
  1. Create a free sandbox workspace at console.seam.co
  2. Copy the sandbox API key
  3. Run:  SEAM_API_KEY=seam_test_... npx tsx scripts/thermostat-sandbox-test.ts
  4. OR:   Save the key in Settings → Thermostats → Seam Connection, then run again.
`)
    process.exit(1)
  }

  console.log(SEP)
  console.log("Seam Sandbox End-to-End Test")
  console.log(SEP)
  console.log(`API key: ${apiKey.slice(0, 16)}…`)

  const raw      = new Seam(apiKey)
  const provider = new SeamThermostatProvider(apiKey)

  // ── 2. List devices already in the sandbox workspace ────────────────────────
  console.log(`\n${SEP}\nStep 1 — List existing thermostat devices\n${SEP}`)
  const devices = await provider.listDevices()
  log("Devices found", devices.map(d => ({ id: d.seam_device_id, name: d.display_name, type: d.device_type, online: d.online })))

  if (devices.length === 0) {
    console.log(`
No thermostats in sandbox workspace yet.
In the Seam Console (sandbox), connect a test account such as:
  - ecobee test account: user1@example.com / 1234
  - Nest test account:   user1@example.com / 1234
Then re-run this script.
`)
    process.exit(0)
  }

  const device = devices[0]
  const deviceId = device.seam_device_id
  console.log(`\nUsing device: ${device.display_name} (${deviceId})`)

  // ── 3. Get device state ──────────────────────────────────────────────────────
  console.log(`\n${SEP}\nStep 2 — Get device state\n${SEP}`)
  const state = await provider.getState(deviceId)
  log("State", state)

  // ── 4. Ensure climate presets ────────────────────────────────────────────────
  console.log(`\n${SEP}\nStep 3 — Ensure occupied + vacant presets\n${SEP}`)
  await provider.ensurePresets({
    device_id    : deviceId,
    occupied_heat: 68,
    occupied_cool: 74,
    vacant_heat  : 58,
    vacant_cool  : 82,
    freeze_floor : 55,
  })
  console.log("ensurePresets() completed without error.")

  // Verify presets are on the device
  const afterPresets = await raw.devices.get({ device_id: deviceId })
  const presets = (afterPresets.properties as any)?.available_climate_presets ?? []
  log("Available presets after ensurePresets", presets.map((p: any) => ({ key: p.climate_preset_key, name: p.name })))

  // ── 5. Activate vacant preset ────────────────────────────────────────────────
  console.log(`\n${SEP}\nStep 4 — Activate 'vacant' preset\n${SEP}`)
  await provider.setPreset(deviceId, "vacant")
  console.log("setPreset('vacant') completed.")

  const afterActivate = await provider.getState(deviceId)
  log("State after activate", afterActivate)

  // ── 6. Create a thermostat schedule ──────────────────────────────────────────
  console.log(`\n${SEP}\nStep 5 — Create a schedule (occupied, 2 days from now)\n${SEP}`)
  const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const endsAt   = new Date(Date.now() + 5 * 86_400_000).toISOString()

  const seamScheduleId = await provider.createSchedule({
    device_id         : deviceId,
    climate_preset_key: "occupied",
    starts_at         : startsAt,
    ends_at           : endsAt,
    name              : "Sandbox test schedule",
  })
  log("Created schedule", { seamScheduleId, startsAt, endsAt })

  // ── 7. List schedules ─────────────────────────────────────────────────────────
  console.log(`\n${SEP}\nStep 6 — List schedules\n${SEP}`)
  const schedules = await raw.thermostats.schedules.list({ device_id: deviceId })
  log("Schedules", schedules.map((s: any) => ({
    id    : s.thermostat_schedule_id,
    preset: s.climate_preset_key,
    start : s.starts_at,
    end   : s.ends_at,
  })))

  // ── 8. Delete the schedule ────────────────────────────────────────────────────
  console.log(`\n${SEP}\nStep 7 — Delete the test schedule\n${SEP}`)
  await provider.deleteSchedule(seamScheduleId)
  console.log(`Deleted schedule ${seamScheduleId}`)

  const afterDelete = await raw.thermostats.schedules.list({ device_id: deviceId })
  log("Schedules after delete", afterDelete.map((s: any) => ({ id: s.thermostat_schedule_id })))

  console.log(`\n${SEP}`)
  console.log("ALL TESTS PASSED ✓")
  console.log(SEP)
}

main().catch(err => {
  console.error("\nTEST FAILED:", err)
  process.exit(1)
})
