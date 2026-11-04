// lib/benchmarks.ts
// Single source of truth for per-property benchmark resolution.
// Server-side only — imports admin client.

import { createAdminClient } from "@/lib/supabase/admin"

export type ListingType = "nightly" | "weekly" | "monthly"

export type BenchmarkSource =
  | "override"
  | "pl_neighborhood"
  | "comparable"
  | "comparable_scaled"
  | "market"

export type BenchmarkResult = {
  adr            : number
  occupancy      : number   // 0–100
  revpar         : number
  source         : BenchmarkSource
  sourceLabel    : string
  comparableCount: number   // 0 for override / market / pl_neighborhood
}

export const DEFAULT_MARKET_ADR = 207
export const DEFAULT_MARKET_OCC = 57

// ── Listing type ──────────────────────────────────────────────────────────────

export function inferListingType(name: string): ListingType {
  const n = name.toLowerCase()
  if (n.includes("monthly"))                                               return "monthly"
  if (n.includes("weekly") || n.includes("5 day") || n.includes("3 day")) return "weekly"
  return "nightly"
}

export function resolveListingType(
  listingType : string | null | undefined,
  displayName : string,                    // prefer internal_name ?? external_name
): ListingType {
  if (listingType === "nightly" || listingType === "weekly" || listingType === "monthly") {
    return listingType
  }
  return inferListingType(displayName)
}

// ── Market defaults ───────────────────────────────────────────────────────────

export async function getMarketDefaults(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ marketAdr: number; marketOcc: number }> {
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", ["market_adr", "market_occupancy"])

  let marketAdr = DEFAULT_MARKET_ADR
  let marketOcc = DEFAULT_MARKET_OCC

  for (const row of data ?? []) {
    const v =
      typeof row.value === "number" ? row.value
      : typeof row.value === "string" ? parseFloat(row.value)
      : NaN
    if (row.key === "market_adr"       && isFinite(v) && v > 0) marketAdr = v
    if (row.key === "market_occupancy" && isFinite(v) && v > 0) marketOcc = v
  }

  return { marketAdr, marketOcc }
}

// ── Core types ────────────────────────────────────────────────────────────────

export type PropertyMeta = {
  id                           : string
  external_name                : string
  internal_name                : string | null
  bedrooms                     : number | null
  listing_type                 : string | null
  benchmark_adr_override       : number | null
  benchmark_occupancy_override : number | null
}

export type AggBooking = {
  property_id  : string
  bookedNights : number
  revenue      : number
}

// ── PriceLabs neighborhood cache ──────────────────────────────────────────────

export type PlNeighborhoodData = {
  adr         : number
  occ         : number       // 0–100
  listingCount: number
  monthsLabel?: string       // which months were averaged, e.g. "Aug–Oct 2026 + Aug–Oct 2025"
  fetchedAt   : string       // ISO timestamp
}

const PL_CACHE_TTL_MS = 24 * 60 * 60 * 1_000

function plCacheKey(listingId: string) {
  return `pl_nb_cache_${listingId}`
}

