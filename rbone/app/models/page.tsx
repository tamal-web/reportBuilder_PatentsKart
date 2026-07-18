"use client"

/**
 * app/models/page.tsx
 *
 * Requires shadcn components: card, button, progress, badge, input
 *   npx shadcn@latest add card button progress badge input
 *
 * Set NEXT_PUBLIC_API_URL in .env.local if your FastAPI backend isn't on
 * http://localhost:8000
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Download, X, CheckCircle2, RotateCcw, PlusCircle, Sparkles, Cloud, Search, Key } from "lucide-react"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const WS_BASE = API_BASE.replace(/^http/, "ws")

type ModelInfo = {
  id: string
  name: string
  description: string
  installed: boolean
  active?: boolean
}

type CloudModelInfo = {
  id: string
  name: string
  description: string
  recommended?: boolean
}

type ActiveModelInfo = {
  active_model: string
  provider: string
  base_url?: string
  has_api_key?: boolean
}

type InstallStatus = "idle" | "installing" | "installed" | "error"

type InstallState = {
  status: InstallStatus
  percent: number | null
  statusText: string
  errorMessage?: string
}

const DEFAULT_STATE: InstallState = {
  status: "idle",
  percent: null,
  statusText: "",
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [installStates, setInstallStates] = useState<
    Record<string, InstallState>
  >({})
  const [customModelId, setCustomModelId] = useState("")
  const [selectingId, setSelectingId] = useState<string | null>(null)
  const socketsRef = useRef<Record<string, WebSocket>>({})

  // Cloud Providers state
  const [activeInfo, setActiveInfo] = useState<ActiveModelInfo | null>(null)
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<"Claude" | "Gemini" | "Grok">("Claude")
  const [apiKey, setApiKey] = useState("")
  const [cloudModels, setCloudModels] = useState<CloudModelInfo[]>([])
  const [searchingCloud, setSearchingCloud] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [activatingCloudId, setActivatingCloudId] = useState<string | null>(null)

  // Custom API state
  const [customApiUrl, setCustomApiUrl] = useState("")
  const [customApiKey, setCustomApiKey] = useState("")
  const [customApiModelId, setCustomApiModelId] = useState("")
  const [customApiError, setCustomApiError] = useState<string | null>(null)
  const [activatingCustom, setActivatingCustom] = useState(false)

  const updateState = (modelId: string, patch: Partial<InstallState>) => {
    setInstallStates((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? DEFAULT_STATE), ...patch },
    }))
  }

  const fetchModels = useCallback(async () => {
    try {
      const [modelsRes, activeRes] = await Promise.all([
        fetch(`${API_BASE}/api/models`),
        fetch(`${API_BASE}/api/models/active`),
      ])
      const data: ModelInfo[] = await modelsRes.json()
      const activeData: ActiveModelInfo = await activeRes.json().catch(() => ({
        active_model: "",
        provider: "ollama",
      }))
      setActiveInfo(activeData)

      setModels(data)
      setInstallStates((prev) => {
        const next = { ...prev }
        data.forEach((m) => {
          if (m.installed) {
            next[m.id] = {
              status: "installed",
              percent: 100,
              statusText: "Installed",
            }
          } else if (!next[m.id]) {
            next[m.id] = DEFAULT_STATE
          }
        })
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Close any open sockets when the page unmounts
  useEffect(() => {
    return () => {
      Object.values(socketsRef.current).forEach((ws) => ws.close())
    }
  }, [])

  const selectModel = async (modelId: string) => {
    setSelectingId(modelId)
    try {
      const res = await fetch(`${API_BASE}/api/models/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_id: modelId, provider: "ollama" }),
      })
      if (res.ok) {
        await fetchModels()
      }
    } catch (err) {
      console.error("Failed to select active model:", err)
    } finally {
      setSelectingId(null)
    }
  }

  const searchCloudModels = async () => {
    if (!apiKey.trim()) {
      setCloudError("Please enter your API key before searching models.")
      return
    }
    setSearchingCloud(true)
    setCloudError(null)
    try {
      const res = await fetch(`${API_BASE}/api/models/cloud/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedCloudProvider,
          api_key: apiKey.trim(),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setCloudModels(data.models || [])
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to search models." }))
        setCloudError(err.detail || "Failed to fetch models from provider.")
        setCloudModels([])
      }
    } catch (err) {
      console.error("Error searching cloud models:", err)
      setCloudError("Network error occurred while connecting to provider API.")
      setCloudModels([])
    } finally {
      setSearchingCloud(false)
    }
  }

  const activateCloudModel = async (modelId: string) => {
    if (!apiKey.trim()) {
      setCloudError("API key is required to activate and select this provider.")
      return
    }
    setActivatingCloudId(modelId)
    setCloudError(null)
    try {
      let baseUrl = ""
      if (selectedCloudProvider === "Claude") baseUrl = "https://api.anthropic.com/v1"
      else if (selectedCloudProvider === "Gemini") baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/"
      else if (selectedCloudProvider === "Grok") baseUrl = "https://api.x.ai/v1"

      const res = await fetch(`${API_BASE}/api/models/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: modelId,
          provider: selectedCloudProvider.toLowerCase(),
          api_key: apiKey.trim(),
          base_url: baseUrl,
        }),
      })
      if (res.ok) {
        await fetchModels()
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to activate cloud model." }))
        setCloudError(err.detail || "Failed to activate cloud model.")
      }
    } catch (err) {
      console.error("Failed to activate cloud model:", err)
      setCloudError("Network error while setting active model.")
    } finally {
      setActivatingCloudId(null)
    }
  }

  const activateCustomApi = async () => {
    if (!customApiModelId.trim() || !customApiUrl.trim()) {
      setCustomApiError("Base URL and Model ID are required.")
      return
    }
    setActivatingCustom(true)
    setCustomApiError(null)
    try {
      const res = await fetch(`${API_BASE}/api/models/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model_id: customApiModelId.trim(),
          provider: "custom",
          api_key: customApiKey.trim() || "lm-studio",
          base_url: customApiUrl.trim(),
        }),
      })
      if (res.ok) {
        await fetchModels()
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to activate custom API." }))
        setCustomApiError(err.detail || "Failed to activate custom API.")
      }
    } catch (err) {
      console.error("Failed to activate custom API:", err)
      setCustomApiError("Network error while setting custom active model.")
    } finally {
      setActivatingCustom(false)
    }
  }

  const startInstall = (modelId: string) => {
    if (socketsRef.current[modelId]) return // already installing

    const ws = new WebSocket(`${WS_BASE}/ws/models/pull`)
    socketsRef.current[modelId] = ws

    updateState(modelId, {
      status: "installing",
      percent: 0,
      statusText: "Connecting...",
    })

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: "start", model: modelId }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case "progress":
          updateState(modelId, {
            status: "installing",
            percent: data.percent ?? null,
            statusText: data.status ?? "Downloading...",
          })
          break
        case "done":
          updateState(modelId, {
            status: "installed",
            percent: 100,
            statusText: "Installed",
          })
          ws.close()
          setModels((prev) =>
            prev.map((m) =>
              m.id === modelId ? { ...m, installed: true } : m
            )
          )
          break
        case "cancelled":
          updateState(modelId, {
            status: "idle",
            percent: null,
            statusText: "",
          })
          ws.close()
          break
        case "error":
          updateState(modelId, {
            status: "error",
            percent: null,
            statusText: "Failed",
            errorMessage: data.message ?? "Unknown error",
          })
          ws.close()
          break
      }
    }

    ws.onerror = () => {
      updateState(modelId, {
        status: "error",
        percent: null,
        statusText: "Error",
        errorMessage: "WebSocket connection error",
      })
    }

    ws.onclose = () => {
      delete socketsRef.current[modelId]
    }
  }

  const cancelInstall = (modelId: string) => {
    const ws = socketsRef.current[modelId]
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ action: "cancel" }))
    }
  }

  const installCustomModel = () => {
    const trimmed = customModelId.trim()
    if (!trimmed) return

    setModels((prev) =>
      prev.some((m) => m.id === trimmed)
        ? prev
        : [
          ...prev,
          {
            id: trimmed,
            name: trimmed,
            description: "Custom model",
            installed: false,
          },
        ]
    )
    setCustomModelId("")
    startInstall(trimmed)
  }

  const activeLocalModel = models.find((m) => m.active)
  const activeModelName =
    activeInfo && activeInfo.provider !== "ollama"
      ? `${activeInfo.active_model}`
      : activeLocalModel?.name || activeInfo?.active_model || "local-model"

  const activeProviderName =
    activeInfo && activeInfo.provider === "custom"
      ? "Custom API Endpoint"
      : activeInfo && activeInfo.provider !== "ollama"
      ? `Cloud — ${activeInfo.provider.toUpperCase()}`
      : "Local — Ollama / LM Studio"

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Install local models or connect directly to cloud providers (Claude, Gemini, Grok) for AI inference.
        </p>
      </div>

      {(activeInfo || activeLocalModel) && (
        <div className="mb-8 flex items-center justify-between rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Currently Active Model</p>
              <p className="text-xs text-muted-foreground">
                All report generation requests will use <span className="font-semibold text-foreground">{activeModelName}</span> ({activeProviderName})
              </p>
            </div>
          </div>
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
            Active
          </Badge>
        </div>
      )}

      {/* Cloud-Hosted Providers Card */}
      <Card className="mb-8 border-primary/20 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                Cloud-Hosted Providers
              </CardTitle>
              <CardDescription>
                Use Claude, Gemini, or Grok directly by entering your API key.
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs uppercase font-mono">
              Provider-Agnostic
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Provider
              </label>
              <select
                value={selectedCloudProvider}
                onChange={(e) => {
                  setSelectedCloudProvider(e.target.value as "Claude" | "Gemini" | "Grok")
                  setCloudModels([])
                  setCloudError(null)
                }}
                className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="Claude">Claude (Anthropic)</option>
                <option value="Gemini">Gemini (Google AI)</option>
                <option value="Grok">Grok (xAI)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                API Key
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder={`Enter ${selectedCloudProvider} API key...`}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setCloudError(null)
                    }}
                    onKeyDown={(e) => e.key === "Enter" && searchCloudModels()}
                    className="pl-8"
                  />
                </div>
                <Button
                  onClick={searchCloudModels}
                  disabled={searchingCloud || !apiKey.trim()}
                  variant="secondary"
                  className="shrink-0"
                >
                  <Search className="mr-2 h-4 w-4" />
                  {searchingCloud ? "Searching..." : "Search Available Models"}
                </Button>
              </div>
            </div>
          </div>

          {cloudError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center justify-between">
              <span>{cloudError}</span>
              <Button variant="ghost" size="sm" onClick={() => setCloudError(null)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {cloudModels.length > 0 && (
            <div className="mt-3">
              <label className="text-xs font-medium text-muted-foreground block mb-2">
                Available {selectedCloudProvider} Models ({cloudModels.length})
              </label>
              <div className="max-h-60 overflow-y-auto rounded-md border bg-muted/20 p-2 space-y-2">
                {cloudModels.map((model) => {
                  const isThisActive =
                    activeInfo?.provider?.toLowerCase() === selectedCloudProvider.toLowerCase() &&
                    activeInfo?.active_model === model.id

                  return (
                    <div
                      key={model.id}
                      className={`flex items-center justify-between rounded-md border bg-card p-3 text-sm transition-colors ${
                        isThisActive
                          ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-sm"
                          : "hover:border-primary/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground truncate">{model.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">({model.id})</span>
                          {model.recommended && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0">
                              Recommended
                            </Badge>
                          )}
                          {isThisActive && (
                            <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {model.description}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={isThisActive ? "outline" : "default"}
                        disabled={isThisActive || activatingCloudId === model.id || !apiKey.trim()}
                        onClick={() => activateCloudModel(model.id)}
                        className="shrink-0"
                      >
                        {activatingCloudId === model.id
                          ? "Activating..."
                          : isThisActive
                          ? "Active"
                          : "Use Model"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom API Endpoint Card */}
      <Card className="mb-8 border-primary/20 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Cloud className="h-5 w-5 text-primary" />
                Custom API Endpoint (OpenAI Compatible)
              </CardTitle>
              <CardDescription>
                Connect to any OpenAI-compatible server (e.g. LM Studio, vLLM, custom cloud).
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Base URL
              </label>
              <Input
                placeholder="http://127.0.0.1:1234/v1"
                value={customApiUrl}
                onChange={(e) => {
                  setCustomApiUrl(e.target.value)
                  setCustomApiError(null)
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                API Key (Optional)
              </label>
              <div className="relative">
                <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Enter API key..."
                  value={customApiKey}
                  onChange={(e) => {
                    setCustomApiKey(e.target.value)
                    setCustomApiError(null)
                  }}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Model ID
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. local-model or gpt-4"
                  value={customApiModelId}
                  onChange={(e) => {
                    setCustomApiModelId(e.target.value)
                    setCustomApiError(null)
                  }}
                  onKeyDown={(e) => e.key === "Enter" && activateCustomApi()}
                  className="flex-1"
                />
                <Button
                  onClick={activateCustomApi}
                  disabled={activatingCustom || !customApiUrl.trim() || !customApiModelId.trim()}
                  className="shrink-0"
                >
                  {activatingCustom ? "Connecting..." : "Use Custom Model"}
                </Button>
              </div>
            </div>
          </div>

          {customApiError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center justify-between">
              <span>{customApiError}</span>
              <Button variant="ghost" size="sm" onClick={() => setCustomApiError(null)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Local Models (Ollama / LM Studio)</h2>
        <p className="text-xs text-muted-foreground">
          Or use your locally installed open-source models running on your machine.
        </p>
      </div>

      <div className="mb-6 flex gap-2">
        <Input
          placeholder="Enter a model id to pull, e.g. phi3:mini or qwen2.5:7b"
          value={customModelId}
          onChange={(e) => setCustomModelId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && installCustomModel()}
        />
        <Button onClick={installCustomModel} variant="secondary">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add &amp; pull
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading models...</p>
      ) : (
        <div className="space-y-4">
          {models.map((model) => {
            const state = installStates[model.id] ?? DEFAULT_STATE
            return (
              <Card key={model.id} className={model.active ? "border-emerald-500/50 bg-emerald-500/[0.02]" : ""}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {model.name}
                      {model.active && (
                        <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                      {!model.active && state.status === "installed" && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Installed
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {model.description}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {state.status === "installed" && !model.active && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => selectModel(model.id)}
                        disabled={selectingId === model.id}
                        className="border-emerald-600/30 text-emerald-600 hover:bg-emerald-600/10 dark:text-emerald-400"
                      >
                        {selectingId === model.id ? "Selecting..." : "Use Model"}
                      </Button>
                    )}

                    {state.status === "idle" && (
                      <Button size="sm" onClick={() => startInstall(model.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        Install
                      </Button>
                    )}

                    {state.status === "installing" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => cancelInstall(model.id)}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Stop
                      </Button>
                    )}

                    {state.status === "error" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startInstall(model.id)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Retry
                      </Button>
                    )}
                  </div>
                </CardHeader>

                {state.status === "installing" && (
                  <CardContent>
                    <Progress value={state.percent ?? 0} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {state.statusText}
                      {state.percent !== null && ` — ${state.percent}%`}
                    </p>
                  </CardContent>
                )}

                {state.status === "error" && (
                  <CardContent>
                    <p className="text-xs text-destructive">
                      {state.errorMessage}
                    </p>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
