"use client"

import { useState, useEffect } from "react"
import { Menu, Eye } from "lucide-react"
import { Sidebar } from "@/components/sidebar"

const PREVIEW_KEY = "fcch_cleaner_preview"

interface DashboardShellProps {
  children  : React.ReactNode
  userName  : string
  role      : string
}

export function DashboardShell({ children, userName, role }: DashboardShellProps) {
  const [sidebarOpen,    setSidebarOpen]    = useState(false)
  const [cleanerPreview, setCleanerPreview] = useState(false)

  const isAdmin = role === "admin"

  // Hydrate from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    if (!isAdmin) return
    if (localStorage.getItem(PREVIEW_KEY) === "true") setCleanerPreview(true)
  }, [isAdmin])

  function togglePreview() {
    setCleanerPreview(prev => {
      const next = !prev
      localStorage.setItem(PREVIEW_KEY, String(next))
      return next
    })
  }

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
        cleanerPreview={cleanerPreview}
        onTogglePreview={isAdmin ? togglePreview : undefined}
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

          {/* Mobile preview badge */}
          {cleanerPreview && (
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              <Eye className="size-3" />
              Cleaner Preview
            </span>
          )}
        </header>

        {/* Preview banner */}
        {isAdmin && cleanerPreview && (
          <div className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-400">
              <Eye className="size-4 shrink-0" />
              Previewing as Cleaner — operations sidebar only, no role changes
            </div>
            <button
              onClick={togglePreview}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              Back to Admin
            </button>
          </div>
        )}

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
