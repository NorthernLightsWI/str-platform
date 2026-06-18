import { createAdminClient } from "@/lib/supabase/admin"
import { AMENITIES }         from "@/lib/amenities"
import type { OwnerRezCredentials } from "@/lib/integrations/ownerrez"

const BETWEEN_PROPERTIES_MS = 1_500
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── OwnerRez listing shape (defensive) ────────────────────────────────────────

interface ListingAmenityItem {
  id?    : number
  key?   : string
  name?  : string
  label? : string
  value? : string
  title? : string
  text?  : string
}

// ── Name → internal key map ───────────────────────────────────────────────────
// Keys are lowercase. Checked via `rawName.toLowerCase().includes(mapKey)`.

const OR_NAME_MAP: Record<string, string> = {
  // Connectivity
  "wireless internet"          : "wifi",
  "internet / wifi"            : "wifi",
  "wifi"                       : "wifi",
  "wi-fi"                      : "wifi",
  "internet"                   : "wifi",
  "high speed internet"        : "high_speed_wifi",
  "high-speed internet"        : "high_speed_wifi",
  "gigabit"                    : "high_speed_wifi",
  "fiber"                      : "high_speed_wifi",
  "fast wifi"                  : "high_speed_wifi",
  "500 mbps"                   : "high_speed_wifi",
  "laptop friendly workspace"  : "dedicated_workspace",
  "dedicated workspace"        : "dedicated_workspace",
  "home office"                : "dedicated_workspace",
  "workspace"                  : "dedicated_workspace",
  "smart tv"                   : "smart_tv",
  "cable tv"                   : "smart_tv",
  "television"                 : "smart_tv",
  // Kitchen
  "full kitchen"               : "full_kitchen",
  "kitchen"                    : "full_kitchen",
  "kitchenette"                : "full_kitchen",
  "coffee maker"               : "coffee_maker",
  "coffee machine"             : "coffee_maker",
  "keurig"                     : "coffee_maker",
  "nespresso"                  : "coffee_maker",
  "dishwasher"                 : "dishwasher",
  "microwave"                  : "microwave",
  "refrigerator"               : "refrigerator",
  "fridge"                     : "refrigerator",
  "cooking basics"             : "cooking_basics",
  "pots and pans"              : "cooking_basics",
  "pots & pans"                : "cooking_basics",
  "dishes & utensils"          : "cooking_basics",
  "cooking utensils"           : "cooking_basics",
  // Laundry
  "washing machine"            : "washer",
  "washer"                     : "washer",
  "clothes dryer"              : "dryer",
  "dryer"                      : "dryer",
  "iron and board"             : "iron_board",
  "iron & board"               : "iron_board",
  "iron board"                 : "iron_board",
  // Bedroom & Bath
  "extra pillows and blankets" : "extra_bedding",
  "extra pillows"              : "extra_bedding",
  "extra blankets"             : "extra_bedding",
  "blackout curtains"          : "blackout_curtains",
  "blackout shades"            : "blackout_curtains",
  "room darkening"             : "blackout_curtains",
  "hair dryer"                 : "hair_dryer",
  "shampoo"                    : "shampoo_toiletries",
  "body wash"                  : "shampoo_toiletries",
  "toiletries"                 : "shampoo_toiletries",
  "hot water"                  : "hot_water",
  // Entertainment
  "streaming"                  : "streaming_services",
  "netflix"                    : "streaming_services",
  "hulu"                       : "streaming_services",
  "amazon prime"               : "streaming_services",
  "disney+"                    : "streaming_services",
  "game console"               : "game_console",
  "xbox"                       : "game_console",
  "playstation"                : "game_console",
  "nintendo"                   : "game_console",
  "board games"                : "board_games",
  "puzzles"                    : "board_games",
  "bluetooth speaker"          : "bluetooth_speaker",
  "speaker"                    : "bluetooth_speaker",
  // Climate
  "air conditioning"           : "air_conditioning",
  "central air"                : "air_conditioning",
  "a/c"                        : "air_conditioning",
  "central heating"            : "heating",
  "central heat"               : "heating",
  "heat"                       : "heating",
  "ceiling fans"               : "ceiling_fan",
  "ceiling fan"                : "ceiling_fan",
  "space heater"               : "space_heater",
  "portable heater"            : "space_heater",
  // Parking & Access
  "free parking on premises"   : "free_parking",
  "free parking"               : "free_parking",
  "parking"                    : "free_parking",
  "driveway"                   : "free_parking",
  "garage parking"             : "garage_parking",
  "garage"                     : "garage_parking",
  "covered parking"            : "garage_parking",
  "ev charger"                 : "ev_charger",
  "electric vehicle"           : "ev_charger",
  "self check-in"              : "keyless_entry",
  "self checkin"               : "keyless_entry",
  "keyless entry"              : "keyless_entry",
  "keypad"                     : "keyless_entry",
  "smart lock"                 : "keyless_entry",
  "lockbox"                    : "keyless_entry",
  // Outdoor
  "patio or balcony"           : "private_patio",
  "balcony"                    : "private_patio",
  "patio"                      : "private_patio",
  "deck"                       : "private_patio",
  "outdoor grill"              : "bbq_grill",
  "bbq grill"                  : "bbq_grill",
  "barbeque"                   : "bbq_grill",
  "barbecue"                   : "bbq_grill",
  "grill"                      : "bbq_grill",
  "outdoor seating"            : "outdoor_furniture",
  "outdoor furniture"          : "outdoor_furniture",
  "fire pit"                   : "fire_pit",
  "hot tub"                    : "hot_tub",
  "jacuzzi"                    : "hot_tub",
  "whirlpool"                  : "hot_tub",
  // Safety
  "smoke alarm"                : "smoke_alarm",
  "smoke detector"             : "smoke_alarm",
  "carbon monoxide alarm"      : "co_alarm",
  "carbon monoxide detector"   : "co_alarm",
  "co alarm"                   : "co_alarm",
  "co detector"                : "co_alarm",
  "fire extinguisher"          : "fire_extinguisher",
  "first aid kit"              : "first_aid_kit",
  "first aid"                  : "first_aid_kit",
  // Guest Experience
  "welcome basket"             : "welcome_basket",
  "welcome gift"               : "welcome_basket",
  "welcome package"            : "welcome_basket",
  "local guidebook"            : "local_guidebook",
  "neighborhood guide"         : "local_guidebook",
  "guidebook"                  : "local_guidebook",
  "allows pets"                : "pet_friendly",
  "pets allowed"               : "pet_friendly",
  "pets welcome"               : "pet_friendly",
  "pet friendly"               : "pet_friendly",
  "dogs allowed"               : "pet_friendly",
  "cats allowed"               : "pet_friendly",
}

