"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api, API_URL } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Plus,
  Trash2,
  Loader2,
  FlaskConical,
  ChevronRight,
  FileText,
  ListChecks,
} from "lucide-react"

interface PatentEntry {
  key: string
  publication_number: string
  title: string
  owner: string
  content: string
}

function newPatentEntry(): PatentEntry {
  return {
    key: Math.random().toString(36).slice(2),
    publication_number: "",
    title: "",
    owner: "",
    content: "",
  }
}

export default function IntakeForm() {
  const router = useRouter()
  const [reportTitle, setReportTitle] = useState("")
  const [inventionSummary, setInventionSummary] = useState("")
  const [features, setFeatures] = useState("")
  const [patents, setPatents] = useState<PatentEntry[]>([newPatentEntry()])
  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})
  const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({})
  const [fileOrText, setFileOrText] = useState(true)

  const addPatent = () => {
    if (patents.length >= 10) return
    setPatents((prev) => [...prev, newPatentEntry()])
  }

  const removePatent = (key: string) => {
    if (patents.length <= 1) return
    setPatents((prev) => prev.filter((p) => p.key !== key))
  }

  const updatePatent = (
    key: string,
    field: keyof Omit<PatentEntry, "key">,
    value: string
  ) => {
    setPatents((prev) =>
      prev.map((p) => (p.key === key ? { ...p, [field]: value } : p))
    )
  }

  const handleFileUpload = async (
    key: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clear previous errors for this patent slot
    setFileErrors((prev) => ({ ...prev, [key]: "" }))

    // ── Plain text ────────────────────────────────────────────────────────────
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        updatePatent(key, "content", ev.target?.result as string)
        console.log("content: ", ev.target?.result)
      }
      reader.onerror = () =>
        setFileErrors((prev) => ({
          ...prev,
          [key]: "Failed to read text file.",
        }))
      reader.readAsText(file)
      return
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setPdfLoading((prev) => ({ ...prev, [key]: true }))
      try {
        const formData = new FormData();
        formData.append("file", file);
        
        const res = await fetch(`${API_URL}/api/reports/extract-pdf`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Failed to extract PDF text from backend");
        }

        const data = await res.json();
        
        updatePatent(key, "content", data.text.trim())
        console.log("content: ", data.text.trim())
      } catch (err) {
        setFileErrors((prev) => ({
          ...prev,
          [key]: "Failed to parse PDF. Try copy-pasting the text instead.",
        }))
      } finally {
        setPdfLoading((prev) => ({ ...prev, [key]: false }))
      }
      return
    }

    // ── Unsupported ───────────────────────────────────────────────────────────
    setFileErrors((prev) => ({
      ...prev,
      [key]: "Only .pdf and .txt files are supported.",
    }))
  }

  const featureCount = features.split("\n").filter((l) => l.trim()).length

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const keyFeaturesList = features
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)

    if (!reportTitle.trim()) {
      setError("Please enter a report title.")
      return
    }
    if (keyFeaturesList.length === 0) {
      setError("Please enter at least one key feature.")
      return
    }
    const validPatents = patents.filter(
      (p) => p.publication_number.trim() && p.content.trim()
    )
    if (validPatents.length === 0) {
      setError(
        "Please add at least one patent with a publication number and full text content."
      )
      return
    }

    setSubmitting(true)
    try {
      const result = await api.reports.create({
        title: reportTitle.trim(),
        invention_summary: inventionSummary.trim() || undefined,
        key_features: keyFeaturesList,
        patents: validPatents.map((p) => ({
          publication_number: p.publication_number.trim(),
          title: p.title.trim(),
          content: p.content.trim(),
          owner: p.owner.trim(),
        })),
      })
      router.push(`/workspace?id=${result.id}`)
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to create report. Is the backend running on port 8000?"
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 pb-24">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <span
          className="cursor-pointer hover:text-foreground"
          onClick={() => router.push("/dashboard")}
        >
          Dashboard
        </span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">New Report</span>
      </div>

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">New Prior-Art Report</h1>
          <p className="text-sm text-muted-foreground">
            Provide invention features and patent documents for AI analysis
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Report Details */}
        <div className="space-y-5 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Report Details</h2>
          </div>
          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="report-title" className="text-sm font-medium">
              Report Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="report-title"
              placeholder="e.g. Dual-Layer Encryption System — Prior Art Analysis"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invention-summary" className="text-sm font-medium">
              Invention Summary{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="invention-summary"
              placeholder="Brief description of the invention being analyzed for novelty..."
              value={inventionSummary}
              onChange={(e) => setInventionSummary(e.target.value)}
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        {/* Section 2: Key Features */}
        <div className="space-y-5 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">
              Key Features of the Invention
            </h2>
          </div>
          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="key-features" className="text-sm font-medium">
              Features <span className="text-destructive">*</span>
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                — one per line
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Each line becomes a separate feature evaluated against every
              patent. Be specific and technical.
            </p>
            <Textarea
              id="key-features"
              placeholder={`A method for encrypting data using dual-layer AES-256 encryption\nA hardware security module (HSM) that generates and stores cryptographic keys\nAn authentication system combining biometric data with time-based OTP`}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
              className="min-h-[160px] resize-y font-mono text-sm"
              required
            />
            <p className="text-xs text-muted-foreground">
              {featureCount} feature{featureCount !== 1 ? "s" : ""} entered
            </p>
          </div>
        </div>

        {/* Section 3: Patents */}
        <div className="space-y-5 rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium">Prior Art Patents</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              id="add-patent-btn"
              onClick={addPatent}
              disabled={patents.length >= 10}
              className="h-8 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Patent
            </Button>
          </div>
          <Separator />

          <div className="space-y-5">
            {patents.map((patent, idx) => (
              <div
                key={patent.key}
                className="space-y-4 rounded-xl border bg-background/60 p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Patent {idx + 1}
                  </span>
                  {patents.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      id={`remove-patent-${idx}`}
                      onClick={() => removePatent(patent.key)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`pub-num-${idx}`}
                      className="text-xs font-medium"
                    >
                      Publication Number{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id={`pub-num-${idx}`}
                      placeholder="e.g. US10123456B2"
                      value={patent.publication_number}
                      onChange={(e) =>
                        updatePatent(
                          patent.key,
                          "publication_number",
                          e.target.value
                        )
                      }
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`owner-${idx}`}
                      className="text-xs font-medium"
                    >
                      Assignee / Owner{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      id={`owner-${idx}`}
                      placeholder="e.g. Acme Corporation"
                      value={patent.owner}
                      onChange={(e) =>
                        updatePatent(patent.key, "owner", e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`title-${idx}`}
                    className="text-xs font-medium"
                  >
                    Patent Title{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      (optional — AI will extract from text)
                    </span>
                  </Label>
                  <Input
                    id={`title-${idx}`}
                    placeholder="Patent title..."
                    value={patent.title}
                    onChange={(e) =>
                      updatePatent(patent.key, "title", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor={`content-${idx}`}
                    className="text-xs font-medium"
                  >
                    Full Patent Text <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Paste the complete patent text including claims, abstract,
                    and description.
                  </p>
                  {/*

                  <Textarea
                    id={`content-${idx}`}
                    placeholder="Paste the full patent text here (claims, description, abstract)..."
                    value={patent.content}
                    onChange={(e) =>
                      updatePatent(patent.key, 'content', e.target.value)
                    }
                    className="min-h-[200px] resize-y font-mono text-xs leading-relaxed"
                  />
                        */}
                  <Input
                    type="file"
                    id={`file-upload-${idx}`}
                    accept=".pdf,.txt,application/pdf,text/plain"
                    onChange={(e) => handleFileUpload(patent.key, e)}
                  />
                  {patent.content && (
                    <p className="text-xs text-muted-foreground">
                      {patent.content
                        .split(/\s+/)
                        .filter(Boolean)
                        .length.toLocaleString()}{" "}
                      words
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            id="start-analysis-btn"
            disabled={submitting}
            className="min-w-[160px]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Analysis…
              </>
            ) : (
              <>
                <FlaskConical className="mr-2 h-4 w-4" />
                Start Analysis
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
