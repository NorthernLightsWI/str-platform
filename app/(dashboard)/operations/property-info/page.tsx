import { createClient }      from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PropertyInfoClient,
  type PropertyItemFull,
  type VendorContact,
  type RecurringItem,
  type ChangelogEntry,
} from "@/components/operations/property-info/property-info-client"

export default async function PropertyInfoPage() {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: propData },
    { data: infoData },
    { data: vendorData },
    { data: recurringData },
    { data: changelogData },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user!.id)
      .single(),

    admin
      .from("properties")
      .select("id, external_name, internal_name, city, state")
      .eq("is_active", true)
      .order("external_name"),

    admin
      .from("property_operational_info")
      .select("*"),

    (admin as any)
      .from("vendor_contacts")
      .select("*")
      .order("created_at"),

    (admin as any)
      .from("recurring_maintenance")
      .select("*")
      .order("created_at"),

    (admin as any)
      .from("property_info_changelog")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
  ])

  const role    = profile?.role ?? "admin"
  const canEdit = role === "admin" || role === "cleaner"

  const infoMap    = new Map((infoData ?? []).map(i => [i.property_id, i]))
  const vendors    = ((vendorData  as any[] | null)   ?? []) as VendorContact[]
  const recurring  = ((recurringData as any[] | null) ?? []) as RecurringItem[]
  const changelog  = ((changelogData as any[] | null) ?? []) as ChangelogEntry[]

  const properties: PropertyItemFull[] = (propData ?? []).map(p => ({
    id          : p.id,
    name        : p.internal_name || p.external_name,
    externalName: p.external_name,
    city        : p.city ?? null,
    state       : p.state ?? null,
    info        : (infoMap.get(p.id) ?? null) as PropertyItemFull["info"],
    vendors     : vendors.filter(v => v.property_id === p.id),
    recurring   : recurring.filter(r => r.property_id === p.id),
    changelog   : changelog.filter(c => c.property_id === p.id),
  }))

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Property Info</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Access codes, Wi-Fi, vendor contacts, and maintenance schedules.
        </p>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-sm font-medium text-foreground">No properties found</p>
          <p className="mt-1 text-xs text-muted-foreground">Add active properties to manage their info.</p>
        </div>
      ) : (
        <PropertyInfoClient properties={properties} role={role} canEdit={canEdit} />
      )}
    </div>
  )
}
