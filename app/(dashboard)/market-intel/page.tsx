import { createAdminClient } from "@/lib/supabase/admin"
import {
  MarketIntelClient,
  type PortfolioSummary,
} from "@/components/market-intel/market-intel-client"

const PERIOD_DAYS = 365

export default async function MarketIntelPage() {
  const admin = createAdminClient()

  const periodStart    = new Date()
  periodStart.setFullYear(periodStart.getFullYear() - 1)
  const periodStartStr = periodStart.toISOString().slice(0, 10)
  const todayStr       = new Date().toISOString().slice(0, 10)

  const [{ data: propData }, { data: bookingData }] = await Promise.all([
    admin
      .from("properties")
      .select("id")
      .eq("is_active", true),

    admin
      .from("bookings")
      .select("arrival, departure, net_revenue, total_amount")
      .neq("status", "cancelled")
      .eq("is_block", false)
      .gte("arrival", periodStartStr)
      .lt("arrival", todayStr),
  ])

  const propCount  = (propData ?? []).length
  let   totalBooked  = 0
  let   totalRevenue = 0

  for (const b of bookingData ?? []) {
    const arrMs  = new Date(b.arrival   + "T00:00:00").getTime()
    const depMs  = new Date(b.departure + "T00:00:00").getTime()
    const nights = Math.max(0, (depMs - arrMs) / 86_400_000)
    totalBooked  += nights
    const rev     = Number(b.net_revenue ?? b.total_amount ?? 0)
    totalRevenue += isFinite(rev) ? rev : 0
  }

  const totalAvail = PERIOD_DAYS * Math.max(propCount, 1)
  const portOcc    = totalAvail  > 0 ? (totalBooked  / totalAvail) * 100 : 0
  const portADR    = totalBooked > 0 ? totalRevenue  / totalBooked       : 0
  const portRevPAR = totalAvail  > 0 ? totalRevenue  / totalAvail        : 0

  const summary: PortfolioSummary = {
    occupancy : +portOcc.toFixed(1),
    adr       : +portADR.toFixed(2),
    revpar    : +portRevPAR.toFixed(2),
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Market Intelligence
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Appleton, WI STR market · trailing 12-month benchmarks
        </p>
      </div>

      <MarketIntelClient summary={summary} />
    </div>
  )
}
