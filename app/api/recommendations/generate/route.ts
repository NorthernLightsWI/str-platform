import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"

// ── Market constants (Appleton, WI) ────────────────────────────────────────────
const MARKET_OCC    = 57
const MARKET_ADR    = 207
const MARKET_REVPAR = +(MARKET_ADR * MARKET_OCC / 100).toFixed(2)   // ~118
const PERIOD_DAYS   = 90
const RECENT_DAYS   = 30

// Jun / Jul / Aug are peak months for Appleton (0-indexed month numbers)
const PEAK_MONTHS = new Set([5, 6, 7])

// ── Types ──────────────────────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low"
type Category = "pricing" | "occupancy" | "listing_quality" | "reviews" | "ranking"

type GeneratedRec = {
  rule_key         : string
  title            : string
  body             : string
  priority         : Priority
  category         : Category
  impact_statement : string
  action_steps     : string[]
}

type FutureBooking = { arrival: string; departure: string }

// ── Gap detection ──────────────────────────────────────────────────────────────

function findOrphanGaps(
  bookings: FutureBooking[],
): Array<{ gapStart: string; gapEnd: string; nights: number }> {
  if (bookings.length < 2) return []
  const sorted = [...bookings].sort((a, b) => a.arrival.localeCompare(b.arrival))
  const gaps: Array<{ gapStart: string; gapEnd: string; nights: number }> = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].departure
    const gapEnd   = sorted[i + 1].arrival
    const nights   = Math.round(
      (new Date(gapEnd + "T00:00:00Z").getTime() - new Date(gapStart + "T00:00:00Z").getTime())
      / 86_400_000,
    )
    if (nights >= 1 && nights <= 3) gaps.push({ gapStart, gapEnd, nights })
  }
  return gaps
}

// ── Rule engine ────────────────────────────────────────────────────────────────

