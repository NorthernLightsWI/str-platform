import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PropertiesTable, type PropertyRow } from "@/components/properties/properties-table"

// ── Date helpers ──────────────────────────────────────────────────────────────

function utcToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000)
}

function toYMD(d: Date) {
  return d.toISOString().slice(0, 10)
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PropertiesPage() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const today   = utcToday()
  const cmStart = monthStart(today)
  const cmEnd   = addDays(today, 1)   // exclusive — includes today
  const cmDays  = (cmEnd.getTime() - cmStart.getTime()) / 86_400_000

  const [{ data: propData }, { data: bkData }, { data: hiddenSetting }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, external_name, internal_name, city, state, bedrooms, bathrooms, max_guests, is_active")
      .order("external_name"),

    supabase
      .from("bookings")
      .select("property_id, arrival, departure, total_amount, status")
      .neq("is_block", true)
      .neq("status", "cancelled")
      .gte("arrival", toYMD(cmStart))
      .lt("arrival",  toYMD(cmEnd)),

    admin
      .from("app_settings")
      .select("value")
      .eq("key", "hidden_properties")
      .single(),
  ])

  let hiddenIds = new Set<string>()
  try {
    const raw = (hiddenSetting as { value: unknown } | null)?.value
    if (raw) hiddenIds = new Set(JSON.parse(String(raw)))
  } catch { /* malformed JSON — treat as empty */ }

  const properties = (propData ?? []).filter(p => !hiddenIds.has(p.id))
  const bookings   = bkData ?? []

  // Group bookings by property_id
  const bkByProp = new Map<string, typeof bookings>()
  for (const b of bookings) {
    const list = bkByProp.get(b.property_id) ?? []
    list.push(b)
    bkByProp.set(b.property_id, list)
  }

  const rows: PropertyRow[] = properties.map(p => {
    const pb           = bkByProp.get(p.id) ?? []
    const mtdRevenue   = pb.reduce((s, b) => s + (b.total_amount ?? 0), 0)
    const bookedNights = pb.reduce((s, b) => {
      const a = new Date(b.arrival   + "T00:00:00Z")
      const d = new Date(b.departure + "T00:00:00Z")
      return s + (d.getTime() - a.getTime()) / 86_400_000
    }, 0)
    const mtdOccupancy = cmDays > 0 ? (bookedNights / cmDays) * 100 : 0
    const mtdAdr       = bookedNights > 0 ? mtdRevenue / bookedNights : 0

    return {
      id           : p.id,
      external_name: p.external_name,
      internal_name: p.internal_name,
      city         : p.city,
      state        : p.state,
      bedrooms     : p.bedrooms,
      bathrooms    : p.bathrooms,
      max_guests   : p.max_guests,
      is_active    : p.is_active,
      mtdRevenue   : Math.round(mtdRevenue),
      mtdOccupancy : Math.min(100, mtdOccupancy),
      mtdAdr       : Math.round(mtdAdr),
    }
  })

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Properties</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {properties.length} {properties.length === 1 ? "property" : "properties"} visible
          {hiddenIds.size > 0 && ` · ${hiddenIds.size} hidden`}
          {" · MTD metrics through today"}
        </p>
      </div>

      <PropertiesTable rows={rows} />
    </div>
  )
}
