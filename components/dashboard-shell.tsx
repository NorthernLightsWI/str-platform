"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "@/components/sidebar"

interface DashboardShellProps {
  children  : React.ReactNode
  userName  : string
  role      : string
}

export function DashboardShell({ children, userName, role }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        userName={userName}
        role={role}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile header bar */}
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-sidebar px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          <span className="ml-3 text-sm font-semibold text-sidebar-foreground tracking-tight">
            FCCH Platform
          </span>
        </header>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
