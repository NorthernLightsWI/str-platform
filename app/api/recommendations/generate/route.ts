import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

const MARKET_OCC    = 57
const MARKET_ADR    = 206.60
const MARKET_REVPAR = +(MARKET_ADR * MARKET_OCC / 100).toFixed(2)
const PERIOD_DAYS   = 90
const RECENT_DAYS   = 30

// ── Rule output type ───────────────────────────────────────────────────────

type Priority = "critical" | "high" | "medium" | "low"
type Category = "pricing" | "occupancy" | "listing_quality" | "reviews" | "ranking"

type GeneratedRec = {
  title            : string
  body             : string
  priority         : Priority
  category         : Category
  impact_statement : string
  action_steps     : string[]
}

// ── Rule engine ────────────────────────────────────────────────────────────

function generateRules(metrics: {
  name          : string
  occupancy_pct : number
  adr           : number
  revpar        : number
  recent_bookings: number
}): GeneratedRec[] {
  const { name, occupancy_pct, adr, revpar, recent_bookings } = metrics
  const recs: GeneratedRec[] = []

  // ── Rule 1/2: Low occupancy ──────────────────────────────────────────────
  if (occupancy_pct < 20) {
    recs.push({
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
    recs.push({
      title    : "Below-Average Occupancy",
      body     : `${name} is at ${occupancy_pct.toFixed(1)}% occupancy over the last ${PERIOD_DAYS} days, compared to the Appleton market average of ${MARKET_OCC}%. There is significant room to fill more nights.`,
      priority : "high",
      category : "occupancy",
      impact_statement: `Closing the gap to market average (${MARKET_OCC}%) could increase revenue by ~${Math.round((MARKET_OCC - occupancy_pct) / occupancy_pct * 100)}%.`,
      action_steps: [
        `Reduce rates 10–15% during slow periods to attract more bookings`,
        `Activate gap-fill pricing for 1–2 night gaps between reservations`,
        `Consider reducing minimum stay length to increase booking opportunities`,
        `Run a promotion for 3+ night stays to attract longer bookings`,
      ],
    })
  }

  // ── Rule 3: ADR more than 30% below market ───────────────────────────────
  const adrGap = MARKET_ADR - adr
  if (adr > 0 && adrGap / MARKET_ADR > 0.30) {
    recs.push({
      title    : "ADR Significantly Below Market",
      body     : `${name} has an ADR of $${adr.toFixed(0)}, which is $${adrGap.toFixed(0)} (${Math.round(adrGap / MARKET_ADR * 100)}%) below the Appleton market average of $${MARKET_ADR.toFixed(0)}. Even with high occupancy this limits total revenue.`,
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

  // ── Rule 4: No bookings in last 30 days ──────────────────────────────────
  if (recent_bookings === 0) {
    recs.push({
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

  // ── Rule 5: High occupancy — consider raising rates ───────────────────────
  if (occupancy_pct > 80) {
    recs.push({
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

  // ── Rule 6: RevPAR below $50 ─────────────────────────────────────────────
  if (revpar < 50 && revpar >= 0) {
    recs.push({
      title    : "Very Low RevPAR",
      body     : `${name} has a RevPAR of $${revpar.toFixed(0)}, far below the Appleton market benchmark of $${MARKET_REVPAR.toFixed(0)}. Low RevPAR means the property isn't generating enough revenue relative to its available nights.`,
      priority : "high",
      category : "pricing",
      impact_statement: `Reaching the market RevPAR of $${MARKET_REVPAR.toFixed(0)} would represent a ${MARKET_REVPAR > 0 ? Math.round((MARKET_REVPAR - revpar) / revpar * 100) : "significant"}% revenue increase over ${PERIOD_DAYS} days.`,
      action_steps: [
        `Address both occupancy and ADR simultaneously — low RevPAR is usually a combined problem`,
        `Set a RevPAR floor target of $${Math.round(MARKET_REVPAR * 0.7)} and work backwards to required rate × occupancy`,
        `Evaluate whether listing on additional platforms (Vrbo, direct bookings) would increase volume`,
        `Check if cleaning fees or other add-on fees are reducing booking conversion`,
      ],
    })
  }

  return recs
}

// ── Route handler ──────────────────────────────────────────────────────────

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

async function generateRecommendations() {
  const admin = createAdminClient()

  const { data: properties, error: propErr } = await admin
    .from("properties")
    .select("id, internal_name, external_name")
    .eq("is_active", true)

  if (propErr || !properties?.length) {
    return NextResponse.json({ error: "No active properties" }, { status: 400 })
  }

  // ── Fetch bookings for analysis window ──────────────────────────────────
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - PERIOD_DAYS)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const todayStr  = new Date().toISOString().slice(0, 10)

  const recentCutoff = new Date()
  recentCutoff.setDate(recentCutoff.getDate() - RECENT_DAYS)
  const recentCutoffStr = recentCutoff.toISOString().slice(0, 10)

  const { data: bookings } = await admin
    .from("bookings")
    .select("property_id, arrival, departure, net_revenue, total_amount")
    .neq("status", "cancelled")
    .eq("is_block", false)
    .gte("arrival", cutoffStr)
    .lt("arrival", todayStr)

  // ── Compute per-property metrics ─────────────────────────────────────────
  const byProperty = new Map<string, NonNullable<typeof bookings>>()
  for (const b of bookings ?? []) {
    const arr = byProperty.get(b.property_id) ?? []
    arr.push(b)
    byProperty.set(b.property_id, arr)
  }

  const propertyIds = properties.map(p => p.id)

  // Clear existing active recs before inserting fresh ones
  await admin
    .from("recommendations")
    .delete()
    .in("property_id", propertyIds)
    .eq("is_dismissed", false)
    .eq("is_completed", false)

  const rows: {
    property_id      : string
    title            : string
    body             : string
    priority         : string
    category         : string
    impact_statement : string
    action_steps     : string[]
    is_dismissed     : boolean
    is_completed     : boolean
  }[] = []

  for (const p of properties) {
    const pBookings    = byProperty.get(p.id) ?? []
    let   bookedNights = 0
    let   revenue      = 0
    let   recentCount  = 0

    for (const b of pBookings) {
      const arrMs  = new Date(b.arrival   + "T00:00:00").getTime()
      const depMs  = new Date(b.departure + "T00:00:00").getTime()
      const nights = Math.max(0, (depMs - arrMs) / 86_400_000)
      bookedNights += nights
      const rev = Number(b.net_revenue ?? b.total_amount ?? 0)
      revenue += isFinite(rev) ? rev : 0
      if (b.arrival >= recentCutoffStr) recentCount++
    }

    const occupancy_pct = +(((bookedNights / PERIOD_DAYS) * 100).toFixed(1))
    const adr           = bookedNights > 0 ? +(revenue / bookedNights).toFixed(2) : 0
    const revpar        = +(revenue / PERIOD_DAYS).toFixed(2)
    const name          = p.internal_name || p.external_name

    const recs = generateRules({ name, occupancy_pct, adr, revpar, recent_bookings: recentCount })

    for (const r of recs) {
      rows.push({
        property_id      : p.id,
        title            : r.title,
        body             : r.body,
        priority         : r.priority,
        category         : r.category,
        impact_statement : r.impact_statement,
        action_steps     : r.action_steps,
        is_dismissed     : false,
        is_completed     : false,
      })
    }
  }

  if (rows.length) {
    const { error: insErr } = await admin.from("recommendations").insert(rows)
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ generated: rows.length })
}