function generateRules(metrics: {
  name             : string
  occupancy_pct    : number
  adr              : number
  revpar           : number
  recent_bookings  : number
  bookings_last14  : number
  upcoming_30days  : number
  review_count     : number
  future_bookings  : FutureBooking[]
  today            : Date
}): GeneratedRec[] {
  const {
    name, occupancy_pct, adr, revpar, recent_bookings,
    bookings_last14, upcoming_30days, review_count, future_bookings, today,
  } = metrics
  const recs: GeneratedRec[] = []

  let deadCalendarFired = false

  // Rule 1: Listing Freshness
  if (bookings_last14 === 0 && upcoming_30days === 0) {
    deadCalendarFired = true
    const estMonthlyRevAtMarket = Math.round(MARKET_ADR * (MARKET_OCC / 100) * 30)
    recs.push({
      rule_key : "listing_freshness",
      title    : "No Recent Activity — Listing May Need Attention",
      body     : `${name} has had no new bookings in the last 14 days and no confirmed arrivals in the next 30 days. A completely empty booking window this wide almost always signals a pricing, visibility, or minimum-stay problem.`,
      priority : "high",
      category : "listing_quality",
      impact_statement: `A well-priced, visible listing in this market should generate ~$${estMonthlyRevAtMarket.toLocaleString()} per month. Acting now recovers that potential before the window closes entirely.`,
      action_steps: [
        `Drop nightly rates 15–20% immediately for all open dates in the next 4 weeks`,
        `Reduce minimum stay to 1 night for every open date in the next 30 days`,
        `Refresh listing title, cover photo, and first three listing photos`,
        `Verify the Airbnb and Vrbo calendars are open — no accidental blocked dates`,
        `Enable Instant Book if not already active; it significantly boosts search ranking`,
        `Add a "new period" promotion at 20% below your usual rate to trigger the booking algorithm`,
      ],
    })
  }

  // Rule 2a: Low occupancy — critical
  if (occupancy_pct < 20) {
    recs.push({
      rule_key : "low_occupancy_critical",
      title    : "Critically Low Occupancy",
      body     : `${name} has only ${occupancy_pct.toFixed(1)}% occupancy over the last ${PERIOD_DAYS} days — far below the Appleton market average of ${MARKET_OCC}%. Immediate action is needed to prevent sustained revenue loss.`,
      priority : "critical",
      category : "occupancy",
      impact_statement: `Raising occupancy to 40% could more than double revenue for this property.`,
      action_steps: [
        `Reduce nightly rate by 15–25% for the next 30 days to stimulate bookings`,
        `Enable last-minute discount (10–20% off) for stays within 7 days`,
        `Review minimum stay requirements — reduce to 1 night on weekdays`,
        `Confirm the listing is live and visible on all connected channels (Airbnb, Vrbo)`,
        `Update listing photos and description to improve click-through rate`,
      ],
    })
  } else if (occupancy_pct < 40) {
    // Rule 2b: Low occupancy — high priority
    recs.push({
      rule_key : "low_occupancy_high",
      title    : "Below-Average Occupancy",
      body     : `${name} is at ${occupancy_pct.toFixed(1)}% occupancy over the last ${PERIOD_DAYS} days, compared to the Appleton market average of ${MARKET_OCC}%. There is significant room to fill more nights.`,
      priority : "high",
      category : "occupancy",
      impact_statement: `Closing the gap to market average (${MARKET_OCC}%) could increase revenue by ~${Math.round((MARKET_OCC - occupancy_pct) / Math.max(occupancy_pct, 1) * 100)}%.`,
      action_steps: [
        `Reduce rates 10–15% during slow periods to attract more bookings`,
        `Activate gap-fill pricing for 1–2 night gaps between reservations`,
        `Consider reducing minimum stay length to increase booking opportunities`,
        `Run a promotion for 3+ night stays to attract longer bookings`,
      ],
    })
  }

  // Rule 3: ADR more than 30% below market
  const adrGap = MARKET_ADR - adr
  if (adr > 0 && adrGap / MARKET_ADR > 0.30) {
    recs.push({
      rule_key : "adr_below_market",
      title    : "ADR Significantly Below Market",
      body     : `${name} has an ADR of $${adr.toFixed(0)}, which is $${adrGap.toFixed(0)} (${Math.round(adrGap / MARKET_ADR * 100)}%) below the Appleton market average of $${MARKET_ADR}. Even with high occupancy this limits total revenue.`,
      priority : "high",
      category : "pricing",
      impact_statement: `Raising ADR by $${Math.round(adrGap * 0.5)} (halfway to market) could add $${Math.round(adrGap * 0.5 * (occupancy_pct / 100) * PERIOD_DAYS)} in revenue over ${PERIOD_DAYS} days.`,
      action_steps: [
        `Audit competitor listings in Appleton and set rates at or above their median`,
        `Add a weekend premium (Friday–Saturday rates 20–30% higher than weekday)`,
        `Set minimum rates in your channel manager to prevent underpricing`,
        `Highlight unique amenities in the listing that justify higher nightly rates`,
        `Use PriceLabs or a dynamic pricing tool to automate rate optimization`,
      ],
    })
  }

  // Rule 4: No bookings in last 30 days (suppressed when Rule 1 fired)
  if (recent_bookings === 0 && !deadCalendarFired) {
    recs.push({
      rule_key : "no_recent_bookings",
      title    : "No Recent Bookings",
      body     : `${name} has received zero bookings with arrivals in the last ${RECENT_DAYS} days. This may signal a listing visibility issue, pricing problem, or calendar availability gap.`,
      priority : "high",
      category : "listing_quality",
      impact_statement: `Resolving visibility or pricing issues could restore a steady booking pace within 1–2 weeks.`,
      action_steps: [
        `Check that the listing calendar is open for upcoming dates`,
        `Verify the listing is active and not flagged on Airbnb or Vrbo`,
        `Drop rates 10–20% for the next 14 days to trigger platform algorithm visibility`,
        `Refresh listing title and first photo — listings with recent edits get algorithm boosts`,
        `Review guest messages for any unresolved issues that may affect ranking`,
      ],
    })
  }

  // Rule 5: High occupancy, raise rates (ADR near market)
  const adrNearMarket = adr >= MARKET_ADR * 0.80
  if (occupancy_pct > 80 && adrNearMarket) {
    recs.push({
      rule_key : "raise_rates_high_occ",
      title    : "High Occupancy — Consider Raising Rates",
      body     : `${name} has ${occupancy_pct.toFixed(1)}% occupancy over the last ${PERIOD_DAYS} days, well above the Appleton market average of ${MARKET_OCC}%. When demand is this high, rates can often be raised without losing bookings.`,
      priority : "medium",
      category : "pricing",
      impact_statement: `A 10–15% rate increase at this occupancy level could improve RevPAR by a similar margin with minimal booking loss.`,
      action_steps: [
        `Increase base nightly rate by 10–15% and monitor booking pace for 2 weeks`,
        `Set a higher weekend premium — demand is already strong`,
        `Add a peak season surcharge for holidays and local events`,
        `Consider raising the minimum stay to 2–3 nights to improve calendar efficiency`,
      ],
    })
  }

  // Rule 6: Very low RevPAR
  if (revpar < 50 && revpar >= 0) {
    recs.push({
      rule_key : "very_low_revpar",
      title    : "Very Low RevPAR",
      body     : `${name} has a RevPAR of $${revpar.toFixed(0)}, far below the Appleton market benchmark of $${MARKET_REVPAR}. Low RevPAR means the property isn't generating enough revenue relative to its available nights.`,
      priority : "high",
      category : "pricing",
      impact_statement: `Reaching the market RevPAR of $${MARKET_REVPAR} would represent a ${revpar > 0 ? Math.round((MARKET_REVPAR - revpar) / revpar * 100) : "large"}% revenue increase over ${PERIOD_DAYS} days.`,
      action_steps: [
        `Address both occupancy and ADR simultaneously — low RevPAR is usually a combined problem`,
        `Set a RevPAR floor target of $${Math.round(MARKET_REVPAR * 0.7)} and work backwards to required rate × occupancy`,
        `Evaluate whether listing on additional platforms (Vrbo, direct bookings) would increase volume`,
        `Check if cleaning fees or other add-on fees are reducing booking conversion`,
      ],
    })
  }

  // Rule 7: High performer, ADR 20%+ below market
  const adrBelowMarket20 = adr > 0 && adr < MARKET_ADR * 0.80
  if (occupancy_pct > 75 && adrBelowMarket20) {
    const rateIncrease = Math.round((MARKET_ADR - adr) * 0.5)
    const targetRate   = Math.round(adr + rateIncrease)
    const annualImpact = Math.round(rateIncrease * (occupancy_pct / 100) * 365)
    recs.push({
      rule_key : "high_performer_underpriced",
      title    : "Raise Your Rates — You're Leaving Money on the Table",
      body     : `${name} is booking well at ${occupancy_pct.toFixed(1)}% occupancy but at only $${adr.toFixed(0)}/night — $${(MARKET_ADR - adr).toFixed(0)} below the Appleton market average of $${MARKET_ADR}/night. High demand means you can raise rates without losing meaningful occupancy.`,
      priority : "high",
      category : "pricing",
      impact_statement: `Raising your base rate to $${targetRate}/night (halfway to market) could add ~$${annualImpact.toLocaleString()} in annual revenue at your current occupancy level.`,
      action_steps: [
        `Increase your base nightly rate to $${targetRate} immediately`,
        `Test the new rate for 2–3 weeks and monitor booking pace`,
        `Set Friday–Saturday rates 20–25% above your new weekday base`,
        `Check 3–5 comparable Appleton listings — you should be competitive, not the cheapest`,
        `If bookings slow notably, reduce by $${Math.round(rateIncrease * 0.25)} rather than rolling back entirely`,
      ],
    })
  }

  // Rule 8: Low review count
  if (review_count < 5) {
    const need = 5 - review_count
    recs.push({
      rule_key : "low_review_count",
      title    : "Build Your Review Base",
      body     : `${name} has only ${review_count} review${review_count === 1 ? "" : "s"} — below the 5-review threshold that search algorithms use to boost ranking and conversion. ${need} more would clear that bar.`,
      priority : "medium",
      category : "reviews",
      impact_statement: `Listings that cross 5 reviews typically see a 10–20% boost in search ranking and booking conversion — equivalent in impact to a meaningful rate or occupancy improvement.`,
      action_steps: [
        `Message every recent guest post-checkout with a friendly, personal review request`,
        `Leave a small thank-you card in the property with a QR code linking to the review page`,
        `Respond to all existing reviews — hosts who engage publicly rank higher`,
        `Prioritize a flawless experience for the next ${need} checkout${need === 1 ? "" : "s"} to earn 5-star reviews`,
        `Confirm the OwnerRez review sync is current so existing reviews are counted`,
      ],
    })
  }

  // Rule 9: Orphan gaps in next 60 days
  const orphanGaps = findOrphanGaps(future_bookings)
  if (orphanGaps.length > 0) {
    const totalGapNights   = orphanGaps.reduce((s, g) => s + g.nights, 0)
    const potentialRevenue = Math.round(totalGapNights * Math.max(adr, MARKET_ADR * 0.7) * 0.85)
    const preview          = orphanGaps
      .slice(0, 3)
      .map(g => `${g.nights}n (${g.gapStart} → ${g.gapEnd})`)
      .join(", ")
    recs.push({
      rule_key : "orphan_gaps",
      title    : `Fill ${orphanGaps.length} Short Gap${orphanGaps.length > 1 ? "s" : ""} in the Next 60 Days`,
      body     : `${name} has ${orphanGaps.length} gap${orphanGaps.length > 1 ? "s" : ""} of 1–3 nights between existing bookings in the next 60 days: ${preview}${orphanGaps.length > 3 ? `, plus ${orphanGaps.length - 3} more` : ""}. These dates are nearly impossible to fill with a standard 2- or 3-night minimum but highly fillable with targeted gap pricing.`,
      priority : "medium",
      category : "pricing",
      impact_statement: `Filling all ${orphanGaps.length} gap${orphanGaps.length > 1 ? "s" : ""} (${totalGapNights} total nights) at a 15% gap discount could recover ~$${potentialRevenue.toLocaleString()} in otherwise-lost revenue.`,
      action_steps: [
        `Set minimum stay to 1 night for each specific gap window in your channel manager`,
        `Apply a 10–15% discount for bookings that fill the exact gap dates`,
        `Configure an OwnerRez gap pricing rule to automate this for all future short gaps`,
        `Enable the "last 48 hours" discount so any unfilled gap gets auto-discounted before it's lost`,
      ],
    })
  }

  // Rule 10: Seasonal opportunity — peak month coming, low occupancy
  const nextMonth      = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
  const nextMonthIndex = nextMonth.getUTCMonth()
  if (PEAK_MONTHS.has(nextMonthIndex) && occupancy_pct < 70) {
    const peakMultiplier = 1.35
    const peakTargetADR  = Math.round(MARKET_ADR * peakMultiplier)
    const peakRevPAR     = Math.round(peakTargetADR * 0.75)
    const currentRevPAR  = Math.round(adr * occupancy_pct / 100)
    const monthlyUpside  = Math.round((peakRevPAR - Math.max(currentRevPAR, 0)) * 30)
    const peakMonthName  = nextMonth.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" })
    recs.push({
      rule_key : "seasonal_opportunity",
      title    : `Peak Season Alert — Optimize ${name} for ${peakMonthName} Now`,
      body     : `${peakMonthName} is one of Appleton's highest-demand months and ${name} is entering the season at only ${occupancy_pct.toFixed(1)}% occupancy. Properties that raise rates and refresh listings 3–4 weeks before peak season consistently out-earn those that wait.`,
      priority : "critical",
      category : "pricing",
      impact_statement: `A peak-optimized property in ${peakMonthName} should target $${peakTargetADR}/night at 75%+ occupancy ($${peakRevPAR} RevPAR). Your current RevPAR is ~$${currentRevPAR} — a $${monthlyUpside.toLocaleString()} monthly opportunity.`,
      action_steps: [
        `Set ${peakMonthName} rates to $${peakTargetADR}/night as your new base immediately`,
        `Apply Friday–Saturday premium of 30% above weekday for peak summer demand`,
        `Raise minimum stay to 3 nights for peak weekends to maximize revenue per booking`,
        `Block off any planned personal-use dates now — don't lose prime inventory`,
        `Refresh listing cover photo and title with summer-specific imagery before peak traffic`,
        `Confirm key summer amenities (AC, outdoor space, proximity to lakes) are prominently featured`,
      ],
    })
  }

  return recs
}

