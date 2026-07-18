"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { api, ReportListItem } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Plus,
  FileText,
  Trash2,
  ExternalLink,
  RefreshCw,
  FlaskConical,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react"

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    className:
      "bg-amber-500/15 text-amber-600 border border-amber-500/25 dark:text-amber-400",
    icon: Clock,
  },
  running: {
    label: "Running",
    className:
      "bg-blue-500/15 text-blue-600 border border-blue-500/25 dark:text-blue-400",
    icon: Loader2,
  },
  done: {
    label: "Complete",
    className:
      "bg-emerald-500/15 text-emerald-700 border border-emerald-500/25 dark:text-emerald-400",
    icon: CheckCircle,
  },
  failed: {
    label: "Failed",
    className:
      "bg-red-500/15 text-red-600 border border-red-500/25 dark:text-red-400",
    icon: XCircle,
  },
} as const

function StatusBadge({ status }: { status: ReportListItem["status"] }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.className}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`}
      />
      {cfg.label}
    </span>
  )
}

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!confirm("Delete this report? This cannot be undone.")) return
    setDeleting(id)
    try {
      await api.reports.delete(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch {
      alert("Failed to delete report.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated prior-art search reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={fetchReports}
            id="refresh-reports-btn"
            title="Refresh list"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button asChild id="new-report-btn">
            <Link href="/intake">
              <Plus className="mr-2 h-4 w-4" />
              New Report
            </Link>
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Connection error:</strong> {error}
          <span className="ml-2 opacity-70">
            — Is the backend running on port 8000?
          </span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <FlaskConical className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">No reports yet</h2>
          <p className="mb-6 max-w-xs text-sm text-muted-foreground">
            Create your first report by providing invention features and the
            prior-art patents to compare against.
          </p>
          <Button asChild id="first-report-btn">
            <Link href="/intake">
              <Plus className="mr-2 h-4 w-4" />
              Create first report
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/workspace?id=${report.id}`}
              id={`report-card-${report.id}`}
              className="block"
            >
              <div className="group flex cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 transition-all duration-150 hover:bg-accent/40">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {report.title}
                    </p>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {report.patent_count} patent
                    {report.patent_count !== 1 ? "s" : ""} ·{" "}
                    {report.feature_count} feature
                    {report.feature_count !== 1 ? "s" : ""} ·{" "}
                    {new Date(report.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    id={`delete-${report.id}`}
                    onClick={(e) => handleDelete(report.id, e)}
                    disabled={deleting === report.id}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    {deleting === report.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
