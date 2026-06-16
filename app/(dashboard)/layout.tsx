import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardShell } from "@/components/dashboard-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single()

  const userName = profile?.full_name ?? user.email ?? "User"
  const role     = profile?.role     ?? "admin"

  return (
    <DashboardShell userName={userName} role={role}>
      {children}
    </DashboardShell>
  )
}