// ── Auth helpers ───────────────────────────────────────────────────────────────

function checkCronSecret(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return null
}

// Vercel cron sends GET with Authorization: Bearer ${CRON_SECRET}
export async function GET(request: Request) {
  const denied = checkCronSecret(request)
  if (denied) return denied
  return generateRecommendations()
}

export async function POST() {
  return generateRecommendations()
}

// ── Main generator ─────────────────────────────────────────────────────────────

async function generateRecommendations() {
  const admin = createAdminClient()
  const today = new Date()

  const [{ data: propertiesRaw, error: propErr }, hiddenIds] = await Promise.all([
    admin
      .from("properties")
      .select("id, internal_name, external_name")
      .eq("is_active", true),
    getHiddenPropertyIds(),
  ])

  if (propErr || !propertiesRaw?.length) {
    return NextResponse.json({ error: "No active properties" }, { status: 400 })
  }

  const properties = propertiesRaw.filter(p => !hiddenIds.has(p.id))
  if (!properties.length) {
    return NextResponse.json({ generated: 0, resolved: 0, properties: 0 })
  }

  // ── Date strings ──────────────────────────────────────────────────────────
  const nowISO          = new Date().toISOString()
  const todayStr        = today.toISOString().slice(0, 10)
  const cutoffStr       = new Date(today.getTime() - PERIOD_DAYS * 86_400_000).toISOString().slice(0, 10)
  const recentCutoffStr = new Date(today.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10)
  const last14Str       = new Date(today.getTime() - 14           * 86_400_000).toISOString().slice(0, 10)
  const future30Str     = new Date(today.getTime() + 30           * 86_400_000).toISOString().slice(0, 10)
  const future60Str     = new Date(today.getTime() + 60           * 86_400_000).toISOString().slice(0, 10)

  const propertyIds = properties.map(p => p.id)

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [
    { data: pastBookings },
    { data: futureBookings },
    { data: reviews },
    { data: existingRecs },
  ] = await Promise.all([
    admin
      .from("bookings")
      .select("property_id, arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", cutoffStr)
      .lt("arrival", todayStr),

    admin
      .from("bookings")
      .select("property_id, arrival, departure")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", todayStr)
      .lte("arrival", future60Str)
      .order("arrival", { ascending: true }),

    admin
      .from("reviews")
      .select("property_id")
      .in("property_id", propertyIds),

    // Fetch existing active recs that have a rule_key (eligible for upsert / auto-resolve)
    admin
      .from("recommendations")
      .select("id, property_id, rule_key")
      .in("property_id", propertyIds)
      .eq("is_dismissed", false)
      .eq("is_completed" as any, false)
      .not("rule_key" as any, "is", null),
  ])

  // ── Build lookup: `{property_id}|{rule_key}` → existing rec id ────────────
  const existingMap = new Map<string, string>()
  for (const r of (existingRecs ?? []) as Array<{ id: string; property_id: string | null; rule_key: string | null }>) {
    if (r.property_id && r.rule_key) {
      existingMap.set(`${r.property_id}|${r.rule_key}`, r.id)
    }
  }

  // ── Aggregate past bookings ───────────────────────────────────────────────
  const byProperty = new Map<string, NonNullable<typeof pastBookings>>()
  for (const b of pastBookings ?? []) {
    const arr = byProperty.get(b.property_id) ?? []
    arr.push(b)
    byProperty.set(b.property_id, arr)
  }

  const futureByProperty = new Map<string, FutureBooking[]>()
  for (const b of futureBookings ?? []) {
    const arr = futureByProperty.get(b.property_id) ?? []
    arr.push({ arrival: b.arrival, departure: b.departure })
    futureByProperty.set(b.property_id, arr)
  }

  const reviewCountMap = new Map<string, number>()
  for (const r of reviews ?? []) {
    if (!r.property_id) continue
    reviewCountMap.set(r.property_id, (reviewCountMap.get(r.property_id) ?? 0) + 1)
  }

  // ── Per-property: generate rules and collect upsert rows ──────────────────
  const toUpsert: Record<string, unknown>[] = []
  const generatedKeysByProp = new Map<string, Set<string>>()  // prop_id → rule_keys fired

  for (const p of properties) {
    const pBookings    = byProperty.get(p.id) ?? []
    let   bookedNights = 0
    let   revenue      = 0
    let   recentCount  = 0
    let   last14Count  = 0

    for (const b of pBookings) {
      const nights = Math.max(
        0,
        (new Date(b.departure + "T00:00:00").getTime() - new Date(b.arrival + "T00:00:00").getTime())
        / 86_400_000,
      )
      bookedNights += nights
      const rev     = Number(b.net_revenue ?? b.total_amount ?? 0)
      revenue      += isFinite(rev) ? rev : 0
      if (b.arrival >= recentCutoffStr) recentCount++
      if (b.arrival >= last14Str)       last14Count++
    }

    const occupancy_pct = +(((bookedNights / PERIOD_DAYS) * 100).toFixed(1))
    const adr           = bookedNights > 0 ? +(revenue / bookedNights).toFixed(2) : 0
    const revpar        = +(revenue / PERIOD_DAYS).toFixed(2)
    const name          = p.internal_name || p.external_name

    const propFuture    = futureByProperty.get(p.id) ?? []
    const upcoming_30   = propFuture.filter(b => b.arrival <= future30Str).length

    const recs = generateRules({
      name,
      occupancy_pct,
      adr,
      revpar,
      recent_bookings : recentCount,
      bookings_last14 : last14Count,
      upcoming_30days : upcoming_30,
      review_count    : reviewCountMap.get(p.id) ?? 0,
      future_bookings : propFuture,
      today,
    })

    const firedKeys = new Set<string>()

    for (const r of recs) {
      firedKeys.add(r.rule_key)
      const mapKey    = `${p.id}|${r.rule_key}`
      const existingId = existingMap.get(mapKey)

      const row: Record<string, unknown> = {
        property_id      : p.id,
        title            : r.title,
        body             : r.body,
        priority         : r.priority,
        category         : r.category,
        impact_statement : r.impact_statement,
        action_steps     : r.action_steps,
        rule_key         : r.rule_key,
        refreshed_at     : nowISO,
        is_dismissed     : false,
        is_completed     : false,
      }

      if (existingId) {
        // Include id so upsert updates rather than inserts
        row.id = existingId
      }

      toUpsert.push(row)
    }

    generatedKeysByProp.set(p.id, firedKeys)
  }

  // ── Upsert all generated rows ─────────────────────────────────────────────
  let generated = 0
  if (toUpsert.length) {
    const { error: upsertErr } = await admin
      .from("recommendations")
      .upsert(toUpsert as any, { onConflict: "id" })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    generated = toUpsert.length
  }

  // ── Auto-resolve: active recs whose rule no longer applies ────────────────
  // Only touches recs that have a rule_key; leaves dismissed recs untouched.
  const toAutoResolveIds: string[] = []
  for (const r of (existingRecs ?? []) as Array<{ id: string; property_id: string | null; rule_key: string | null }>) {
    if (!r.property_id || !r.rule_key) continue
    const firedKeys = generatedKeysByProp.get(r.property_id)
    if (!firedKeys || !firedKeys.has(r.rule_key)) {
      toAutoResolveIds.push(r.id)
    }
  }

  let resolved = 0
  if (toAutoResolveIds.length) {
    const { error: resolveErr } = await admin
      .from("recommendations")
      .update({
        is_completed : true,
        completed_at : nowISO,
        metadata     : { auto_resolved: true, completed_note: "Auto-resolved: condition no longer met" },
      } as any)
      .in("id", toAutoResolveIds)
    if (resolveErr) return NextResponse.json({ error: resolveErr.message }, { status: 500 })
    resolved = toAutoResolveIds.length
  }

  return NextResponse.json({ generated, resolved, properties: properties.length })
}
