import { createAdminClient } from "@/lib/supabase/admin"
import {
  fetchProperties,
  fetchBookings,
  type OwnerRezCredentials,
} from "@/lib/integrations/ownerrez"

// ── Status normaliser ─────────────────────────────────────────────────────────

type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed"

const STATUS_MAP: Record<string, BookingStatus> = {
  inquiry    : "pending",
  tentative  : "pending",
  reserved   : "confirmed",
  booked     : "confirmed",
  confirmed  : "confirmed",
  cancelled  : "cancelled",
  canceled   : "cancelled",
  completed  : "completed",
  checked_out: "completed",
}

function normaliseStatus(raw: string): BookingStatus {
  return STATUS_MAP[raw.toLowerCase()] ?? "confirmed"
}

// ── Core sync function ────────────────────────────────────────────────────────

export type SyncResult = {
  propertiesSynced : number
  bookingsSynced   : number
}

export async function runOwnerRezSync(): Promise<SyncResult> {
  const supabase   = createAdminClient()
  const startedAt  = new Date().toISOString()

  // Read credentials from app_settings
  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")

  const NEEDED = new Set(["ownerrez_email", "ownerrez_api_token", "ownerrez_owner_id"])
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) {
    if (!NEEDED.has(row.key)) continue
    try { settings[row.key] = JSON.parse(row.value as string) } catch { settings[row.key] = row.value as string }
  }

  const creds: OwnerRezCredentials = {
    email    : settings.ownerrez_email,
    apiToken : settings.ownerrez_api_token,
  }

  if (!creds.email || !creds.apiToken) {
    throw new Error("ownerrez_email and ownerrez_api_token must be set in app_settings")
  }

  // Resolve owner profile UUID
  let ownerId: string = settings.ownerrez_owner_id
  if (!ownerId) {
    const { data: admin } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .single()

    if (!admin) throw new Error("No admin profile found")
    ownerId = admin.id
  }

  // Open sync log entry
  const { data: syncEntry } = await supabase
    .from("sync_log")
    .insert({ sync_type: "full", status: "running", started_at: startedAt })
    .select("id")
    .single()

  const syncId = syncEntry?.id
  let propertiesSynced = 0
  let bookingsSynced   = 0

  try {
    // Properties
    const orProperties = await fetchProperties(creds)

    const propertyRows = orProperties.map((p) => ({
      ownerrez_id   : String(p.id),
      owner_id      : ownerId,
      external_name : p.external_name,
      internal_name : p.name,
      max_guests    : p.max_guests,
      public_url    : p.public_url,
      thumbnail_url : p.thumbnail_url,
      description   : p.description   ?? null,
      photo_count   : p.photos?.length ?? null,
      bedrooms      : p.bedrooms,
      bathrooms     : p.bathrooms != null ? Number(p.bathrooms) : null,
      address       : p.address?.street     ?? null,
      city          : p.address?.city       ?? null,
      state         : p.address?.state      ?? null,
      zip           : p.address?.postal_code ?? null,
      country       : p.address?.country    ?? "US",
      is_active     : p.active && !p.is_snoozed,
    }))

    const { error: propErr } = await (supabase as any)
      .from("properties")
      .upsert(propertyRows, { onConflict: "ownerrez_id" })
    if (propErr) throw propErr
    propertiesSynced = propertyRows.length

    const orPropertyIds = orProperties.map((p) => String(p.id))

    const { data: uuidRows } = await supabase
      .from("properties")
      .select("id, ownerrez_id")
      .in("ownerrez_id", orPropertyIds)

    const propertyIdMap = new Map(
      (uuidRows ?? []).map((r) => [r.ownerrez_id!, r.id] as const),
    )

    // Bookings
    const orBookings = await fetchBookings(creds, orPropertyIds)

    const bookingRows = orBookings
      .map((b) => {
        const propertyUuid = propertyIdMap.get(String(b.property_id))
        if (!propertyUuid) return null
        return {
          ownerrez_id  : String(b.id),
          property_id  : propertyUuid,
          arrival      : b.arrival,
          departure    : b.departure,
          total_amount : b.total_amount,
          listing_site : b.listing_site,
          status       : normaliseStatus(b.status),
          is_block     : false,
          num_guests   : (b.adults ?? 0) + (b.children ?? 0) || null,
          guest_name   : b.guest
            ? `${b.guest.first_name} ${b.guest.last_name}`.trim()
            : null,
          guest_email  : b.guest?.email  ?? null,
          guest_phone  : b.guest?.phone  ?? null,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const { error: bookingErr } = await supabase
      .from("bookings")
      .upsert(bookingRows, { onConflict: "ownerrez_id" })
    if (bookingErr) throw bookingErr
    bookingsSynced = bookingRows.length

    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status         : "success",
          records_synced : propertiesSynced + bookingsSynced,
          records_failed : 0,
          completed_at   : new Date().toISOString(),
        })
        .eq("id", syncId)
    }

    return { propertiesSynced, bookingsSynced }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status         : "error",
          error_message  : message,
          records_synced : propertiesSynced + bookingsSynced,
          completed_at   : new Date().toISOString(),
        })
        .eq("id", syncId)
    }

    throw err
  }
}
