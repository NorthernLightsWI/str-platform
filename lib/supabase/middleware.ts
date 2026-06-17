import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/types/database"

const AUTH_ROUTES         = new Set(["/login", "/signup"])
const ADMIN_HOME          = "/overview"
const CLEANER_HOME        = "/operations/property-overview"
const MAINTENANCE_HOME    = "/operations/property-info"
const MAINTENANCE_ALLOWED = ["/operations/property-info", "/operations/maintenance"]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isAuthRoute  = AUTH_ROUTES.has(pathname)
  const isApiRoute   = pathname.startsWith("/api/")

  // Unauthenticated user hitting a protected route → send to login
  if (!user && !isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (user && !isApiRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    const role = profile?.role ?? "admin"

    // Authenticated user on an auth page → redirect to their home
    if (isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = role === "maintenance" ? MAINTENANCE_HOME
                   : role === "cleaner"     ? CLEANER_HOME
                   : ADMIN_HOME
      return NextResponse.redirect(url)
    }

    // Maintenance users can only access property-info and maintenance pages
    if (role === "maintenance") {
      const allowed = MAINTENANCE_ALLOWED.some(
        p => pathname === p || pathname.startsWith(p + "/")
      )
      if (!allowed) {
        const url = request.nextUrl.clone()
        url.pathname = MAINTENANCE_HOME
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