function extractName(item: ListingAmenityItem): string {
  return (item.text ?? item.label ?? item.name ?? item.title ?? item.value ?? item.key ?? "").trim()
}

function mapAmenityName(raw: string): string[] {
  const lower = raw.toLowerCase()
  const matched = new Set<string>()

  // Special case: "washer/dryer" maps to both
  if (lower.includes("washer") && lower.includes("dryer")) {
    matched.add("washer")
    matched.add("dryer")
  }

  // Match against the map (longest-first wins to prefer specific over generic)
  const sortedKeys = Object.keys(OR_NAME_MAP).sort((a, b) => b.length - a.length)
  for (const mapKey of sortedKeys) {
    if (lower.includes(mapKey)) {
      matched.add(OR_NAME_MAP[mapKey])
      break // one match per amenity name is enough (prefer longest/most specific)
    }
  }

  return [...matched]
}

function parseAmenities(raw: unknown, ownerrezId: string): Set<string> {
  const presentKeys = new Set<string>()
  const rawTexts: string[] = []

  if (Array.isArray(raw)) {
    for (const item of raw as ListingAmenityItem[]) {
      const name = typeof item === "string" ? item : extractName(item)
      if (name) rawTexts.push(name)
    }
  } else if (raw !== null && typeof raw === "object") {
    const obj = raw as Record<string, unknown>

    // OwnerRez /v2/listings format: amenity_categories[].amenities[].text
    if (Array.isArray(obj.amenity_categories)) {
      for (const cat of obj.amenity_categories as Array<{ amenities?: Array<{ text?: string }> }>) {
        for (const item of cat.amenities ?? []) {
          if (item.text) rawTexts.push(item.text)
        }
      }
    }

    // Also mine amenity_call_outs[].text (highlighted amenities)
    if (Array.isArray(obj.amenity_call_outs)) {
      for (const item of obj.amenity_call_outs as Array<{ text?: string }>) {
        if (item.text) rawTexts.push(item.text)
      }
    }

    // Fallback: flat array under common field names
    const candidate =
      obj.amenities ?? obj.listing_amenities ?? obj.features ?? obj.items ?? null
    if (Array.isArray(candidate)) {
      for (const item of candidate as ListingAmenityItem[]) {
        const name = typeof item === "string" ? item : extractName(item)
        if (name) rawTexts.push(name)
      }
    }
  }

  for (const text of rawTexts) {
    for (const key of mapAmenityName(text)) {
      presentKeys.add(key)
    }
  }

  console.log(
    `[amenities-sync] property ${ownerrezId}: found ${rawTexts.length} amenity texts → ` +
    `matched ${presentKeys.size} internal keys: ${[...presentKeys].join(", ")}`,
  )

  return presentKeys
}

