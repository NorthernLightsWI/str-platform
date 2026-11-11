// Core reconcile logic — talks only to ThermostatProvider interface and Supabase admin client.
// Called by the cron route. Also used for dry-run preview.

import { createAdminClient } from "@/lib/supabase/admin"
import { createSeamProvider } from "./seam"
import type { ThermostatProvider } from "./provider"
import { buildPropertyGroups } from "@/lib/property-groups"

const LOOKAHEAD_DAYS = 14

// ── Types ─────────────────────────────────────────────────────────────────────

type ReconcileAction = {
  type         : "create" | "update_end" | "delete" | "skip"
  thermostat_id: string
  booking_id   : string | null
  starts_at    : string
  ends_at      : string
  reason       : string
  seam_schedule_id?: string
}

export type ReconcileResult = {
  property_id    : string
  property_name  : string
  dry_run        : boolean
  actions        : ReconcileAction[]
  errors         : string[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(":").map(Number)
  return { hours: h, minutes: m }
}

/** Build a UTC ISO string from a local date + time + IANA timezone. */
function localToUtc(dateStr: string, timeStr: string, tz: string): string {
  const { hours, minutes } = parseTime(timeStr)
  // Build a string that Intl can resolve in the target TZ, then read back as UTC
  const localStr = `${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`
  // Use a trick: format a known UTC instant in the target TZ and binary-search to find the UTC offset.
  // Simpler: construct the Date using the Temporal-like approach via Date.parse with tz emulation.
  // We use Intl.DateTimeFormat to find the UTC offset.
  const dt = new Date(`${localStr}Z`) // Start with naive UTC parse
  // Find the actual UTC offset for this timezone at this instant
  const tzOffsetMs = getUtcOffsetMs(dt, tz)
  const corrected  = new Date(dt.getTime() - tzOffsetMs)
  return corrected.toISOString()
}

function getUtcOffsetMs(date: Date, tz: string): number {
  // Format the UTC date in the target timezone to get the "local time" representation
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone  : tz,
    year      : "numeric",
    month     : "2-digit",
    day       : "2-digit",
    hour      : "2-digit",
    minute    : "2-digit",
    second    : "2-digit",
    hour12    : false,
  }).formatToParts(date)

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0", 10)
  const localDate = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")))
  return localDate.getTime() - date.getTime()
}

/** Merge overlapping date windows. Input must have string arrival/departure (DATE). */
function mergeWindows(
  bookings: Array<{ arrival: string; departure: string; booking_id: string }>
): Array<{ arrival: string; departure: string; booking_ids: string[] }> {
  if (bookings.length === 0) return []
  const sorted = [...bookings].sort((a, b) => a.arrival.localeCompare(b.arrival))
  const merged: Array<{ arrival: string; departure: string; booking_ids: string[] }> = []
  let cur = { arrival: sorted[0].arrival, departure: sorted[0].departure, booking_ids: [sorted[0].booking_id] }

  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i]
    if (b.arrival <= cur.departure) {
      // Overlapping — extend
      if (b.departure > cur.departure) cur.departure = b.departure
      cur.booking_ids.push(b.booking_id)
    } else {
      merged.push(cur)
      cur = { arrival: b.arrival, departure: b.departure, booking_ids: [b.booking_id] }
    }
  }
  merged.push(cur)
  return merged
}

// ── Main reconcile ─────────────────────────────────────────────────────────────

