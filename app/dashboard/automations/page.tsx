"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Film,
  Instagram,
  Loader2,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  Zap,
  Clock,
  UserCheck,
  CornerDownRight,
  Filter
} from "lucide-react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { AssistantSettings } from "@/components/dashboard/AssistantSettings"
import { CreateRuleForm } from "@/components/dashboard/CreateRuleForm"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { getAutomationMediaIds } from "@/lib/automation-media"
import type { Automation } from "@/lib/types"

type TabType = "all" | "comment" | "story" | "dm"
type StatusFilterType = "all" | "active" | "paused"

// Per-user client cache ensuring 100% tenant isolation across account switches
const rulesCacheByUserId = new Map<string, Automation[]>()

export default function AutomationsPage() {
  const { userId, username, profilePic, isIgConnected, isLoading: sessionLoading } = useInstagramSession()
  const [rules, setRules] = useState<Automation[]>(() => {
    if (!userId) return []
    if (rulesCacheByUserId.has(userId)) return rulesCacheByUserId.get(userId) || []
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_rules_" + userId)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            rulesCacheByUserId.set(userId, parsed)
            return parsed
          }
        }
      } catch {}
    }
    return []
  })
  const [loading, setLoading] = useState(() => {
    if (!userId) return false
    if (rulesCacheByUserId.has(userId)) return false
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_rules_" + userId)
        if (stored && JSON.parse(stored).length > 0) return false
      } catch {}
    }
    return true
  })
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<TabType>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("all")
  const [edit, setEdit] = useState<Automation | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [createSource, setCreateSource] = useState<"comment" | "dm" | "story">("comment")
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null)
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({})

  // Fetch automations from server
  const refresh = useCallback(async () => {
    if (!userId) {
      setRules([])
      setLoading(false)
      return
    }
    const cached = rulesCacheByUserId.get(userId)
    if (cached) {
      setRules(cached)
      setLoading(false)
    } else {
      setLoading(true)
    }
    try {
      const response = await fetch(`/api/automations?userId=${userId}`)
      const data = await response.json()
      if (!response.ok || !Array.isArray(data)) throw new Error()
      rulesCacheByUserId.set(userId, data)
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("flashinsta_rules_" + userId, JSON.stringify(data))
        } catch {}
      }
      setRules(data)
      setError("")
    } catch {
      setError("Could not load automations. Please refresh the page.")
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!sessionLoading) {
      void refresh()
    }
  }, [refresh, sessionLoading])

  // Background auto-reply sync every 30s
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(() => {
      fetch(`/api/instagram/sync-comments?userId=${userId}`, { method: "POST" }).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [userId])

  // Fetch post thumbnails if any rule targets specific media
  useEffect(() => {
    if (!userId || rules.length === 0) return
    const hasSpecificTargets = rules.some((rule) => getAutomationMediaIds(rule).length > 0)
    if (!hasSpecificTargets) return

    fetch(`/api/instagram/media?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data && Array.isArray(data.data) ? data.data : []
        if (list.length > 0) {
          const map: Record<string, string> = {}
          list.forEach((item: any) => {
            map[item.id] = item.thumbnail_url || item.image_url || item.media_url
          })
          setMediaMap(map)
        }
      })
      .catch(() => {})
  }, [userId, rules])

  // Manual Trigger for scanning comments
  const handleSyncComments = async () => {
    if (!userId || syncing) return
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch(`/api/instagram/sync-comments?userId=${userId}`, { method: "POST" })
      const data = await res.json()
      if (data.success) {
        setSyncMsg(data.message)
        toast.success(data.message || "Comments checked successfully")
        setTimeout(() => setSyncMsg(null), 6000)
      } else {
        toast.info(data.message || "Sync finished")
      }
    } catch {
      toast.error("Failed to check comments from Instagram")
    } finally {
      setSyncing(false)
    }
  }

  // Toggle active / paused
  const handleToggle = async (rule: Automation) => {
    if (busyRuleId) return
    const newActiveState = !rule.is_active
    setBusyRuleId(rule.id)

    // Optimistic update
    setRules((prev) =>
      prev.map((item) => (item.id === rule.id ? { ...item, is_active: newActiveState } : item))
    )

    try {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, is_active: newActiveState }),
      })
      if (!res.ok) throw new Error()
      toast.success(newActiveState ? `"${rule.name}" is now Active` : `"${rule.name}" paused`)
    } catch {
      // Revert on failure
      setRules((prev) =>
        prev.map((item) => (item.id === rule.id ? { ...item, is_active: !newActiveState } : item))
      )
      toast.error("Could not update status. Please try again.")
    } finally {
      setBusyRuleId(null)
    }
  }

  // Duplicate rule
  const handleDuplicate = async (rule: Automation) => {
    if (busyRuleId) return
    setBusyRuleId(rule.id)
    try {
      const res = await fetch("/api/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, action: "duplicate" }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Duplicated "${rule.name}". The copy is paused by default.`)
      void refresh()
    } catch {
      toast.error("Failed to duplicate rule")
    } finally {
      setBusyRuleId(null)
    }
  }

  // Delete rule
  const handleDelete = async (ruleId: string) => {
    if (busyRuleId) return
    setBusyRuleId(ruleId)
    try {
      const res = await fetch(`/api/automations?id=${ruleId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      setDeletingRuleId(null)
      toast.success("Automation deleted")
    } catch {
      toast.error("Could not delete automation")
    } finally {
      setBusyRuleId(null)
    }
  }

  // Launch creator wizard with designated source
  const handleStartCreate = (source?: "comment" | "story" | "dm") => {
    const targetSource =
      source ||
      (activeTab === "story" ? "story" : activeTab === "dm" ? "dm" : "comment")
    setCreateSource(targetSource)
    setEdit(null)
    setIsCreating(true)
  }

  // Counts
  const commentCount = useMemo(() => rules.filter((r) => r.trigger_source === "comment").length, [rules])
  const storyCount = useMemo(() => rules.filter((r) => r.trigger_source === "story").length, [rules])
  const dmCount = useMemo(() => rules.filter((r) => r.trigger_source === "dm").length, [rules])
  const activeCount = useMemo(() => rules.filter((r) => r.is_active).length, [rules])

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      // Tab filter
      if (activeTab !== "all" && rule.trigger_source !== activeTab) {
        return false
      }
      // Status filter
      if (statusFilter === "active" && !rule.is_active) return false
      if (statusFilter === "paused" && rule.is_active) return false

      // Search query
      if (query.trim()) {
        const q = query.toLowerCase().trim()
        const content: any = rule.response_content || {}
        const searchable = [
          rule.name,
          rule.trigger_value,
          content.message,
          content.card?.title,
          content.card?.subtitle,
          content.public_reply,
          ...(Array.isArray(content.public_replies) ? content.public_replies : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()

        return searchable.includes(q)
      }

      return true
    })
  }, [rules, activeTab, statusFilter, query])

  if (sessionLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Instagram className="mx-auto size-10 text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">Connect Instagram First</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Please link your Instagram Professional account to create and manage automations.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`mx-auto transition-all duration-200 ${isCreating || edit ? "max-w-7xl px-4 py-4 sm:px-6 lg:px-8" : "max-w-5xl px-4 py-6 sm:px-8 sm:py-10"}`}>
      {!isIgConnected && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-amber-400 font-bold text-sm">⚠️</span>
            <span>
              <strong>Instagram Account Disconnected:</strong> Live comment monitoring, DM triggers, and reel selection require a linked Instagram Professional account.
            </span>
          </div>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-1 font-semibold text-amber-300 hover:text-amber-100 underline shrink-0 cursor-pointer"
          >
            Connect Instagram in Settings →
          </Link>
        </div>
      )}

      {/* ========================================================
          CREATE / EDIT WIZARD VIEW
          ======================================================== */}
      {isCreating || edit ? (
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <button
              onClick={() => {
                setEdit(null)
                setIsCreating(false)
              }}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
            >
              <div className="rounded-lg border border-border bg-card p-1.5 group-hover:bg-accent transition-colors">
                <ArrowLeft className="size-4" />
              </div>
              <span>Back to Automations</span>
            </button>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {edit ? "Editing Workflow" : "New Automation"}
              </span>
            </div>
          </div>

          <CreateRuleForm
            key={edit ? edit.id : `new-${createSource}`}
            userId={userId}
            triggerSource={edit ? edit.trigger_source : createSource}
            editRule={edit}
            creatorUsername={username || "creator"}
            creatorProfilePic={profilePic || null}
            isIgConnected={isIgConnected}
            onSuccess={() => {
              setEdit(null)
              setIsCreating(false)
              void refresh()
            }}
          />
        </section>
      ) : (
        /* ========================================================
            MAIN AUTOMATIONS HUB
            ======================================================== */
        <div className="space-y-8">
          {/* Top Header */}
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Automations
                </h1>
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-medium"
                >
                  <span className="mr-1.5 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {activeCount} Active
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Set up automated keywords and instant AI-ready replies for Posts, Reels, Stories & DMs.
              </p>
            </div>

            {/* Top Right Global Actions */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleSyncComments}
                disabled={syncing}
                title="Scan comments on your Instagram posts and automatically send replies"
                className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary/70 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
              >
                <RefreshCw
                  className={`size-3.5 ${syncing ? "animate-spin text-emerald-400" : "text-emerald-400"}`}
                />
                <span className="hidden sm:inline">
                  {syncing ? "Checking Instagram..." : "Check & Auto-Reply Now"}
                </span>
                <span className="sm:hidden">{syncing ? "Checking..." : "Sync"}</span>
              </button>

              {/* Single High-Contrast Primary CTA with Dropdown */}
              <div className="inline-flex rounded-xl shadow-xs">
                <button
                  onClick={() => handleStartCreate()}
                  className="inline-flex items-center gap-2 rounded-l-xl bg-accent-yellow px-4 py-2 text-xs font-bold text-black hover:bg-accent-yellow/90 transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="size-4 stroke-[2.5]" />
                  <span>
                    New{" "}
                    {activeTab === "story"
                      ? "Story Reply"
                      : activeTab === "dm"
                      ? "DM Rule"
                      : activeTab === "comment"
                      ? "Post Rule"
                      : "Automation"}
                  </span>
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="inline-flex items-center justify-center rounded-r-xl bg-accent-yellow/90 px-2.5 py-2 text-black hover:bg-accent-yellow transition-all border-l border-black/15 cursor-pointer"
                      title="Select automation type"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border-border p-1.5">
                    <DropdownMenuItem
                      onClick={() => handleStartCreate("comment")}
                      className="cursor-pointer flex items-start gap-2.5 p-2 rounded-lg"
                    >
                      <Film className="size-4 text-purple-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Post / Reel Comments</p>
                        <p className="text-[11px] text-muted-foreground">Auto-reply in comments & send DM</p>
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleStartCreate("story")}
                      className="cursor-pointer flex items-start gap-2.5 p-2 rounded-lg"
                    >
                      <Sparkles className="size-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Story Replies & Mentions</p>
                        <p className="text-[11px] text-muted-foreground">Auto-respond to story viewers</p>
                      </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleStartCreate("dm")}
                      className="cursor-pointer flex items-start gap-2.5 p-2 rounded-lg"
                    >
                      <MessageCircle className="size-4 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Direct Messages</p>
                        <p className="text-[11px] text-muted-foreground">Answer keywords in incoming DMs</p>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          {/* Sync success toast indicator */}
          {syncMsg && (
            <div
              role="status"
              className="flex items-center justify-between gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400 animate-in fade-in"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{syncMsg}</span>
              </div>
              <button
                onClick={() => setSyncMsg(null)}
                className="text-emerald-400/70 hover:text-emerald-300"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* ========================================================
              UNIFIED FILTER & TAB NAVIGATION BAR
              ======================================================== */}
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-2 backdrop-blur-md md:flex-row md:items-center md:justify-between">
            {/* Category Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={() => setActiveTab("all")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === "all"
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <span>All Rules</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    activeTab === "all"
                      ? "bg-background/20 text-background font-bold"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {rules.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("comment")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === "comment"
                    ? "bg-purple-500 text-white font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <Film className="size-3.5" />
                <span>Posts & Reels</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    activeTab === "comment"
                      ? "bg-white/20 text-white font-bold"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {commentCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("story")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === "story"
                    ? "bg-amber-500 text-black font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <Sparkles className="size-3.5" />
                <span>Story Replies</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    activeTab === "story"
                      ? "bg-black/20 text-black font-bold"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {storyCount}
                </span>
              </button>

              <button
                onClick={() => setActiveTab("dm")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all cursor-pointer ${
                  activeTab === "dm"
                    ? "bg-sky-500 text-white font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
                }`}
              >
                <MessageCircle className="size-3.5" />
                <span>Direct Messages</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    activeTab === "dm"
                      ? "bg-white/20 text-white font-bold"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {dmCount}
                </span>
              </button>
            </div>

            {/* Search and Status Controls */}
            <div className="flex items-center gap-2 px-1">
              {/* Search box */}
              <div className="relative flex-1 md:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Find keyword or rule..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl border border-border/80 bg-background/80 py-1.5 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-accent-yellow/50 focus:outline-none focus:ring-1 focus:ring-accent-yellow/50"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Filter by status"
                  >
                    <Filter className="size-3" />
                    <span className="capitalize">{statusFilter === "all" ? "Status" : statusFilter}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36 bg-card border-border">
                  <DropdownMenuItem
                    onClick={() => setStatusFilter("all")}
                    className="cursor-pointer text-xs"
                  >
                    All Status
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setStatusFilter("active")}
                    className="cursor-pointer text-xs text-emerald-400"
                  >
                    Active Only
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setStatusFilter("paused")}
                    className="cursor-pointer text-xs text-muted-foreground"
                  >
                    Paused Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ========================================================
              AUTOMATION CARDS LIST
              ======================================================== */}
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive"
            >
              <span>{error}</span>
              <button onClick={() => void refresh()} className="font-semibold underline">
                Retry
              </button>
            </div>
          )}

          {loading && rules.length === 0 ? (
            <div className="grid grid-cols-1 gap-3.5">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-card/40 p-5 space-y-4 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-28 h-5 rounded-md bg-muted/60" />
                      <div className="w-20 h-5 rounded-md bg-muted/40" />
                    </div>
                    <div className="w-16 h-5 rounded-full bg-muted/40" />
                  </div>
                  <div className="w-48 h-5 rounded bg-muted/50" />
                  <div className="w-full h-12 rounded-xl bg-muted/30" />
                </div>
              ))}
            </div>
          ) : filteredRules.length > 0 ? (
            <div className="grid grid-cols-1 gap-3.5">
              {filteredRules.map((rule) => {
                const content: any = rule.response_content || {}
                const keywords = rule.trigger_value
                  ? rule.trigger_value.split(",").map((k) => k.trim()).filter(Boolean)
                  : []
                const isStory = rule.trigger_source === "story"
                const isComment = rule.trigger_source === "comment"
                const isDm = rule.trigger_source === "dm"
                const isDeleting = deletingRuleId === rule.id
                const isBusy = busyRuleId === rule.id
                const targetMediaIds = getAutomationMediaIds(rule)
                const thumbnail = targetMediaIds.map((id) => mediaMap[id]).find(Boolean) || null

                // Response text preview
                const responseText =
                  content.message ||
                  content.card?.title ||
                  (content.media ? `${content.media.type} response` : "Automated reply")

                const publicReplies: string[] = Array.isArray(content.public_replies) && content.public_replies.length > 0
                  ? content.public_replies
                  : content.public_reply
                    ? [content.public_reply]
                    : []
                const hasButtons =
                  (Array.isArray(content.card?.buttons) && content.card.buttons.length > 0) ||
                  (Array.isArray(content.buttons) && content.buttons.length > 0)

                return (
                  <div
                    key={rule.id}
                    className={`group relative rounded-2xl border transition-all duration-200 p-5 ${
                      !rule.is_active
                        ? "border-border/60 bg-card/40 opacity-75"
                        : "border-border/80 bg-card/90 hover:border-border hover:shadow-md"
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      {/* Top Bar: Badges + Active Switch + Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Source Badge */}
                          {isComment && (
                            <Badge
                              variant="outline"
                              className="border-purple-500/30 bg-purple-500/10 text-purple-400 gap-1.5 text-[11px] font-semibold py-0.5"
                            >
                              <Film className="size-3" />
                              Post & Reel Comment
                            </Badge>
                          )}
                          {isStory && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-amber-400 gap-1.5 text-[11px] font-semibold py-0.5"
                            >
                              <Sparkles className="size-3" />
                              Story Reply
                            </Badge>
                          )}
                          {isDm && (
                            <Badge
                              variant="outline"
                              className="border-sky-500/30 bg-sky-500/10 text-sky-400 gap-1.5 text-[11px] font-semibold py-0.5"
                            >
                              <MessageCircle className="size-3" />
                              Direct Message
                            </Badge>
                          )}

                          {/* Scope Badge */}
                          {targetMediaIds.length > 0 ? (
                            <Badge
                              variant="secondary"
                              className="bg-secondary/70 text-foreground border border-border text-[10px] font-medium gap-1"
                            >
                              <Instagram className="size-3 text-muted-foreground" />
                              {targetMediaIds.length > 1
                                ? `${targetMediaIds.length} ${isStory ? "Stories" : "Posts / Reels"}`
                                : isStory
                                  ? "Specific Story"
                                  : "Specific Post"}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="bg-secondary/50 text-muted-foreground text-[10px]"
                            >
                              {isComment ? "All Posts & Reels" : isStory ? "Any Story" : "All DMs"}
                            </Badge>
                          )}
                        </div>

                        {/* Top Right: Status Switch & Action Buttons */}
                        <div className="flex items-center gap-2">
                          {isDeleting ? (
                            <div className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1">
                              <span className="text-[11px] text-destructive font-medium">Delete?</span>
                              <button
                                disabled={isBusy}
                                onClick={() => handleDelete(rule.id)}
                                className="rounded px-2 py-0.5 text-[11px] font-bold bg-destructive text-destructive-foreground hover:opacity-90 cursor-pointer"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeletingRuleId(null)}
                                className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Edit Button */}
                              <button
                                onClick={() => setEdit(rule)}
                                title="Edit automation"
                                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                              >
                                <Pencil className="size-3.5" />
                              </button>

                              {/* Duplicate Button */}
                              <button
                                onClick={() => handleDuplicate(rule)}
                                title="Duplicate automation"
                                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                              >
                                <Copy className="size-3.5" />
                              </button>

                              {/* Delete Button */}
                              <button
                                onClick={() => setDeletingRuleId(rule.id)}
                                title="Delete automation"
                                className="inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                              >
                                <Trash2 className="size-3.5" />
                              </button>

                              {/* Active / Paused Pill & Switch */}
                              <div className="ml-1 flex items-center gap-2 border-l border-border/80 pl-2">
                                <span
                                  className={`text-[11px] font-medium ${
                                    rule.is_active ? "text-emerald-400" : "text-muted-foreground"
                                  }`}
                                >
                                  {rule.is_active ? "Active" : "Paused"}
                                </span>
                                <Switch
                                  checked={rule.is_active}
                                  onCheckedChange={() => handleToggle(rule)}
                                  disabled={isBusy}
                                  className="scale-85 cursor-pointer"
                                  aria-label={`Toggle ${rule.name}`}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Main Card Content */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                        {/* Optional thumbnail if post-specific */}
                        {thumbnail && (
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
                            <img
                              src={thumbnail}
                              alt=""
                              referrerPolicy="no-referrer"
                              crossOrigin="anonymous"
                              className="size-full object-cover"
                            />
                            {targetMediaIds.length > 1 && (
                              <span className="absolute inset-x-0 bottom-0 bg-black/75 text-center text-[9px] font-bold text-white">
                                +{targetMediaIds.length - 1}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0 space-y-2">
                          <h3 className="text-base font-semibold text-foreground tracking-tight truncate">
                            {rule.name}
                          </h3>

                          {/* Trigger Rule (When) */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground font-medium">When user says:</span>
                            {keywords.length > 0 ? (
                              keywords.map((kw, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-md border border-border/80 bg-secondary/80 px-2 py-0.5 font-mono text-[11px] text-foreground font-semibold"
                                >
                                  {kw}
                                </span>
                              ))
                            ) : (
                              <span className="rounded-md border border-border/60 bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground italic">
                                Any comment or reply
                              </span>
                            )}
                          </div>

                          {/* Response Preview (Then) */}
                          <div className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <CornerDownRight className="size-3.5 text-accent-yellow mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-foreground/90 font-medium leading-relaxed line-clamp-2">
                                  {responseText}
                                </p>
                              </div>
                            </div>

                            {/* Public Reply Preview (If configured) */}
                            {publicReplies.length > 0 && (
                              <div className="flex items-start gap-2 pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                                <MessageSquare className="size-3 text-purple-400 mt-0.5 shrink-0" />
                                <span className="line-clamp-1">
                                  Public comment reply: &ldquo;{publicReplies[0]}&rdquo;
                                  {publicReplies.length > 1 && ` (+${publicReplies.length - 1} variations)`}
                                </span>
                              </div>
                            )}

                            {/* Feature Chips */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {hasButtons && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded-md px-1.5 py-0.5">
                                  🔘 Interactive Buttons
                                </span>
                              )}
                              {content.check_follow && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 rounded-md px-1.5 py-0.5">
                                  <UserCheck className="size-3" />
                                  Must follow you
                                </span>
                              )}
                              {content.delay_seconds > 0 && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-secondary/50 rounded-md px-1.5 py-0.5">
                                  <Clock className="size-3" />
                                  {content.delay_seconds}s delay
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ========================================================
                TAILORED EMPTY STATES PER TAB & SEARCH
                ======================================================== */
            <div className="rounded-2xl border border-border/80 bg-card/60 p-12 text-center backdrop-blur-md">
              {query || statusFilter !== "all" ? (
                <div className="max-w-md mx-auto space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-muted">
                    <Search className="size-5 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">No matching automations</h3>
                  <p className="text-xs text-muted-foreground">
                    No automations found matching &ldquo;{query || statusFilter}&rdquo;. Try clearing filters.
                  </p>
                  <button
                    onClick={() => {
                      setQuery("")
                      setStatusFilter("all")
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : activeTab === "story" ? (
                <div className="max-w-md mx-auto space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
                    <Sparkles className="size-6 text-amber-400" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">No Story Automations Yet</h3>
                  <p className="text-xs text-muted-foreground">
                    Automatically send DMs with links, discounts, or downloads whenever anyone reacts or replies to your Instagram stories.
                  </p>
                  <button
                    onClick={() => handleStartCreate("story")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-accent-yellow px-4 py-2 text-xs font-bold text-black hover:bg-accent-yellow/90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="size-3.5 stroke-[2.5]" />
                    Create First Story Reply
                  </button>
                </div>
              ) : activeTab === "comment" ? (
                <div className="max-w-md mx-auto space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10">
                    <Film className="size-6 text-purple-400" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">No Post or Reel Rules Yet</h3>
                  <p className="text-xs text-muted-foreground">
                    Turn comments into customers. Auto-reply to post comments and instantly deliver links directly to their Instagram DM inbox.
                  </p>
                  <button
                    onClick={() => handleStartCreate("comment")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="size-3.5 stroke-[2.5]" />
                    Create Post & Reel Rule
                  </button>
                </div>
              ) : activeTab === "dm" ? (
                <div className="max-w-md mx-auto space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10">
                    <MessageCircle className="size-6 text-sky-400" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">No Direct Message Rules Yet</h3>
                  <p className="text-xs text-muted-foreground">
                    Set up keyword responders in your DMs to reply to inquiries 24/7 without having to type the same answers manually.
                  </p>
                  <button
                    onClick={() => handleStartCreate("dm")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-accent-yellow px-4 py-2 text-xs font-bold text-black hover:bg-accent-yellow/90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="size-3.5 stroke-[2.5]" />
                    Create Direct Message Rule
                  </button>
                </div>
              ) : (
                <div className="max-w-md mx-auto space-y-3">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-border bg-muted">
                    <Zap className="size-6 text-accent-yellow" />
                  </div>
                  <h3 className="text-base font-bold text-foreground">No Automations Created Yet</h3>
                  <p className="text-xs text-muted-foreground">
                    Automations trigger instant responses when people comment on your posts, reply to your stories, or message you.
                  </p>
                  <button
                    onClick={() => handleStartCreate("comment")}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-accent-yellow px-4 py-2 text-xs font-bold text-black hover:bg-accent-yellow/90 transition-all cursor-pointer shadow-sm"
                  >
                    <Plus className="size-3.5 stroke-[2.5]" />
                    Create Your First Automation
                  </button>
                </div>
              )}
            </div>
          )}

          {/* AI Assistant Settings (Clean Collapsible Section at Bottom) */}
          <div className="pt-4 border-t border-border/60">
            <AssistantSettings userId={userId} />
          </div>
        </div>
      )}
    </div>
  )
}