// ── Main sync function ────────────────────────────────────────────────────────

export type AmenitiesSyncResult = {
  propertiesSynced: number
  amenitiesSynced : number
}

export async function runAmenitiesSync(): Promise<AmenitiesSyncResult> {
  const supabase   = createAdminClient()
  const startedAt  = new Date().toISOString()

  // ── Load credentials ───────────────────────────────────────────────────────
  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")

  const NEEDED = new Set(["ownerrez_email", "ownerrez_api_token"])
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) {
    if (!NEEDED.has(row.key)) continue
    try { settings[row.key] = JSON.parse(row.value as string) }
    catch { settings[row.key] = row.value as string }
  }

  const creds: OwnerRezCredentials = {
    email    : settings.ownerrez_email,
    apiToken : settings.ownerrez_api_token,
  }

  if (!creds.email || !creds.apiToken) {
    throw new Error("ownerrez_email and ownerrez_api_token must be set in app_settings")
  }

  const authHeader = "Basic " + Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")

  // ── Open sync log ──────────────────────────────────────────────────────────
  const { data: syncEntry } = await supabase
    .from("sync_log")
    .insert({ sync_type: "amenities", status: "running", started_at: startedAt })
    .select("id")
    .single()
  const syncId = syncEntry?.id

  // ── Fetch properties with OwnerRez IDs ────────────────────────────────────
  const { data: props } = await supabase
    .from("properties")
    .select("id, ownerrez_id")
    .not("ownerrez_id", "is", null)

  const properties = (props ?? []).filter(p => p.ownerrez_id)

  let propertiesSynced = 0
  let amenitiesSynced  = 0

  try {
    for (let i = 0; i < properties.length; i++) {
      if (i > 0) await sleep(BETWEEN_PROPERTIES_MS)

      const { id: propertyUuid, ownerrez_id } = properties[i]

      // ── Fetch listing from OwnerRez ──────────────────────────────────────
      let listingRaw: unknown = null
      try {
        const res = await fetch(
          `https://api.ownerrez.com/v2/listings/${ownerrez_id}`,
          { headers: { Authorization: authHeader, Accept: "application/json" }, cache: "no-store" },
        )
        if (!res.ok) {
          console.warn(`[amenities-sync] listing ${ownerrez_id} returned ${res.status} — skipping`)
          continue
        }
        listingRaw = await res.json()
      } catch (err) {
        console.error(`[amenities-sync] fetch error for ${ownerrez_id}:`, err)
        continue
      }

      // Log raw response once per sync for the first property so we can see the shape
      if (i === 0) {
        try {
          console.log(
            "[amenities-sync] first listing raw response:",
            JSON.stringify(listingRaw)?.slice(0, 800),
          )
        } catch { /* ignore */ }
      }

      // ── Parse + map amenities ────────────────────────────────────────────
      // Check the top-level object and also one level down (listing may wrap amenities)
      const amenitySource =
        (listingRaw !== null && typeof listingRaw === "object" && !Array.isArray(listingRaw))
          ? listingRaw
          : { amenities: listingRaw }

      const presentKeys = parseAmenities(amenitySource, ownerrez_id!)

      // ── Build upsert rows for ALL 42 amenities ───────────────────────────
      const rows = AMENITIES.map(a => ({
        property_id: propertyUuid,
        amenity_key: a.key,
        is_present : presentKeys.has(a.key),
        updated_at : new Date().toISOString(),
      }))

      const { error: upsertErr } = await (supabase as any)
        .from("property_amenities")
        .upsert(rows, { onConflict: "property_id,amenity_key" })

      if (upsertErr) {
        console.error(`[amenities-sync] upsert error for ${propertyUuid}:`, upsertErr)
        continue
      }

      propertiesSynced++
      amenitiesSynced += presentKeys.size
    }

    // ── Close sync log — success ─────────────────────────────────────────
    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status         : "success",
          records_synced : amenitiesSynced,
          records_failed : 0,
          completed_at   : new Date().toISOString(),
        })
        .eq("id", syncId)
    }

    return { propertiesSynced, amenitiesSynced }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (syncId) {
      await supabase
        .from("sync_log")
        .update({
          status        : "error",
          error_message : message,
          completed_at  : new Date().toISOString(),
        })
        .eq("id", syncId)
    }
    throw err
  }
}