export async function getPlNeighborhoodCache(
  admin    : ReturnType<typeof createAdminClient>,
  listingId: string,
): Promise<PlNeighborhoodData | null> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", plCacheKey(listingId))
    .maybeSingle()
  if (!data) return null
  try {
    const str    = typeof data.value === "string" ? data.value : JSON.stringify(data.value)
    const parsed = JSON.parse(str) as PlNeighborhoodData
    if (!parsed?.fetchedAt || !parsed?.adr || !parsed?.occ) return null
    if (Date.now() - new Date(parsed.fetchedAt).getTime() > PL_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export async function setPlNeighborhoodCache(
  admin    : ReturnType<typeof createAdminClient>,
  listingId: string,
  data     : Omit<PlNeighborhoodData, "fetchedAt">,
): Promise<void> {
  const payload: PlNeighborhoodData = { ...data, fetchedAt: new Date().toISOString() }
  await admin
    .from("app_settings")
    .upsert(
      { key: plCacheKey(listingId), value: JSON.stringify(payload) },
      { onConflict: "key" },
    )
}

// ── PriceLabs neighborhood data extraction ────────────────────────────────────
//
// /v1/neighborhood_data response shape (abbreviated):
//   data["Market KPI"].Category["0"]   = same-bedroom bucket (relative to listing)
//   data["Market KPI"].Category["All"] = all-bedroom bucket
//   Y_values[0] = Total Available Days (per month)
//   Y_values[3] = Revenue (per month)
//   Y_values[4] = Total Booked Days (per month)
//   X_values    = ["Nov 2024", "Dec 2024", ...]
//
// We use last 6 past-month entries where AvailDays ≤ 1500 (annual roll-ups have higher values).

export function extractPlBenchmark(
  payload  : unknown,
  _bedrooms: number | null,
): PlNeighborhoodData | null {
  try {
    const d = (payload as any)?.data
    if (!d?.["Market KPI"]) return null

    const kpiSection   = d["Market KPI"]
    // Category "0" = same bedrooms relative to listing
    const sameBedCat   = kpiSection.Category?.["0"]
    const sameBedCount = sameBedCat?.["Listings Used"] ?? 0
    // Prefer same-bedroom category if ≥10 listings, else use All
    const kpiCat = sameBedCount >= 10
      ? sameBedCat
      : (kpiSection.Category?.["All"] ?? sameBedCat)
    if (!kpiCat) return null

    const xVals      : string[] = kpiCat.X_values ?? []
    const availSeries            = kpiCat.Y_values?.[0]  // Total Available Days
    const revSeries              = kpiCat.Y_values?.[3]  // Revenue
    const bookedSeries           = kpiCat.Y_values?.[4]  // Total Booked Days
    if (!xVals.length || !availSeries || !revSeries || !bookedSeries) return null

    const today = new Date()

    // Collect all valid monthly entries, keyed by "YYYY-MM"
    type MonthEntry = { key: string; avail: number; rev: number; booked: number }
    const byKey = new Map<string, MonthEntry>()
    for (let i = 0; i < xVals.length; i++) {
      const md = new Date(xVals[i] + " 1")
      if (isNaN(md.getTime()) || md >= today) continue
      const avail  = Number(availSeries[i]  ?? 0)
      const rev    = Number(revSeries[i]    ?? 0)
      const booked = Number(bookedSeries[i] ?? 0)
      // Skip zeros and annual roll-up entries (> 1500 days in a "month")
      if (avail <= 0 || avail > 1500 || booked <= 0) continue
      const key = `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, "0")}`
      byKey.set(key, { key, avail, rev, booked })
    }

    if (byKey.size < 2) return null

    // Sort newest first
    const sorted = Array.from(byKey.values()).sort((a, b) => b.key.localeCompare(a.key))

    // Primary: 3 most recent complete months + same 3 months last year
    const recent = sorted.slice(0, 3)
    const prior  = recent.map(m => {
      const [y, mo] = m.key.split("-").map(Number)
      return byKey.get(`${y - 1}-${String(mo).padStart(2, "0")}`) ?? null
    })

    let selected   : MonthEntry[]
    let monthsLabel: string

    if (recent.length === 3 && prior.every(p => p !== null)) {
      selected = [...recent, ...(prior as MonthEntry[])]
      // e.g. "Aug–Oct 2026 + Aug–Oct 2025"
      const names      = recent.map(m =>
        new Date(m.key + "-01").toLocaleDateString("en-US", { month: "short" })
      )
      const recentYear = Number(recent[0].key.slice(0, 4))
      const range      = `${names[2]}–${names[0]}`
      monthsLabel      = `${range} ${recentYear} + ${range} ${recentYear - 1}`
    } else {
      // Fallback: 6 most recent valid months
      selected    = sorted.slice(0, 6)
      monthsLabel = `${selected.length} most recent months`
    }

    if (selected.length < 2) return null

    let totalRevenue = 0, totalBooked = 0, totalAvailable = 0
    for (const m of selected) {
      totalRevenue   += m.rev
      totalBooked    += m.booked
      totalAvailable += m.avail
    }

    if (totalBooked <= 0 || totalAvailable <= 0) return null
    const adr = totalRevenue   / totalBooked
    const occ = (totalBooked  / totalAvailable) * 100
    if (!isFinite(adr) || !isFinite(occ) || adr <= 0 || occ <= 0) return null

    return {
      adr         : Math.round(adr * 100) / 100,
      occ         : Math.round(occ * 10)  / 10,
      listingCount: kpiCat["Listings Used"] ?? 0,
      monthsLabel,
      fetchedAt   : new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// ── Bookings aggregation ──────────────────────────────────────────────────────

const COMP_WINDOW_DAYS = 90

export function aggregateBookings(
  bookings: Array<{
    property_id  : string
    arrival      : string
    departure    : string
    net_revenue ?: number | null
    total_amount?: number | null
  }>,
): AggBooking[] {
  const map = new Map<string, AggBooking>()
  for (const b of bookings) {
    const nights = Math.max(
      0,
      (new Date(b.departure + "T00:00:00").getTime() -
       new Date(b.arrival   + "T00:00:00").getTime()) / 86_400_000,
    )
    const rev      = Number((b as any).net_revenue ?? (b as any).total_amount ?? 0)
    const existing = map.get(b.property_id)
    if (existing) {
      existing.bookedNights += nights
      existing.revenue      += isFinite(rev) ? rev : 0
    } else {
      map.set(b.property_id, {
        property_id : b.property_id,
        bookedNights: nights,
        revenue     : isFinite(rev) ? rev : 0,
      })
    }
  }
  return Array.from(map.values())
}

// ── Core benchmark computation ────────────────────────────────────────────────

export function computeBenchmark(params: {
  property     : PropertyMeta
  allProperties: PropertyMeta[]
  aggBookings  : AggBooking[]
  hiddenIds    : Set<string>
  siblingIds   : Set<string>
  marketAdr    : number
  marketOcc    : number
  plData      ?: PlNeighborhoodData | null
}): BenchmarkResult {
  const { property, allProperties, aggBookings, hiddenIds, siblingIds, marketAdr, marketOcc, plData } = params

  // ── (a) Per-property override ──────────────────────────────────────────────
  const oAdr = property.benchmark_adr_override
  const oOcc = property.benchmark_occupancy_override
  if (oAdr != null && oOcc != null && oAdr > 0 && oOcc > 0) {
    return {
      adr            : oAdr,
      occupancy      : oOcc,
      revpar         : Math.round(oAdr * oOcc) / 100,
      source         : "override",
      sourceLabel    : `your target ($${Math.round(oAdr)} ADR, ${oOcc}% occ)`,
      comparableCount: 0,
    }
  }

  const propType     = resolveListingType(property.listing_type, property.internal_name ?? property.external_name)
  const propBedrooms = property.bedrooms
  const bookingMap   = new Map(aggBookings.map(b => [b.property_id, b]))

  // ── (b) PriceLabs neighborhood data (nightly only) ───────────────────────
  if (propType === "nightly" && plData && plData.adr > 0 && plData.occ > 0 && plData.listingCount >= 5) {
    return {
      adr            : plData.adr,
      occupancy      : plData.occ,
      revpar         : Math.round(plData.adr * plData.occ) / 100,
      source         : "pl_neighborhood",
      sourceLabel    : `PriceLabs market (${plData.listingCount} nearby listings)`,
      comparableCount: plData.listingCount,
    }
  }

  // ── (c) Same bedrooms + same listing type, ≥2 comps ───────────────────────
  const sameBedComps = allProperties.filter(p =>
    p.id !== property.id &&
    !hiddenIds.has(p.id) &&
    !siblingIds.has(p.id) &&
    p.bedrooms === propBedrooms &&
    resolveListingType(p.listing_type, p.internal_name ?? p.external_name) === propType,
  )

  if (sameBedComps.length >= 2) {
    type Booked = AggBooking
    const metrics: Booked[] = sameBedComps
      .map(p => bookingMap.get(p.id))
      .filter((b): b is Booked => b != null && b.bookedNights > 0)

    if (metrics.length >= 2) {
      const { medAdr, medOcc } = medianAdrOcc(metrics)
      return {
        adr            : Math.round(medAdr * 100) / 100,
        occupancy      : Math.round(medOcc * 10)  / 10,
        revpar         : Math.round(medAdr * medOcc) / 100,
        source         : "comparable",
        sourceLabel    : `similar listings (median $${Math.round(medAdr)})`,
        comparableCount: metrics.length,
      }
    }
  }

  // ── (d) Same listing type, any bedrooms, ≥3 comps (ADR scaled by bedroom ratio) ──
  const anyBedComps = allProperties.filter(p =>
    p.id !== property.id &&
    !hiddenIds.has(p.id) &&
    !siblingIds.has(p.id) &&
    resolveListingType(p.listing_type, p.internal_name ?? p.external_name) === propType,
  )

  if (anyBedComps.length >= 3) {
    type CompBed = { bookedNights: number; revenue: number; beds: number | null }
    const metrics: CompBed[] = anyBedComps
      .map(p => {
        const b = bookingMap.get(p.id)
        if (!b || b.bookedNights <= 0) return null
        return { bookedNights: b.bookedNights, revenue: b.revenue, beds: p.bedrooms }
      })
      .filter((x): x is CompBed => x !== null)

    if (metrics.length >= 3) {
      const propBeds = (propBedrooms ?? 1) > 0 ? (propBedrooms ?? 1) : 1
      const scaledAdrs = metrics.map(b => {
        const compBeds = (b.beds ?? 1) > 0 ? (b.beds ?? 1) : 1
        return (b.revenue / b.bookedNights) * (propBeds / compBeds)
      }).sort((a, b) => a - b)
      const rawOccs = metrics
        .map(b => (b.bookedNights / COMP_WINDOW_DAYS) * 100)
        .sort((a, b) => a - b)

      const medAdr = medianOf(scaledAdrs)
      const medOcc = medianOf(rawOccs)
      return {
        adr            : Math.round(medAdr * 100) / 100,
        occupancy      : Math.round(medOcc * 10)  / 10,
        revpar         : Math.round(medAdr * medOcc) / 100,
        source         : "comparable_scaled",
        sourceLabel    : `similar ${propType}s, any beds (${metrics.length} comps, bed-scaled)`,
        comparableCount: metrics.length,
      }
    }
  }

  // ── (e) Market constants fallback ─────────────────────────────────────────
  return {
    adr            : marketAdr,
    occupancy      : marketOcc,
    revpar         : Math.round(marketAdr * marketOcc) / 100,
    source         : "market",
    sourceLabel    : `Appleton market ($${Math.round(marketAdr)} ADR, ${marketOcc}% occ)`,
    comparableCount: 0,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function medianAdrOcc(metrics: AggBooking[]): { medAdr: number; medOcc: number } {
  const adrs = metrics.map(b => b.revenue / b.bookedNights).sort((a, b) => a - b)
  const occs = metrics.map(b => (b.bookedNights / COMP_WINDOW_DAYS) * 100).sort((a, b) => a - b)
  return { medAdr: medianOf(adrs), medOcc: medianOf(occs) }
}
