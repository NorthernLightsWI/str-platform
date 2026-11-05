import { createAdminClient } from "@/lib/supabase/admin"
import {
  BenchmarksClient,
  type PropertyRow,
  type PortfolioSummary,
} from "@/components/benchmarks/benchmarks-client"
import {
  getMarketDefaults,
  aggregateBookings,
  computeBenchmark,
  extractPlBenchmark,
  getPlNeighborhoodCache,
  setPlNeighborhoodCache,
  type PropertyMeta,
  type PlNeighborhoodData,
} from "@/lib/benchmarks"
import { fetchNeighborhoodData } from "@/lib/pricelabs"

// ── Score formula ─────────────────────────────────────────────────────────────

function scoreComponent(value: number, market: number): number {
  if (!market || !isFinite(market)) return 0
  return Math.min(100, Math.max(0, (value / market / 2) * 100))
}

function computeScore(
  occ: number, adr: number, revpar: number,
  benchOcc: number, benchAdr: number, benchRevpar: number,
): number {
  const s =
    (scoreComponent(occ,    benchOcc)    +
     scoreComponent(adr,    benchAdr)    +
     scoreComponent(revpar, benchRevpar)) / 3
  return isFinite(s) ? Math.round(s) : 0
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BenchmarksPage() {
  const admin = createAdminClient()

  const PERIOD_DAYS = 365
  const COMP_DAYS   = 90
  const periodStart    = new Date()
  periodStart.setFullYear(periodStart.getFullYear() - 1)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const todayStr       = new Date().toISOString().slice(0, 10)
  const comp90Start    = new Date(Date.now() - COMP_DAYS * 86_400_000).toISOString().slice(0, 10)

  const [
    { data: allPropData },
    // Active-only properties — for COMPARABLE pool
    { data: activePropData },
    { data: bookingData },
    { data: comp90Data },
    { data: propGroupsData },
    { marketAdr, marketOcc },
  ] = await Promise.all([
    (admin as any)
      .from("visible_properties")
      .select("id, internal_name, external_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override, pricelabs_listing_id, is_active")
      .order("external_name"),

    (admin as any)
      .from("visible_properties")
      .select("id, internal_name, external_name, bedrooms, listing_type, benchmark_adr_override, benchmark_occupancy_override")
      .eq("is_active", true),

    (admin as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", periodStartStr)
      .lt("arrival", todayStr),

    (admin as any)
      .from("visible_bookings")
      .select("property_id, arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .lt("arrival", todayStr)
      .gt("departure", comp90Start),

    (admin as any)
      .from("visible_properties")
      .select("id, parent_property_id")
      .eq("is_active", true),

    getMarketDefaults(admin),
  ])

  const marketRevpar = Math.round(marketAdr * marketOcc) / 100

  const visibleProps = allPropData ?? []

  // Active visible properties for the comparable pool
  const activeProps = (activePropData ?? []) as PropertyMeta[]

  // Build sibling map (active properties only — same as comparable pool)
  const siblingMap = new Map<string, Set<string>>()
  const groupsByParent = new Map<string, string[]>()
  for (const p of propGroupsData ?? []) {
    if (p.parent_property_id) {
      const arr = groupsByParent.get(p.parent_property_id) ?? []
      arr.push(p.id)
      groupsByParent.set(p.parent_property_id, arr)
    }
  }
  for (const [parentId, children] of groupsByParent) {
    const allGroupMembers = [parentId, ...children]
    for (const memberId of allGroupMembers) {
      siblingMap.set(memberId, new Set(allGroupMembers.filter(id => id !== memberId)))
    }
  }

  const comp90End     = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  const aggBookings90 = aggregateBookings(comp90Data ?? [], comp90Start, comp90End, todayStr)

  // ── PriceLabs neighborhood cache ──────────────────────────────────────────
  // Fetch/refresh PL neighborhood data for mapped properties
  const { data: plApiKeyRow } = await admin
    .from("app_settings").select("value").eq("key", "pricelabs_api_key").maybeSingle()
  const plApiKey = typeof (plApiKeyRow as any)?.value === "string" ? (plApiKeyRow as any).value : null

  const plDataMap = new Map<string, PlNeighborhoodData>()
  for (const p of visibleProps) {
    const lid: string | null = (p as any).pricelabs_listing_id ?? null
    if (!lid) continue
    let cached = await getPlNeighborhoodCache(admin, lid)
    if (!cached && plApiKey) {
      const r = await fetchNeighborhoodData(plApiKey, lid, "ownerrez")
      if (r.ok) {
        const extracted = extractPlBenchmark(r.payload, p.bedrooms)
        if (extracted) {
          await setPlNeighborhoodCache(admin, lid, extracted)
          cached = extracted
        }
      }
    }
    if (cached) plDataMap.set(p.id, cached)
  }

  // ── 365-day bookings by property ──────────────────────────────────────────
  const byProperty = new Map<string, NonNullable<typeof bookingData>>()
  for (const b of bookingData ?? []) {
    const arr = byProperty.get(b.property_id) ?? []
    arr.push(b)
    byProperty.set(b.property_id, arr)
  }

  const rows: PropertyRow[] = visibleProps.map((p: any) => {
    const bookings     = byProperty.get(p.id) ?? []
    let   bookedNights = 0
    let   revenue      = 0

    for (const b of bookings) {
      const arrMs  = new Date(b.arrival   + "T00:00:00").getTime()
      const depMs  = new Date(b.departure + "T00:00:00").getTime()
      bookedNights += Math.max(0, (depMs - arrMs) / 86_400_000)
      const rev = Number(b.net_revenue ?? b.total_amount ?? 0)
      revenue  += isFinite(rev) ? rev : 0
    }

    const occupancy = bookedNights > 0 ? (bookedNights / PERIOD_DAYS) * 100 : 0
    const adr       = bookedNights > 0 ? revenue / bookedNights : 0
    const revpar    = PERIOD_DAYS  > 0 ? revenue / PERIOD_DAYS  : 0

    // Use PropertyMeta shape; non-active props still get a benchmark but won't
    // appear in the comparable pool (activeProps excludes them)
    const meta: PropertyMeta = {
      id                           : p.id,
      external_name                : p.external_name,
      internal_name                : p.internal_name ?? null,
      bedrooms                     : p.bedrooms,
      listing_type                 : p.listing_type ?? null,
      benchmark_adr_override       : p.benchmark_adr_override ?? null,
      benchmark_occupancy_override : p.benchmark_occupancy_override ?? null,
    }

    const bench = computeBenchmark({
      property     : meta,
      allProperties: activeProps,
      aggBookings  : aggBookings90,
      hiddenIds    : new Set<string>(),
      siblingIds   : siblingMap.get(p.id) ?? new Set(),
      marketAdr,
      marketOcc,
      plData       : plDataMap.get(p.id) ?? null,
    })

    return {
      id              : p.id,
      name            : p.internal_name || p.external_name,
      occupancy       : +occupancy.toFixed(2),
      adr             : +adr.toFixed(2),
      revpar          : +revpar.toFixed(2),
      score           : computeScore(occupancy, adr, revpar, bench.occupancy, bench.adr, bench.revpar),
      benchmarkOcc    : bench.occupancy,
      benchmarkAdr    : bench.adr,
      benchmarkRevpar : bench.revpar,
      benchmarkSource : bench.sourceLabel,
      comparableCount : bench.comparableCount,
      isActive        : p.is_active === true,
    }
  })

  // ── Portfolio summary (active rows only) ──────────────────────────────────
  const activeRows = rows.filter(r => r.isActive)
  const totalAvail = PERIOD_DAYS * Math.max(activeRows.length, 1)
  let   totalBooked  = 0
  let   totalRevenue = 0
  for (const r of activeRows) {
    totalBooked  += (r.occupancy / 100) * PERIOD_DAYS
    totalRevenue += r.revpar * PERIOD_DAYS
  }
  const portOcc    = totalAvail  > 0 ? (totalBooked  / totalAvail) * 100 : 0
  const portADR    = totalBooked > 0 ? totalRevenue  / totalBooked       : 0
  const portRevPAR = totalAvail  > 0 ? totalRevenue  / totalAvail        : 0
  const portScore  = activeRows.length > 0
    ? Math.round(activeRows.reduce((sum, r) => sum + r.score, 0) / activeRows.length)
    : 0

  const summary: PortfolioSummary = {
    occupancy: +portOcc.toFixed(2),
    adr      : +portADR.toFixed(2),
    revpar   : +portRevPAR.toFixed(2),
    score    : portScore,
  }

  const activeCount = activeRows.length
  const totalCount  = rows.length

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Benchmarks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Trailing 12-month performance vs. benchmark targets ·{" "}
          {activeCount} active propert{activeCount !== 1 ? "ies" : "y"}
          {totalCount > activeCount && ` · ${totalCount - activeCount} inactive`}
        </p>
      </div>

      <BenchmarksClient
        rows={rows}
        summary={summary}
        marketOcc={marketOcc}
        marketAdr={marketAdr}
        marketRevpar={marketRevpar}
      />
    </div>
  )
}