export async function reconcileAll(forceDryRun = false): Promise<ReconcileResult[]> {
  const admin = createAdminClient()

  // Load master switch
  const { data: masterRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "thermostat_automation_enabled")
    .single()
  const masterEnabled = masterRow?.value === true
  if (!masterEnabled && !forceDryRun) {
    return []
  }

  // Load API key and workspace mode
  const { data: keyRow }  = await admin.from("app_settings").select("value").eq("key", "seam_api_key").single()
  const { data: modeRow } = await admin.from("app_settings").select("value").eq("key", "seam_workspace_mode").single()
  const { data: tzRow }   = await admin.from("app_settings").select("value").eq("key", "thermostat_timezone").single()
  const { data: ciRow }   = await admin.from("app_settings").select("value").eq("key", "default_checkin_time").single()
  const { data: coRow }   = await admin.from("app_settings").select("value").eq("key", "default_checkout_time").single()

  const apiKey   = typeof keyRow?.value  === "string" ? keyRow.value.trim()  : ""
  const tz       = typeof tzRow?.value   === "string" ? tzRow.value          : "America/Chicago"
  const defCiTime = typeof ciRow?.value  === "string" ? ciRow.value          : "16:00:00"
  const defCoTime = typeof coRow?.value  === "string" ? coRow.value          : "11:00:00"
  const workspaceMode = typeof modeRow?.value === "string" ? modeRow.value : "sandbox"

  // Load all visible, active properties with group info and POI
  const { data: propData } = await (admin as any)
    .from("visible_properties")
    .select("id, internal_name, external_name, parent_property_id, is_active")
    .eq("is_active", true)

  if (!propData || propData.length === 0) return []

  // Load POI for check-in/check-out times per property
  const { data: poiData } = await (admin as any)
    .from("visible_property_operational_info")
    .select("property_id, check_in_time, check_out_time")
    .in("property_id", propData.map((p: any) => p.id))

  const poiByProperty = new Map<string, { check_in_time: string; check_out_time: string }>()
  for (const poi of (poiData ?? [])) {
    poiByProperty.set(poi.property_id, {
      check_in_time : poi.check_in_time  ?? defCiTime,
      check_out_time: poi.check_out_time ?? defCoTime,
    })
  }

  // Load thermostat settings for all properties
  const { data: settingsData } = await (admin as any)
    .from("visible_thermostat_settings")
    .select("*")
    .in("property_id", propData.map((p: any) => p.id))

  const settingsByProperty = new Map<string, any>()
  for (const s of (settingsData ?? [])) settingsByProperty.set(s.property_id, s)

  // Load thermostats
  const { data: thermostatData } = await (admin as any)
    .from("visible_thermostats")
    .select("*")
    .in("property_id", propData.map((p: any) => p.id))

  const thermostatsByProperty = new Map<string, any[]>()
  for (const t of (thermostatData ?? [])) {
    const arr = thermostatsByProperty.get(t.property_id) ?? []
    arr.push(t)
    thermostatsByProperty.set(t.property_id, arr)
  }

  // Build property groups to find siblings
  const groups    = buildPropertyGroups(propData as any[])
  const groupAllIds = new Map<string, string[]>()
  for (const g of groups) {
    for (const memberId of g.allIds) groupAllIds.set(memberId, g.allIds)
  }

  // Date range: today → today + LOOKAHEAD_DAYS
  const now     = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const endStr   = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000).toISOString().slice(0, 10)

  // Load bookings for all visible properties in lookahead window
  const { data: bookingData } = await (admin as any)
    .from("visible_bookings")
    .select("id, property_id, arrival, departure")
    .neq("status", "cancelled")
    .eq("is_block", false)
    .lt("arrival", endStr)
    .gt("departure", todayStr)

  const bookingsByProperty = new Map<string, any[]>()
  for (const b of (bookingData ?? [])) {
    const arr = bookingsByProperty.get(b.property_id) ?? []
    arr.push(b)
    bookingsByProperty.set(b.property_id, arr)
  }

  // Load existing thermostat_schedules
  const thermostatIds = (thermostatData ?? []).map((t: any) => t.id)
  const { data: existingSchedules } = thermostatIds.length > 0
    ? await (admin as any)
        .from("visible_thermostat_schedules")
        .select("*")
        .in("thermostat_id", thermostatIds)
        .not("status", "in", '("done","cancelled","failed")')
    : { data: [] }

  const schedulesByThermostat = new Map<string, any[]>()
  for (const s of (existingSchedules ?? [])) {
    const arr = schedulesByThermostat.get(s.thermostat_id) ?? []
    arr.push(s)
    schedulesByThermostat.set(s.thermostat_id, arr)
  }

  // Build Seam provider if we have an API key
  let provider: ThermostatProvider | null = null
  if (apiKey) {
    try { provider = createSeamProvider(apiKey) } catch { /* dry-run still proceeds */ }
  }

  const results: ReconcileResult[] = []

  for (const prop of propData as any[]) {
    const settings = settingsByProperty.get(prop.id)
    if (!settings?.enabled) continue

    const propThermostats = thermostatsByProperty.get(prop.id) ?? []
    if (propThermostats.length === 0) continue

    const isDryRun = forceDryRun || settings.dry_run || !masterEnabled
    const propName = prop.internal_name || prop.external_name

    const result: ReconcileResult = {
      property_id  : prop.id,
      property_name: propName,
      dry_run      : isDryRun,
      actions      : [],
      errors       : [],
    }

    // Gather bookings for the whole group
    const memberIds = groupAllIds.get(prop.id) ?? [prop.id]
    const groupBookings: Array<{ arrival: string; departure: string; booking_id: string }> = []
    for (const memberId of memberIds) {
      for (const b of (bookingsByProperty.get(memberId) ?? [])) {
        groupBookings.push({ arrival: b.arrival, departure: b.departure, booking_id: b.id })
      }
    }

    const windows = mergeWindows(groupBookings)

    for (const thermostat of propThermostats) {
      const existing    = schedulesByThermostat.get(thermostat.id) ?? []
      const wanted: Array<{ starts_at: string; ends_at: string; booking_id: string | null }> = []

      // Build wanted schedule windows
      let prevEndsAt: string | null = null

      for (const window of windows) {
        const poi = poiByProperty.get(prop.id)
        // Check-in time source: POI per property (falls back to app_settings defaults handled above)
        const ciTime = poi?.check_in_time  ?? defCiTime
        const coTime = poi?.check_out_time ?? defCoTime

        const checkInUtc  = localToUtc(window.arrival,   ciTime, tz)
        const checkOutUtc = localToUtc(window.departure,  coTime, tz)

        let startsAt = new Date(checkInUtc).getTime() - settings.warmup_minutes * 60_000
        const endsAt = new Date(checkOutUtc).getTime() + settings.checkout_buffer_minutes * 60_000

        // Clip: don't overlap previous schedule
        if (prevEndsAt !== null) {
          const prevEndMs = new Date(prevEndsAt).getTime()
          if (startsAt < prevEndMs) startsAt = prevEndMs
        }

        // Skip if the window is entirely in the past
        if (endsAt <= now.getTime()) continue

        const startsAtIso = new Date(startsAt).toISOString()
        const endsAtIso   = new Date(endsAt).toISOString()

        wanted.push({
          starts_at : startsAtIso,
          ends_at   : endsAtIso,
          booking_id: window.booking_ids[0] ?? null,
        })

        prevEndsAt = endsAtIso
      }

      // Diff: match by starts_at (Seam constraint: starts_at must be unique per device)
      const existingByStart = new Map(existing.map((s: any) => [s.starts_at as string, s]))
      const wantedByStart   = new Map(wanted.map(w => [w.starts_at, w]))

      // Delete: planned schedules no longer wanted
      for (const [startsAt, s] of existingByStart) {
        if (!wantedByStart.has(startsAt) && s.status === "planned") {
          result.actions.push({
            type             : "delete",
            thermostat_id    : thermostat.id,
            booking_id       : s.booking_id,
            starts_at        : s.starts_at,
            ends_at          : s.ends_at,
            reason           : "No longer in plan",
            seam_schedule_id : s.seam_schedule_id ?? undefined,
          })
        }
      }

      // Active schedules: update end time only if changed
      for (const [startsAt, s] of existingByStart) {
        if (s.status !== "active") continue
        const w = wantedByStart.get(startsAt)
        if (w && w.ends_at !== s.ends_at) {
          result.actions.push({
            type         : "update_end",
            thermostat_id: thermostat.id,
            booking_id   : s.booking_id,
            starts_at    : s.starts_at,
            ends_at      : w.ends_at,
            reason       : "End time changed",
            seam_schedule_id: s.seam_schedule_id ?? undefined,
          })
        }
      }

      // Create: wanted schedules not in DB
      for (const [startsAt, w] of wantedByStart) {
        if (!existingByStart.has(startsAt)) {
          result.actions.push({
            type         : "create",
            thermostat_id: thermostat.id,
            booking_id   : w.booking_id,
            starts_at    : w.starts_at,
            ends_at      : w.ends_at,
            reason       : "New schedule",
          })
        }
      }

      // Execute actions (or just log them in dry-run)
      for (const action of result.actions) {
        if (action.thermostat_id !== thermostat.id) continue

        const logEntry = {
          property_id  : prop.id,
          thermostat_id: thermostat.id,
          action       : action.type,
          request      : { starts_at: action.starts_at, ends_at: action.ends_at, booking_id: action.booking_id },
          response     : null as any,
          source       : "cron" as const,
        }

        if (isDryRun || !provider) {
          // Dry-run: write planned event, no Seam call
          await (admin as any).from("thermostat_events").insert({
            ...logEntry,
            response: { dry_run: true, action: action.type, reason: action.reason },
          })

          if (action.type === "create") {
            await (admin as any).from("thermostat_schedules").insert({
              property_id  : prop.id,
              thermostat_id: thermostat.id,
              booking_id   : action.booking_id,
              starts_at    : action.starts_at,
              ends_at      : action.ends_at,
              status       : "planned",
            })
          }

          // Log to sync_log per CONVENTIONS
          await admin.from("sync_log").insert({
            property_id   : prop.id,
            sync_type     : "thermostat_write",
            status        : "success",
            records_synced: 0,
            metadata      : { dry_run: true, action: action.type, thermostat_id: thermostat.id },
          })

          continue
        }

        // Live execution
        try {
          if (action.type === "create") {
            if (!provider) continue
            const seamId = await provider.createSchedule({
              device_id         : thermostat.seam_device_id,
              climate_preset_key: "occupied",
              starts_at         : action.starts_at,
              ends_at           : action.ends_at,
              name              : `Booking ${action.booking_id ?? ""}`,
            })
            await (admin as any).from("thermostat_schedules").insert({
              property_id    : prop.id,
              thermostat_id  : thermostat.id,
              booking_id     : action.booking_id,
              seam_schedule_id: seamId,
              starts_at      : action.starts_at,
              ends_at        : action.ends_at,
              status         : "planned",
            })
            logEntry.response = { seam_schedule_id: seamId }
          } else if (action.type === "delete" && action.seam_schedule_id) {
            await provider.deleteSchedule(action.seam_schedule_id)
            await (admin as any).from("thermostat_schedules")
              .update({ status: "cancelled" })
              .eq("seam_schedule_id", action.seam_schedule_id)
            logEntry.response = { deleted: action.seam_schedule_id }
          } else if (action.type === "update_end" && action.seam_schedule_id) {
            await (admin as any).from("thermostat_schedules")
              .update({ ends_at: action.ends_at })
              .eq("seam_schedule_id", action.seam_schedule_id)
            logEntry.response = { updated_ends_at: action.ends_at }
          }

          await (admin as any).from("thermostat_events").insert(logEntry)
          await admin.from("sync_log").insert({
            property_id   : prop.id,
            sync_type     : "thermostat_write",
            status        : "success",
            records_synced: 1,
            metadata      : { action: action.type, thermostat_id: thermostat.id, workspace_mode: workspaceMode },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          result.errors.push(`${action.type} failed: ${msg}`)
          await (admin as any).from("thermostat_events").insert({
            ...logEntry,
            response: { error: msg },
          })
          await admin.from("sync_log").insert({
            property_id  : prop.id,
            sync_type    : "thermostat_write",
            status       : "error",
            error_message: msg,
            metadata     : { action: action.type, thermostat_id: thermostat.id },
          })
        }
      }
    }

    results.push(result)
  }

  return results
}
