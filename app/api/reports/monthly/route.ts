import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
import { buildPropertyGroups, childIdSet } from "@/lib/property-groups"
import { nightsInWindow } from "@/lib/metrics"
import {
  buildMonthlyEmailHtml,
  computeAmenityGaps,
  computePropertyAmenityScore,
  type PropertyReportRow,
} from "@/lib/reports/monthly-email"

// ── Date window helpers ───────────────────────────────────────────────────────

function getPeriodBounds() {
  const now  = new Date()
  const end  = new Date(now)
  end.setHours(0, 0, 0, 0)

  const start = new Date(end)
  start.setDate(start.getDate() - 30)

  const prevEnd   = new Date(start)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevStart.getDate() - 30)

  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const fmtShort   = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const periodLabel = `${fmtShort(start)} – ${fmtShort(new Date(end.getTime() - 1))}`

  return {
    start    : start.toISOString(),
    end      : end.toISOString(),
    prevStart: prevStart.toISOString(),
    prevEnd  : prevEnd.toISOString(),
    monthLabel,
    periodLabel,
  }
}

// ── Core report function ──────────────────────────────────────────────────────

async function generateAndSendReport(): Promise<NextResponse> {
  const supabase = createAdminClient()
  const period   = getPeriodBounds()

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [
    { data: settingsRows },
    { data: properties },
    { data: currBookings },
    { data: prevBookings },
    { data: reviews },
    { data: recs },
    { data: amenityRows },
  ] = await Promise.all([
    supabase.from("app_settings").select("key, value"),
    (supabase as any).from("visible_properties").select("id, internal_name, external_name, parent_property_id, is_active"),
    (supabase as any).from("visible_bookings")
      .select("property_id, arrival, departure, total_amount, is_block, status")
      .lt("arrival", period.end)
      .gt("departure", period.start)
      .neq("is_block", true)
      .neq("status", "cancelled"),
    (supabase as any).from("visible_bookings")
      .select("property_id, arrival, departure, total_amount, is_block, status")
      .lt("arrival", period.prevEnd)
      .gt("departure", period.prevStart)
      .neq("is_block", true)
      .neq("status", "cancelled"),
    (supabase as any).from("visible_reviews")
      .select("property_id, overall_rating"),
    (supabase as any).from("visible_recommendations")
      .select("property_id, title, priority, is_dismissed, is_completed")
      .eq("is_dismissed", false)
      .eq("is_completed", false),
    (supabase as any).from("visible_property_amenities")
      .select("property_id, amenity_key, is_present"),
  ])

  // ── Parse settings ────────────────────────────────────────────────────────
  const settings: Record<string, string> = {}
  for (const row of settingsRows ?? []) {
    let val = row.value as string
    try { val = JSON.parse(val) } catch { /* use raw */ }
    settings[row.key] = val
  }

  const recipientEmail = settings.report_email
  if (!recipientEmail) {
    return NextResponse.json({ error: "report_email not set in app_settings" }, { status: 400 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey || resendKey.startsWith("re_placeholder")) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 400 })
  }

  // ── Build per-property stats ──────────────────────────────────────────────
  type RawProp = { id: string; internal_name: string | null; external_name: string; parent_property_id: string | null; is_active: boolean }

  const currBookPropIds = new Set((currBookings ?? []).map((b: { property_id: string }) => b.property_id))

  // visible_properties already excludes hidden; include active + inactive with current bookings
  const allProps    = ((properties ?? []) as RawProp[])
    .filter(p => p.is_active || currBookPropIds.has(p.id))
  const groups      = buildPropertyGroups(allProps)
  const cids        = childIdSet(groups)
  // Build map: child ID → [all sibling IDs including self and parent]
  const groupAllIds = new Map<string, string[]>(groups.flatMap(g => g.allIds.map(id => [id, g.allIds])))

  // Report shows only root-level properties (children are absorbed)
  const props       = allProps.filter(p => !cids.has(p.id))
  // Amenity gap analysis is forward-looking — active properties only
  const activeProps = props.filter(p => p.is_active)

  type PeriodBook = { property_id: string; arrival: string; departure: string; total_amount: number | null }
  const currBook    = (currBookings ?? []) as PeriodBook[]
  const prevBook    = (prevBookings ?? []) as PeriodBook[]
  const reviewList  = (reviews ?? [])     as Array<{ property_id: string; overall_rating: number }>
  const recList     = (recs ?? [])        as Array<{ property_id: string; title: string; priority: string }>
  const amenities   = (amenityRows ?? []) as Array<{ property_id: string; amenity_key: string; is_present: boolean }>

  const REP_DAY_MS  = 86_400_000
  const currStart   = period.start.slice(0, 10)
  const currEnd     = period.end.slice(0, 10)
  const prevStart   = period.prevStart.slice(0, 10)
  const prevEnd     = new Date(new Date(period.prevEnd).getTime() - REP_DAY_MS).toISOString().slice(0, 10)
  const todayStrRep = new Date().toISOString().slice(0, 10)

  function windowedMetrics(bks: PeriodBook[], wStart: string, wEnd: string) {
    let nights = 0, rev = 0
    for (const b of bks) {
      const n = nightsInWindow(b, wStart, wEnd, todayStrRep)
      if (n <= 0) continue
      const fullN = Math.max(1, (new Date(b.departure).getTime() - new Date(b.arrival).getTime()) / REP_DAY_MS)
      nights += n
      rev    += (n / fullN) * (b.total_amount ?? 0)
    }
    return { nights, rev }
  }

  const propertyRows: PropertyReportRow[] = props.map(p => {
    // For groups, aggregate bookings from all member IDs
    const ids    = groupAllIds.get(p.id) ?? [p.id]
    const myCurr = currBook.filter(b => ids.includes(b.property_id))
    const myPrev = prevBook.filter(b => ids.includes(b.property_id))

    const { nights: bookedNights, rev: revenue     } = windowedMetrics(myCurr, currStart, currEnd)
    const { rev:    revenuePrev }                     = windowedMetrics(myPrev, prevStart, prevEnd)

    const occupancy  = Math.min(100, Math.round((bookedNights / 30) * 100))
    const adr        = bookedNights > 0 ? revenue / bookedNights : 0

    // Reviews: average rating across all group members
    const propReviews = reviewList.filter(r => ids.includes(r.property_id))
    const avgRating   = propReviews.length
      ? propReviews.reduce((s, r) => s + (r.overall_rating ?? 0), 0) / propReviews.length
      : null

    // Top recommendation: highest-priority open rec across all group members
    const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const propRecs    = recList.filter(r => ids.includes(r.property_id))
    const topRec      = propRecs.length
      ? [...propRecs].sort((a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
        )[0].title
      : null

    const amenityScore = computePropertyAmenityScore(p.id, amenities)

    return {
      id          : p.id,
      name        : p.internal_name ?? p.external_name,
      revenue,
      revenuePrev,
      bookedNights,
      adr,
      occupancy,
      amenityScore,
      topRec,
      avgRating,
      isActive    : p.is_active,
    }
  })

  const topGaps = computeAmenityGaps(activeProps, amenities)

  // ── Build and send email ──────────────────────────────────────────────────
  const html   = buildMonthlyEmailHtml({
    month      : period.monthLabel,
    periodLabel: period.periodLabel,
    properties : propertyRows,
    topGaps,
  })

  const resend = new Resend(resendKey)
  const { data: emailData, error: emailError } = await resend.emails.send({
    from   : "FCCH Reports <reports@foxcitiescorporatehousing.com>",
    to     : [recipientEmail],
    subject: `📊 ${period.monthLabel} Portfolio Report`,
    html,
  })

  if (emailError) {
    console.error("[monthly-report] Resend error:", emailError)
    return NextResponse.json({ error: emailError.message ?? "Failed to send email" }, { status: 500 })
  }

  return NextResponse.json({
    ok             : true,
    emailId        : emailData?.id,
    propertiesCount: propertyRows.length,
    recipient      : recipientEmail,
  })
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return generateAndSendReport()
}

export async function POST(request: Request) {
  const secret = process.env.SYNC_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  return generateAndSendReport()
}
