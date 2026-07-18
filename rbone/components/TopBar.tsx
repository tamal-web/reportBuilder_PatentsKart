"use client"
import { useTheme } from "next-themes"
import { useState } from "react"
import { useEffect } from "react"
import { Button } from "./ui/button"
import { Search } from "lucide-react"
import { GlobalSearch } from "./GlobalSearch"
import { Sun, Moon } from "lucide-react"
import { useCallback } from "react"
import { api, ReportListItem } from "@/lib/api"

export const TopBar = () => {
  const [searchOpen, setSearchOpen] = useState<boolean>(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReports = useCallback(async () => {
    try {
      setError(null)
      const data = await api.reports.list()
      setReports(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load reports")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReports()
    const interval = setInterval(fetchReports, 5000)
    return () => clearInterval(interval)
  }, [fetchReports])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
  return (
    <div className="sticky top-0 z-30">
      <div className="flex h-14 flex-row items-center justify-end gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
        <Button
          variant="outline"
          className="absolute left-[50%] hidden w-64 translate-x-[-50%] transform items-center justify-start gap-2 px-3 text-muted-foreground md:flex"
          onClick={() => setSearchOpen(true)}
          aria-label="Open global search"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left text-sm">Search…</span>
          <kbd className="hidden h-5 items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[10px] sm:inline-flex">
            <span>⌘K</span>
          </kbd>
        </Button>{" "}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {mounted ? (
            theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )
          ) : (
            <span className="h-4 w-4"></span>
          )}
        </Button>
      </div>
      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        reports={reports}
      />
    </div>
  )
}
