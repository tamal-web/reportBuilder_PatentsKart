"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  RotateCcw,
  Trash2,
  FileImage,
  Loader2,
  AlertCircle,
  Sparkles,
  ArrowUpRight,
} from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

type LogoSettings = {
  status: "active" | "disabled"
  logo_url: string | null
  filename: string | null
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<LogoSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/logo`)
      if (!res.ok) throw new Error("Failed to load logo settings")
      const data: LogoSettings = await res.json()
      setSettings(data)
    } catch (err: any) {
      setError(err.message || "Failed to load logo configuration")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg)
    setError(null)
    setCacheBuster(Date.now())
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setActionLoading("upload")
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`${API_BASE}/api/settings/logo/upload`, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || "Failed to upload logo image")
      }

      await fetchSettings()
      notifySuccess(`Successfully uploaded and activated "${file.name}" as report logo!`)
    } catch (err: any) {
      setError(err.message || "Error during file upload")
    } finally {
      setActionLoading(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleReset = async () => {
    setActionLoading("reset")
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/settings/logo/reset`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to reset logo to default")
      await fetchSettings()
      notifySuccess("Reset to default PatentsKart logo.")
    } catch (err: any) {
      setError(err.message || "Could not reset logo")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDisable = async () => {
    setActionLoading("disable")
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/settings/logo/disable`, {
        method: "POST",
      })
      if (!res.ok) throw new Error("Failed to disable logo")
      await fetchSettings()
      notifySuccess("Logo disabled. Generated .docx reports will not include a logo.")
    } catch (err: any) {
      setError(err.message || "Could not disable logo")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure application behavior, Word (`.docx`) document styling, and brand identity.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-4 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="space-y-6">
        <Card className="border-border/60 bg-card shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileImage className="size-5 text-primary" />
                  Report Logo &amp; Branding
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Select the header image inserted at the top of generated `.docx` prior-art reports.
                </CardDescription>
              </div>
              {settings?.status === "active" ? (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  <CheckCircle2 className="mr-1.5 size-3.5" />
                  Active Logo
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Disabled
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {/* Active Logo Preview */}
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/70 bg-muted/30 p-8 text-center sm:flex-row sm:justify-start sm:gap-8 sm:p-6">
              <div className="flex size-36 shrink-0 items-center justify-center rounded-lg border bg-background p-4 shadow-inner">
                {loading ? (
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                ) : settings?.status === "active" && settings.logo_url ? (
                  <img
                    src={`${API_BASE}${settings.logo_url}?t=${cacheBuster}`}
                    alt="Current Report Logo"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <ImageIcon className="size-8 stroke-1" />
                    <span className="text-xs font-medium">No Logo</span>
                  </div>
                )}
              </div>

              <div className="mt-4 flex-1 text-left sm:mt-0">
                <h3 className="font-medium text-foreground">
                  {settings?.status === "active"
                    ? settings.filename
                    : "No header logo configured"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {settings?.status === "active"
                    ? "This logo will be inserted centered at roughly 3.0 inches wide on the first page of all generated .docx prior-art reports."
                    : "Word document reports will be generated with standard text headings and no image header."}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!actionLoading}
                    className="gap-2 shadow-sm"
                  >
                    {actionLoading === "upload" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    Upload Custom Logo
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReset}
                    disabled={!!actionLoading || settings?.filename === "patentskart.png"}
                    className="gap-2"
                  >
                    {actionLoading === "reset" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="size-4" />
                    )}
                    Reset to Default
                  </Button>

                  {settings?.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleDisable}
                      disabled={!!actionLoading}
                      className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {actionLoading === "disable" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      Remove Logo
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Supported formats info */}
            <div className="grid gap-4 text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3.5">
                <p className="font-semibold text-foreground">Supported Formats</p>
                <p className="mt-1">PNG, JPG/JPEG, and SVG files with transparent or white backgrounds work best.</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3.5">
                <p className="font-semibold text-foreground">Recommended Dimensions</p>
                <p className="mt-1">Between 600px and 1200px wide. High resolution prevents blurriness on export.</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3.5">
                <p className="font-semibold text-foreground">Automatic Sizing</p>
                <p className="mt-1">The `docx_generator.py` engine automatically scales width to exactly 3 inches.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
