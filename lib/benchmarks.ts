// lib/benchmarks.ts
// Single source of truth for per-property benchmark resolution.
// Server-side only — imports admin client.

import { createAdminClient } from "@/lib/supabase/admin"

export type ListingType = "nightly" | "weekly" | "monthly"

export type BenchmarkSource = "override" | "comparable" | "market"

export type BenchmarkResult = {
  adr        : number
  occupancy  : number   // 0–100
  revpar     : number
  source     : BenchmarkSource
  sourceLabel: string   // e.g. "your target ($180 ADR, 60% occ)", "similar listings (median $155)", "Appleton market ($207 ADR, 57% occ)"
}

export const DEFAULT_MARKET_ADR = 207
export const DEFAULT_MARKET_OCC = 57

export function inferListingType(name: string): ListingType {
  const n = name.toLowerCase()
  if (n.includes("monthly"))                                               return "monthly"
  if (n.includes("weekly") || n.includes("5 day") || n.includes("3 day")) return "weekly"
  return "nightly"
}

export function resolveListingType(
  listingType: string | null | undefined,
  externalName: string,
): ListingType {
  if (listingType === "nightly" || listingType === "weekly" || listingType === "monthly") {
    return listingType
  }
  return inferListingType(externalName)
}

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
    const rev = Number((b as any).net_revenue ?? (b as any).total_amount ?? 0)
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

export function computeBenchmark(params: {
  property     : PropertyMeta
  allProperties: PropertyMeta[]
  aggBookings  : AggBooking[]
  hiddenIds    : Set<string>
  siblingIds   : Set<string>
  marketAdr    : number
  marketOcc    : number
}): BenchmarkResult {
  const { property, allProperties, aggBookings, hiddenIds, siblingIds, marketAdr, marketOcc } = params

  // 1. Per-property override
  const oAdr = property.benchmark_adr_override
  const oOcc = property.benchmark_occupancy_override
  if (oAdr != null && oOcc != null && oAdr > 0 && oOcc > 0) {
    return {
      adr        : oAdr,
      occupancy  : oOcc,
      revpar     : Math.round(oAdr * oOcc) / 100,
      source     : "override",
      sourceLabel: `your target ($${Math.round(oAdr)} ADR, ${oOcc}% occ)`,
    }
  }

  // 2. Median of comparable visible properties (same bedrooms + same listing type, ≥2, 90 days)
  const propType     = resolveListingType(property.listing_type, property.internal_name ?? property.external_name)
  const propBedrooms = property.bedrooms

  const comparableIds = allProperties
    .filter(p =>
      p.id !== property.id &&
      !hiddenIds.has(p.id) &&
      !siblingIds.has(p.id) &&
      p.bedrooms === propBedrooms &&
      resolveListingType(p.listing_type, p.internal_name ?? p.external_name) === propType,
    )
    .map(p => p.id)

  if (comparableIds.length >= 2) {
    const bookingMap = new Map(aggBookings.map(b => [b.property_id, b]))
    const compMetrics = comparableIds
      .map(id => bookingMap.get(id))
      .filter((b): b is AggBooking => b != null && b.bookedNights > 0)

    if (compMetrics.length >= 2) {
      const adrs = compMetrics.map(b => b.revenue / b.bookedNights).sort((a, b) => a - b)
      const occs = compMetrics.map(b => (b.bookedNights / COMP_WINDOW_DAYS) * 100).sort((a, b) => a - b)
      const mid  = Math.floor(adrs.length / 2)
      const medAdr = adrs.length % 2 === 1 ? adrs[mid] : (adrs[mid - 1] + adrs[mid]) / 2
      const medOcc = occs.length % 2 === 1 ? occs[mid] : (occs[mid - 1] + occs[mid]) / 2
      return {
        adr        : Math.round(medAdr * 100) / 100,
        occupancy  : Math.round(medOcc * 10) / 10,
        revpar     : Math.round(medAdr * medOcc) / 100,
        source     : "comparable",
        sourceLabel: `similar listings (median $${Math.round(medAdr)})`,
      }
    }
  }

  // 3. Market fallback
  return {
    adr        : marketAdr,
    occupancy  : marketOcc,
    revpar     : Math.round(marketAdr * marketOcc) / 100,
    source     : "market",
    sourceLabel: `Appleton market ($${Math.round(marketAdr)} ADR, ${marketOcc}% occ)`,
  }
}
