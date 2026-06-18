import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getHiddenPropertyIds } from "@/lib/hidden-properties"
import {
  AmenityGapClient,
  type PropertyRow,
  type AmenityRecord,
} from "@/components/amenity-gap/amenity-gap-client"

export default async function AmenityGapPage() {
  const supabase = await createClient()
  const admin    = createAdminClient() as any

  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: propData,    error: propErr    },
    { data: amenityData, error: amenityErr },
    hiddenIds,
  ] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user!.id).single(),

    admin
      .from("properties")
      .select("id, external_name, internal_name")
      .eq("is_active", true)
      .order("external_name"),

    admin
      .from("property_amenities")
      .select("property_id, amenity_key, is_present"),

    getHiddenPropertyIds(),
  ])

  if (propErr)    console.error("[amenity-gap] properties error:",       propErr)
  if (amenityErr) console.error("[amenity-gap] property_amenities error:", amenityErr)

  type RawProp = { id: string; external_name: string; internal_name: string | null }

  const properties: PropertyRow[] = ((propData ?? []) as RawProp[])
    .filter(p => !hiddenIds.has(p.id))
    .map(p => ({ id: p.id, name: p.internal_name || p.external_name }))

  const records: AmenityRecord[] = ((amenityData ?? []) as AmenityRecord[])
    .filter(r => !hiddenIds.has(r.property_id))

  const isAdmin = profile?.role === "admin"

  return (
    <div className="p-6 space-y-2 max-w-[1400px]">
      <div className="mb-5">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ fontFamily: "'Roboto Mono', monospace", color: "#E88159" }}
        >
          Amenity Gap Analysis
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          42 market-standard amenities across 10 categories ·{" "}
          {properties.length} active {properties.length === 1 ? "property" : "properties"}
          {!isAdmin && " · Read-only view"}
        </p>
      </div>

      <AmenityGapClient
        properties={properties}
        initialRecords={records}
        isAdmin={isAdmin}
      />
    </div>
  )
}
