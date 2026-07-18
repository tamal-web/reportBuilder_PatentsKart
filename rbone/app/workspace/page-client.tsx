"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { api, ReportDetail, ClaimChartRowOut } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import SummaryTable from "@/components/reports/SummaryTable"
import ClaimChartTable from "@/components/reports/ClaimChartTable"
import NoveltyMatrix from "@/components/reports/NoveltyMatrix"
import WorkspaceLoader from "@/components/reports/WorkspaceLoader"
import {
  ArrowLeft,
  Download,
  Loader2,
  XCircle,
  LayoutGrid,
  BarChart2,
  AlignLeft,
  FileText,
  TableIcon,
  CheckSquare,
} from "lucide-react"

type Tab = "summary" | "matrix" | "claims"

const TABS: {
  id: Tab
  label: string
  icon: React.FC<{ className?: string }>
}[] = [
    { id: "summary", label: "Summary Table", icon: LayoutGrid },
    { id: "matrix", label: "Novelty Matrix", icon: BarChart2 },
    { id: "claims", label: "Claim Charts", icon: AlignLeft },
  ]

export default function WorkspacePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const reportId = searchParams.get('id') as string

  const [report, setReport] = useState<ReportDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("summary")
  const [exporting, setExporting] = useState(false)

  const fetchReport = useCallback(async () => {
    try {
      const data = await api.reports.get(reportId)
      setReport(data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load report")
    } finally {
      setLoading(false)
    }
  }, [reportId])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Poll every 4s while pending or running
  useEffect(() => {
    if (!report) return
    if (report.status === "done" || report.status === "failed") return
    const interval = setInterval(fetchReport, 4000)
    return () => clearInterval(interval)
  }, [report, fetchReport])

  const handleClaimUpdate = useCallback(
    (rowId: number, justification: string, found: boolean) => {
      setReport((prev) => {
        if (!prev) return prev
        const updatedCharts = { ...prev.claim_charts }
        let targetPatentId = ""
        let targetFeatureIdx = -1
        for (const patentId in updatedCharts) {
          const foundItem = updatedCharts[patentId].find((r) => r.id === rowId)
          if (foundItem) {
            targetPatentId = patentId
            targetFeatureIdx = foundItem.feature_index
          }
          updatedCharts[patentId] = updatedCharts[patentId].map((r) =>
            r.id === rowId ? { ...r, justification, found } : r
          )
        }
        let updatedMatrix = prev.matrix
        if (targetPatentId && targetFeatureIdx !== -1) {
          updatedMatrix = prev.matrix.map((m) => {
            if (m.patent_id === targetPatentId) {
              return {
                ...m,
                feature_results: {
                  ...m.feature_results,
                  [String(targetFeatureIdx)]: found,
                },
              }
            }
            return m
          })
        }
        return { ...prev, claim_charts: updatedCharts, matrix: updatedMatrix }
      })
    },
    []
  )

  const handleSummaryUpdate = useCallback(
    (
      rowId: number,
      patch: { title?: string; owner?: string; relevance_note?: string }
    ) => {
      setReport((prev) => {
        if (!prev) return prev
        const updatedSummary = prev.summary_table.map((r) =>
          r.id === rowId ? { ...r, ...patch } : r
        )
        return { ...prev, summary_table: updatedSummary }
      })
    },
    []
  )

  const handleMatrixUpdate = useCallback(
    (rowId: number, featureIndex: number, found: boolean) => {
      setReport((prev) => {
        if (!prev) return prev
        const updatedMatrix = prev.matrix.map((m) => {
          if (m.id === rowId) {
            return {
              ...m,
              feature_results: {
                ...m.feature_results,
                [String(featureIndex)]: found,
              },
            }
          }
          return m
        })
        const targetMatrix = prev.matrix.find((m) => m.id === rowId)
        const targetPatentId = targetMatrix?.patent_id
        const updatedCharts = { ...prev.claim_charts }
        if (targetPatentId && updatedCharts[targetPatentId]) {
          updatedCharts[targetPatentId] = updatedCharts[targetPatentId].map(
            (r) => (r.feature_index === featureIndex ? { ...r, found } : r)
          )
        }
        return { ...prev, matrix: updatedMatrix, claim_charts: updatedCharts }
      })
    },
    []
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const url = api.reports.exportUrl(reportId)
      const link = document.createElement("a")
      link.href = url
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.click()
    } finally {
      setTimeout(() => setExporting(false), 1500)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3 pt-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-center p-6 py-24 text-center">
        <XCircle className="mb-4 h-12 w-12 text-destructive/50" />
        <h2 className="mb-2 text-lg font-semibold">Could not load report</h2>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">{error}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Back to Dashboard
          </Button>
          <Button onClick={fetchReport}>Retry</Button>
        </div>
      </div>
    )
  }

  if (!report) return null

  const isDone = report.status === "done"
  const isFailed = report.status === "failed"

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2 -ml-2 h-7 gap-1.5 text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/dashboard">
              <ArrowLeft className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </Button>
          <h1 className="truncate text-xl font-semibold">{report.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {report.patents.length} patent
            {report.patents.length !== 1 ? "s" : ""} ·{" "}
            {report.key_features.length} feature
            {report.key_features.length !== 1 ? "s" : ""} ·{" "}
            {new Date(report.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        {isDone && (
          <Button
            id="export-docx-btn"
            onClick={handleExport}
            disabled={exporting}
            className="flex-shrink-0 gap-2"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export .docx
          </Button>
        )}
      </div>

      {/* Failed state */}
      {isFailed && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-medium">Pipeline execution failed</p>
          <p className="mt-1 text-xs opacity-90">
            {report.error_message ||
              "An unknown error occurred during AI processing. You can still manually fill in the tables below."}
          </p>
        </div>
      )}

      {/* Running state banner */}
      {!isDone && !isFailed && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-muted-foreground">
            Generating AI analysis... This may take up to a minute.
          </span>
        </div>
      )}

      {/* Navigation tabs */}
      {report && (
        <>
          <div className="mb-6 flex border-b">
            {[
              { id: "summary", label: "Summary Table", icon: FileText },
              { id: "matrix", label: "Novelty Matrix", icon: TableIcon },
              { id: "claims", label: "Claim Charts", icon: CheckSquare },
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex items-center gap-2 border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="pb-12">
            {activeTab === "summary" && (
              <SummaryTable
                reportId={reportId}
                rows={report.summary_table}
                patents={report.patents}
                onUpdate={handleSummaryUpdate}
              />
            )}
            {activeTab === "matrix" && (
              <NoveltyMatrix
                reportId={reportId}
                keyFeatures={report.key_features}
                matrix={report.matrix}
                patents={report.patents}
                onUpdate={handleMatrixUpdate}
              />
            )}
            {activeTab === "claims" && (
              <ClaimChartTable
                reportId={reportId}
                patents={report.patents}
                keyFeatures={report.key_features}
                claimCharts={report.claim_charts}
                onUpdate={handleClaimUpdate}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
