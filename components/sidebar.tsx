"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  TrendingUp,
  Lightbulb,
  CheckSquare,
  Star,
  Globe,
  Bell,
  MapPin,
  Sparkles,
  ClipboardList,
  Wrench,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logout } from "@/app/actions/auth"

type NavItem = {
  label : string
  href  : string
  icon  : React.ElementType
}

const ADMIN_ITEMS: NavItem[] = [
  { label: "Overview",          href: "/overview",          icon: LayoutDashboard },
  { label: "Properties",        href: "/properties",        icon: Building2       },
  { label: "Analytics",         href: "/analytics",         icon: BarChart3       },
  { label: "Benchmarks",        href: "/benchmarks",        icon: TrendingUp      },
  { label: "Recommendations",   href: "/recommendations",   icon: Lightbulb       },
  { label: "Tasks",             href: "/tasks",             icon: CheckSquare     },
  { label: "Reviews",           href: "/reviews",           icon: Star            },
  { label: "Market Intel",      href: "/market-intel",      icon: Globe           },
  { label: "Alerts",            href: "/alerts",            icon: Bell            },
]

const OPS_ITEMS: NavItem[] = [
  { label: "Property Overview", href: "/operations/property-overview", icon: MapPin        },
  { label: "Cleaner Dashboard", href: "/operations/cleaner-dashboard", icon: Sparkles      },
  { label: "Cleaning History",  href: "/operations/cleaning-history",  icon: ClipboardList },
  { label: "Maintenance",       href: "/operations/maintenance",       icon: Wrench        },
  { label: "Property Info",     href: "/operations/property-info",     icon: FileText      },
]

const MAINTENANCE_ITEMS: NavItem[] = [
  { label: "Property Info", href: "/operations/property-info", icon: FileText },
  { label: "Maintenance",   href: "/operations/maintenance",   icon: Wrench   },
]

function NavLink({
  item,
  collapsed,
  onClose,
}: {
  item      : NavItem
  collapsed : boolean
  onClose?  : () => void
}) {
  const pathname = usePathname()
  const active   = pathname === item.href || pathname.startsWith(item.href + "/")
  const Icon     = item.icon

  return (
    <Link
      href={item.href}
      onClick={onClose}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary/20 text-sidebar-primary"
          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}

function SectionDivider({ label, collapsed }: { label: string; collapsed: boolean }) {
  return (
    <div className={cn("pt-5 pb-2", collapsed ? "px-2" : "px-3")}>
      {collapsed ? (
        <div className="h-px bg-sidebar-border" />
      ) : (
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35">
          {label}
        </p>
      )}
    </div>
  )
}

interface SidebarProps {
  userName       : string
  role           : string
  mobileOpen?    : boolean
  onMobileClose? : () => void
}

export function Sidebar({ userName, role, mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isAdmin       = role === "admin"
  const isMaintenance = role === "maintenance"
  const initial       = userName.charAt(0).toUpperCase()

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border",
        // Mobile: fixed overlay that slides in/out
        "fixed inset-y-0 left-0 z-50 w-72 transition-transform duration-200 ease-in-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: sticky in-flow column, collapse toggle applies
        "md:sticky md:top-0 md:shrink-0 md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-60",
      )}
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between gap-2",
        )}
      >
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-sidebar-foreground tracking-tight">
            FCCH Platform
          </span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="size-4" />
            : <ChevronLeft  className="size-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {isMaintenance ? (
          MAINTENANCE_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} onClose={onMobileClose} />
          ))
        ) : (
          <>
            {isAdmin && (
              <>
                {ADMIN_ITEMS.map((item) => (
                  <NavLink key={item.href} item={item} collapsed={collapsed} onClose={onMobileClose} />
                ))}
                <SectionDivider label="Operations" collapsed={collapsed} />
              </>
            )}

            {OPS_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} onClose={onMobileClose} />
            ))}

            {isAdmin && (
              <NavLink
                item={{ label: "Settings", href: "/settings", icon: Settings }}
                collapsed={collapsed}
                onClose={onMobileClose}
              />
            )}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3 space-y-1">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          {/* Avatar */}
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
            {initial}
          </div>

          {!collapsed && (
            <>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-sidebar-foreground leading-tight">
                  {userName}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/45 capitalize leading-tight">
                  {role}
                </span>
              </div>

              <form action={logout}>
                <button
                  type="submit"
                  title="Sign out"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </>
          )}
        </div>

        {/* Collapsed logout */}
        {collapsed && (
          <form action={logout}>
            <button
              type="submit"
              title="Sign out"
              className="flex w-full items-center justify-center rounded-md py-1.5 text-sidebar-foreground/45 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        )}
      </div>
    </aside>
  )
}
