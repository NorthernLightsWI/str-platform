import { NextResponse } from "next/server"
import { Resend } from "resend"
import { createAdminClient } from "@/lib/supabase/admin"
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
    (supabase as any).from("properties").select("id, internal_name, external_name").eq("is_active", true),
    (supabase as any).from("bookings")
      .select("property_id, arrival, departure, net_revenue, is_block, status")
      .gte("arrival", period.start)
      .lt("arrival", period.end)
      .eq("is_block", false)
      .neq("status", "cancelled"),
    (supabase as any).from("bookings")
      .select("property_id, arrival, departure, net_revenue, is_block, status")
      .gte("arrival", period.prevStart)
      .lt("arrival", period.prevEnd)
      .eq("is_block", false)
      .neq("status", "cancelled"),
    (supabase as any).from("reviews")
      .select("property_id, overall_rating"),
    (supabase as any).from("recommendations")
      .select("property_id, title, priority, is_dismissed, is_completed")
      .eq("is_dismissed", false)
      .eq("is_completed", false),
    (supabase as any).from("property_amenities")
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
  const props       = (properties ?? []) as Array<{ id: string; internal_name: string; external_name: string }>
  const currBook    = (currBookings ?? []) as Array<{ property_id: string; arrival: string; departure: string; net_revenue: number }>
  const prevBook    = (prevBookings ?? []) as Array<{ property_id: string; net_revenue: number }>
  const reviewList  = (reviews ?? [])     as Array<{ property_id: string; overall_rating: number }>
  const recList     = (recs ?? [])        as Array<{ property_id: string; title: string; priority: string }>
  const amenities   = (amenityRows ?? []) as Array<{ property_id: string; amenity_key: string; is_present: boolean }>

  const propertyRows: PropertyReportRow[] = props.map(p => {
    const myCurr = currBook.filter(b => b.property_id === p.id)
    const myPrev = prevBook.filter(b => b.property_id === p.id)

    const revenue     = myCurr.reduce((s, b) => s + (b.net_revenue ?? 0), 0)
    const revenuePrev = myPrev.reduce((s, b) => s + (b.net_revenue ?? 0), 0)

    // Booked nights = sum of (departure - arrival) per booking, capped at period
    const bookedNights = myCurr.reduce((s, b) => {
      const nights = Math.round(
        (new Date(b.departure).getTime() - new Date(b.arrival).getTime()) / 86_400_000,
      )
      return s + Math.max(0, nights)
    }, 0)

    const occupancy  = Math.min(100, Math.round((bookedNights / 30) * 100))
    const adr        = bookedNights > 0 ? revenue / bookedNights : 0

    // Reviews: average rating for this property
    const propReviews = reviewList.filter(r => r.property_id === p.id)
    const avgRating   = propReviews.length
      ? propReviews.reduce((s, r) => s + (r.overall_rating ?? 0), 0) / propReviews.length
      : null

    // Top recommendation: highest-priority open rec
    const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const propRecs    = recList.filter(r => r.property_id === p.id)
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
    }
  })

  const topGaps = computeAmenityGaps(props, amenities)

  // ── Build and send email ──────────────────────────────────────────────────
  const html   = buildMonthlyEmailHtml({
    month      : period.monthLabel,
    periodLabel: period.periodLabel,
    properties : propertyRows,
    topGaps,
  })

  const resend = new Resend(resendKey)
  const { data: emailData, error: emailError } = await resend.emails.send({
    from   : "FCCH Reports <reports@resend.dev>",
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
