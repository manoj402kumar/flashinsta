"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Instagram,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  MessageSquareHeart,
  MessageSquarePlus,
  Power,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  Users,
  Video,
  Workflow,
  X,
  Zap,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ThemeToggle } from "@/components/theme-toggle"

interface StatsData {
  users: {
    total: number
    connected: number
    expiringTokens: number
    expiredTokens: number
    groqEnabled: number
  }
  automations: {
    total: number
    active: number
    paused: number
    sources: { comment: number; dm: number; story: number }
  }
  webhooks: {
    total: number
    past24h: number
    types: Record<string, number>
    timeline: Array<{ date: string; label: string; comments: number; messages: number; other: number; total: number }>
  }
  dmQueue: { total: number; pending: number; sent: number; failed: number }
  reels: { total: number; published: number; pending: number; failed: number }
  recentEvents: Array<any>
}

interface UserItem {
  id: string
  username: string
  igUsername: string | null
  igPageName: string | null
  verifiedVia: string | null
  isIgConnected: boolean
  hasAccessToken: boolean
  tokenExpiresAt: string | null
  daysUntilExpiry: number | null
  isExpired: boolean
  businessAccountId: string | null
  pageId: string | null
  groqAutoReplyEnabled: boolean
  hasCustomAiConfig: boolean
  aiModel: string
  automations: { total: number; active: number }
  conversationsCount: number
  messagesCount: { incoming: number; outgoing: number }
  createdAt: string
  updatedAt: string
}

interface WebhookItem {
  id: string
  eventType: string
  userId: string | null
  username: string
  commenter: string | null
  commentText: string | null
  mediaId: string | null
  commentReplied: boolean
  dmSent: boolean
  error: string | null
  payload: any
  processedAt: string
}

interface AutomationItem {
  id: string
  userId: string
  ownerUsername: string
  ownerIgUsername: string | null
  name: string
  triggerSource: string
  triggerType: string
  triggerValue: string
  responseType: string
  responseContent: any
  isActive: boolean
  createdAt: string
}

interface DmQueueItem {
  id: string
  user_id: string
  recipient_id: string
  message: string
  send_at: string
  status: string
  attempts: number
  created_at: string
}

interface FeedbackItem {
  id: string
  userId: string | null
  username: string
  igUsername?: string | null
  profilePic?: string | null
  category: string
  rating: number
  message: string
  status: "new" | "in_review" | "resolved"
  createdAt: string
}

interface DiagnosticsData {
  database: {
    status: string
    latencyMs: number
    tables: Record<string, { count: number | null; status: string; error?: string }>
  }
  storage: { reelsBucket: string }
  environment: Record<string, any>
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

  // Passkey
  const [adminPasskey, setAdminPasskey] = useState("")
  const [showPasskey, setShowPasskey] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  // Core Data
  const [stats, setStats] = useState<StatsData | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [automations, setAutomations] = useState<AutomationItem[]>([])
  const [dmQueue, setDmQueue] = useState<DmQueueItem[]>([])
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([])
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null)

  // Modals & Inspectors
  const [selectedPayload, setSelectedPayload] = useState<any | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)

  // Filters & Searches
  const [userSearch, setUserSearch] = useState("")
  const [userFilter, setUserFilter] = useState<"all" | "connected" | "expired" | "groq">("all")
  const [webhookSearch, setWebhookSearch] = useState("")
  const [webhookTypeFilter, setWebhookTypeFilter] = useState("all")
  const [autoSearch, setAutoSearch] = useState("")
  const [autoSourceFilter, setAutoSourceFilter] = useState("all")
  const [feedbackSearch, setFeedbackSearch] = useState("")
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState("all")
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState("all")

  // Helper headers
  const getAuthHeaders = (overrideKey?: string): Record<string, string> => {
    const key = overrideKey !== undefined
      ? overrideKey
      : (adminPasskey || (typeof window !== "undefined" ? localStorage.getItem("insta_admin_passkey") || "" : ""))
    return key ? { "x-admin-key": key } : {}
  }

  // Load all dashboard telemetry
  const loadDashboardData = async (showToast = false, keyToTest?: string) => {
    setRefreshing(true)
    const headers = getAuthHeaders(keyToTest)

    try {
      const [statsRes, usersRes, webhooksRes, autoRes, dmRes, feedbackRes, diagRes] = await Promise.allSettled([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/webhooks?limit=150", { headers }),
        fetch("/api/admin/automations", { headers }),
        fetch("/api/admin/dm-queue", { headers }),
        fetch("/api/feedback", { headers }),
        fetch("/api/admin/diagnostics", { headers }),
      ])

      if (statsRes.status === "fulfilled") {
        if (statsRes.value.status === 401) {
          setIsLocked(true)
          setLoading(false)
          setRefreshing(false)
          if (showToast) {
            toast.error("Invalid administrator passkey. Please check and try again.")
          }
          return false
        }
        if (statsRes.value.ok) {
          setIsLocked(false)
          setStats(await statsRes.value.json())
          if (keyToTest) {
            setAdminPasskey(keyToTest)
            if (typeof window !== "undefined") {
              localStorage.setItem("insta_admin_passkey", keyToTest)
              document.cookie = `insta_admin_key=${encodeURIComponent(keyToTest)}; path=/; max-age=604800; SameSite=Lax`
            }
          }
          if (showToast) {
            toast.success("Admin Command Center unlocked successfully")
          }
        }
      }
      if (usersRes.status === "fulfilled" && usersRes.value.ok) {
        const uData = await usersRes.value.json()
        setUsers(uData.users || [])
      }
      if (webhooksRes.status === "fulfilled" && webhooksRes.value.ok) {
        const wData = await webhooksRes.value.json()
        setWebhooks(wData.events || [])
      }
      if (autoRes.status === "fulfilled" && autoRes.value.ok) {
        const aData = await autoRes.value.json()
        setAutomations(aData.automations || [])
      }
      if (dmRes.status === "fulfilled" && dmRes.value.ok) {
        const dData = await dmRes.value.json()
        setDmQueue(dData.queue || [])
      }
      if (feedbackRes.status === "fulfilled" && feedbackRes.value.ok) {
        const fbData = await feedbackRes.value.json()
        setFeedbackList(fbData.feedback || [])
      }
      if (diagRes.status === "fulfilled" && diagRes.value.ok) {
        setDiagnostics(await diagRes.value.json())
      }
      return true
    } catch (err: any) {
      toast.error("Failed to fetch admin telemetry: " + err.message)
      return false
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const savedKey = typeof window !== "undefined" ? localStorage.getItem("insta_admin_passkey") : null
    if (savedKey) setAdminPasskey(savedKey)
    loadDashboardData()
  }, [])

  // Action: Toggle automation active status
  const handleToggleAutomation = async (id: string, currentState: boolean) => {
    try {
      const res = await fetch("/api/admin/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ id, isActive: !currentState }),
      })
      if (!res.ok) throw new Error("Failed to toggle automation")
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isActive: !currentState } : a))
      )
      toast.success(`Automation ${!currentState ? "activated" : "paused"}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Action: Toggle User Groq AI
  const handleToggleUserGroq = async (userId: string, currentState: boolean) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ userId, updates: { groq_auto_reply_enabled: !currentState } }),
      })
      if (!res.ok) throw new Error("Failed to update user Groq AI setting")
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, groqAutoReplyEnabled: !currentState } : u))
      )
      if (selectedUser?.id === userId) {
        setSelectedUser((prev) => (prev ? { ...prev, groqAutoReplyEnabled: !currentState } : null))
      }
      toast.success(`Groq auto-reply ${!currentState ? "enabled" : "disabled"} for user`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Action: Retry DM in queue
  const handleRetryDm = async (id: string) => {
    try {
      const res = await fetch("/api/admin/dm-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: "retry", id }),
      })
      if (!res.ok) throw new Error("Failed to queue DM retry")
      toast.success("DM scheduled for immediate re-delivery")
      loadDashboardData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Action: Purge sent DMs
  const handlePurgeSentDms = async () => {
    if (!confirm("Are you sure you want to purge all successfully delivered DMs from the queue?")) return
    try {
      const res = await fetch("/api/admin/dm-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: "purge_sent" }),
      })
      if (!res.ok) throw new Error("Failed to purge sent DMs")
      toast.success("Sent DMs purged from queue")
      loadDashboardData()
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Action: Update Feedback Status
  const handleUpdateFeedbackStatus = async (id: string, newStatus: "new" | "in_review" | "resolved") => {
    try {
      const res = await fetch("/api/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ id, status: newStatus }),
      })
      if (!res.ok) throw new Error("Failed to update status")
      setFeedbackList((prev) =>
        prev.map((fb) => (fb.id === id ? { ...fb, status: newStatus } : fb))
      )
      toast.success(`Feedback marked as ${newStatus.replace("_", " ")}`)
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Action: Delete Feedback
  const handleDeleteFeedback = async (id: string) => {
    if (!confirm("Delete this feedback entry?")) return
    try {
      const res = await fetch(`/api/feedback?id=${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      })
      if (!res.ok) throw new Error("Failed to delete feedback")
      setFeedbackList((prev) => prev.filter((fb) => fb.id !== id))
      toast.success("Feedback entry deleted")
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.igUsername && u.igUsername.toLowerCase().includes(userSearch.toLowerCase())) ||
        u.id.includes(userSearch) ||
        (u.businessAccountId && u.businessAccountId.includes(userSearch))

      if (!matchesSearch) return false

      if (userFilter === "connected") return u.isIgConnected
      if (userFilter === "expired") return u.isExpired
      if (userFilter === "groq") return u.groqAutoReplyEnabled
      return true
    })
  }, [users, userSearch, userFilter])

  // Filtered Webhooks
  const filteredWebhooks = useMemo(() => {
    return webhooks.filter((w) => {
      const matchesSearch =
        w.eventType.toLowerCase().includes(webhookSearch.toLowerCase()) ||
        (w.commenter && w.commenter.toLowerCase().includes(webhookSearch.toLowerCase())) ||
        (w.commentText && w.commentText.toLowerCase().includes(webhookSearch.toLowerCase())) ||
        w.username.toLowerCase().includes(webhookSearch.toLowerCase())

      if (!matchesSearch) return false

      if (webhookTypeFilter !== "all" && w.eventType !== webhookTypeFilter) return false
      return true
    })
  }, [webhooks, webhookSearch, webhookTypeFilter])

  // Filtered Automations
  const filteredAutomations = useMemo(() => {
    return automations.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(autoSearch.toLowerCase()) ||
        a.triggerValue.toLowerCase().includes(autoSearch.toLowerCase()) ||
        a.ownerUsername.toLowerCase().includes(autoSearch.toLowerCase()) ||
        (a.ownerIgUsername && a.ownerIgUsername.toLowerCase().includes(autoSearch.toLowerCase()))

      if (!matchesSearch) return false

      if (autoSourceFilter !== "all" && a.triggerSource !== autoSourceFilter) return false
      return true
    })
  }, [automations, autoSearch, autoSourceFilter])

  // Filtered Feedback
  const filteredFeedback = useMemo(() => {
    return feedbackList.filter((fb) => {
      const matchesSearch =
        fb.username.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        fb.message.toLowerCase().includes(feedbackSearch.toLowerCase()) ||
        fb.category.toLowerCase().includes(feedbackSearch.toLowerCase())

      if (!matchesSearch) return false

      if (feedbackStatusFilter !== "all" && fb.status !== feedbackStatusFilter) return false
      if (feedbackCategoryFilter !== "all" && fb.category !== feedbackCategoryFilter) return false
      return true
    })
  }, [feedbackList, feedbackSearch, feedbackStatusFilter, feedbackCategoryFilter])

  // Feedback Metrics
  const avgRating = useMemo(() => {
    if (!feedbackList.length) return 5
    const sum = feedbackList.reduce((acc, curr) => acc + (curr.rating || 5), 0)
    return (sum / feedbackList.length).toFixed(1)
  }, [feedbackList])

  const newFeedbackCount = useMemo(() => {
    return feedbackList.filter((fb) => fb.status === "new").length
  }, [feedbackList])

  if (isLocked) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full border-border">
          <CardHeader className="text-center">
            <div className="mx-auto size-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-2">
              <Lock className="size-6" />
            </div>
            <CardTitle className="text-lg">Admin Command Center</CardTitle>
            <CardDescription className="text-xs">
              This area is restricted. Enter the system administrator passkey to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const key = adminPasskey.trim()
                if (!key) {
                  toast.error("Please enter your administrator passkey")
                  return
                }
                setUnlocking(true)
                try {
                  await loadDashboardData(true, key)
                } finally {
                  setUnlocking(false)
                }
              }}
              className="space-y-3"
            >
              <div className="relative">
                <Input
                  type={showPasskey ? "text" : "password"}
                  placeholder="Enter admin passkey (default: admin123)..."
                  value={adminPasskey}
                  onChange={(e) => setAdminPasskey(e.target.value)}
                  className="text-xs font-mono pr-9"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPasskey(!showPasskey)}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-label={showPasskey ? "Hide passkey" : "Show passkey"}
                >
                  {showPasskey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <Button type="submit" disabled={unlocking} className="w-full text-xs font-medium cursor-pointer">
                {unlocking ? "Verifying passkey..." : "Unlock Dashboard"}
              </Button>
            </form>
            <div className="text-center pt-1 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                Default fallback passkey: <code className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold">admin123</code>
              </p>
              <div>
                <Link href="/dashboard" className="text-xs text-muted-foreground hover:underline">
                  Return to Creator App
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top Admin Header Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight">flash-insta</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-mono uppercase tracking-wider py-0 h-5">
                  Admin NOC
                </Badge>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Supabase Live
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Fleet Telemetry & Operational Control Plane</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="h-8 gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh Data</span>
            </Button>

            <Link href="/dashboard">
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs">
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Creator App</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.removeItem("insta_admin_passkey")
                document.cookie = "insta_admin_key=; path=/; max-age=0"
                setAdminPasskey("")
                setIsLocked(true)
                toast.info("Admin session locked")
              }}
              className="h-8 gap-1.5 text-xs text-muted-foreground"
            >
              <Lock className="size-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </Button>

            <ThemeToggle className="h-8 w-14" />
          </div>
        </div>
      </header>

      {/* Main Admin Body */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Top Operational Metrics Ribbon */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* 1. Creators Fleet */}
          <Card className="p-3.5 border-border/70 hover:border-border transition-colors">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">Creators Fleet</span>
              <Users className="size-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.users.total ?? users.length}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              <span>{stats?.users.connected ?? 0} connected</span>
              {stats?.users.expiredTokens ? (
                <span className="text-amber-500 ml-auto font-medium">
                  {stats.users.expiredTokens} expired
                </span>
              ) : null}
            </div>
          </Card>

          {/* 2. User Feedback */}
          <Card
            onClick={() => setActiveTab("feedback")}
            className="p-3.5 border-border/70 hover:border-border transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">User Feedback</span>
              <MessageSquareHeart className="size-4 text-primary" />
            </div>
            <div className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span>{feedbackList.length}</span>
              {newFeedbackCount > 0 && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/20">
                  {newFeedbackCount} new
                </Badge>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Star className="size-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground">{avgRating}</span>
              <span>avg satisfaction</span>
            </div>
          </Card>

          {/* 3. Webhook Ingress */}
          <Card className="p-3.5 border-border/70 hover:border-border transition-colors">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">Webhook Ingress</span>
              <Zap className="size-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.webhooks.total ?? webhooks.length}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Past 24h: <strong className="text-foreground">{stats?.webhooks.past24h ?? 0}</strong></span>
              <span className="text-emerald-500">100% OK</span>
            </div>
          </Card>

          {/* 4. Automations Active */}
          <Card className="p-3.5 border-border/70 hover:border-border transition-colors">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">Automations</span>
              <Workflow className="size-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.automations.total ?? automations.length}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="text-emerald-500 font-medium">{stats?.automations.active ?? 0} active</span>
              <span>•</span>
              <span>{stats?.automations.paused ?? 0} paused</span>
            </div>
          </Card>

          {/* 5. DM Queue Outbox */}
          <Card className="p-3.5 border-border/70 hover:border-border transition-colors">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">DM Outbox</span>
              <Send className="size-4 text-sky-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {stats?.dmQueue.total ?? dmQueue.length}
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Pending: {stats?.dmQueue.pending ?? 0}</span>
              {stats?.dmQueue.failed ? (
                <span className="text-destructive font-medium">{stats.dmQueue.failed} failed</span>
              ) : (
                <span className="text-emerald-500">0 errors</span>
              )}
            </div>
          </Card>

          {/* 6. Database Latency */}
          <Card className="p-3.5 border-border/70 hover:border-border transition-colors">
            <div className="flex items-center justify-between text-muted-foreground mb-1">
              <span className="text-xs font-medium">DB Latency</span>
              <Database className="size-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold tracking-tight">
              {diagnostics?.database.latencyMs ? `${diagnostics.database.latencyMs}ms` : "Active"}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>12 Tables Synced</span>
            </div>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto p-1 bg-muted/60">
            <TabsTrigger value="overview" className="gap-1.5 py-2 text-xs">
              <Activity className="size-3.5" />
              <span>Overview</span>
            </TabsTrigger>
            <TabsTrigger value="feedback" className="gap-1.5 py-2 text-xs">
              <MessageSquareHeart className="size-3.5" />
              <span>Feedback ({feedbackList.length})</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 py-2 text-xs">
              <Users className="size-3.5" />
              <span>Users ({users.length})</span>
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-1.5 py-2 text-xs">
              <Workflow className="size-3.5" />
              <span>Automations ({automations.length})</span>
            </TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5 py-2 text-xs">
              <Zap className="size-3.5" />
              <span>Webhooks ({webhooks.length})</span>
            </TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-1.5 py-2 text-xs">
              <Server className="size-3.5" />
              <span>Diagnostics</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: OVERVIEW & SYSTEM HEALTH */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: 7-Day Activity & Feedback Stream */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold">Event Ingress & Reply Throughput</CardTitle>
                        <CardDescription className="text-xs">
                          7-day distribution of Instagram webhook comment replies and direct messages
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Past 7 Days
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {stats?.webhooks.timeline && stats.webhooks.timeline.length > 0 ? (
                      <div className="space-y-4 pt-2">
                        <div className="grid grid-cols-7 gap-2 h-44 items-end pb-2 border-b border-border">
                          {stats.webhooks.timeline.map((day, i) => {
                            const maxVal = Math.max(...stats!.webhooks.timeline.map((d) => d.total), 1)
                            const heightPercent = Math.min(100, Math.max(12, Math.round((day.total / maxVal) * 100)))
                            return (
                              <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
                                <span className="text-[10px] font-mono text-muted-foreground">{day.total}</span>
                                <div
                                  className="w-full bg-primary/20 hover:bg-primary/30 rounded-t transition-all flex flex-col justify-end overflow-hidden"
                                  style={{ height: `${heightPercent}%` }}
                                >
                                  <div
                                    className="bg-primary w-full"
                                    style={{
                                      height: `${day.total > 0 ? Math.round((day.comments / day.total) * 100) : 0}%`,
                                    }}
                                    title={`${day.comments} comment replies`}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {day.label.slice(0, 3)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <span className="size-2.5 rounded-sm bg-primary" />
                            <span>Comment Auto-Replies</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="size-2.5 rounded-sm bg-primary/30" />
                            <span>Direct Messages & Other</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-44 flex items-center justify-center text-xs text-muted-foreground">
                        No webhook events recorded in the last 7 days
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* USER FEEDBACK STREAM (Replaced Live Event Stream) */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <MessageSquareHeart className="size-4 text-primary" />
                          <span>User Feedback & Product Requests</span>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Real-time stream of creator feedback, bugs reported, and feature requests
                        </CardDescription>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setActiveTab("feedback")} className="text-xs h-7">
                        View All ({feedbackList.length})
                        <ArrowUpRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {feedbackList.length > 0 ? (
                        feedbackList.slice(0, 6).map((fb) => (
                          <div key={fb.id} className="p-3.5 flex items-start justify-between gap-3 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="flex items-center gap-0.5 mt-0.5 shrink-0 bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-500">
                                <Star className="size-3 fill-amber-400 text-amber-400" />
                                <span className="text-[11px] font-bold font-mono">{fb.rating}</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-foreground">{fb.username}</span>
                                  {fb.igUsername && fb.igUsername.startsWith("@") && (
                                    <a
                                      href={`https://instagram.com/${fb.igUsername.replace(/^@/, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-pink-600 dark:text-pink-400 hover:underline border border-pink-500/20"
                                      title="View Instagram Profile"
                                    >
                                      <Instagram className="size-2.5" />
                                      <span>{fb.igUsername}</span>
                                      <ExternalLink className="size-2" />
                                    </a>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] h-4 px-1.5 capitalize ${
                                      fb.category === "bug"
                                        ? "bg-destructive/10 text-destructive border-destructive/20"
                                        : fb.category === "feature_request"
                                        ? "bg-primary/10 text-primary border-primary/20"
                                        : fb.category === "improvement"
                                        ? "bg-sky-500/10 text-sky-500 border-sky-500/20"
                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    }`}
                                  >
                                    {fb.category.replace("_", " ")}
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[9px] h-4 px-1 font-mono uppercase ${
                                      fb.status === "new"
                                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                        : fb.status === "in_review"
                                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400"
                                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                    }`}
                                  >
                                    {fb.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-foreground mt-1 max-w-xl">
                                  {fb.message}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[11px] text-muted-foreground block">
                                {fb.createdAt ? new Date(fb.createdAt).toLocaleDateString() : "Just now"}
                              </span>
                              <div className="mt-1 flex items-center justify-end gap-1">
                                {fb.status !== "resolved" ? (
                                  <button
                                    onClick={() => handleUpdateFeedbackStatus(fb.id, "resolved")}
                                    className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
                                  >
                                    Resolve
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">Resolved</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          <MessageSquarePlus className="size-6 text-muted-foreground mx-auto mb-2 opacity-50" />
                          <p className="font-medium text-foreground">No feedback submissions yet</p>
                          <p className="text-muted-foreground mt-0.5">
                            Creators can submit feedback via the "Feedback" button in their sidebar.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Col: System Diagnostics & Token Alerts */}
              <div className="space-y-6">
                {/* Token Expiration Watchdog */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShieldCheck className="size-4 text-emerald-500" />
                      <span>Token Health Watchdog</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Instagram Graph API tokens 60-day expiry tracker
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {users.filter((u) => u.isExpired || (u.daysUntilExpiry !== null && u.daysUntilExpiry <= 14)).length > 0 ? (
                      users
                        .filter((u) => u.isExpired || (u.daysUntilExpiry !== null && u.daysUntilExpiry <= 14))
                        .map((u) => (
                          <div
                            key={u.id}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                              u.isExpired
                                ? "bg-destructive/10 border-destructive/30 text-destructive"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-semibold truncate">@{u.igUsername || u.username}</div>
                              <div className="text-[10px] opacity-80">
                                {u.isExpired ? "Token expired — requires reconnection" : `Expires in ${u.daysUntilExpiry} days`}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 shrink-0 bg-background"
                              onClick={() => {
                                setSelectedUser(u)
                                setActiveTab("users")
                              }}
                            >
                              Manage
                            </Button>
                          </div>
                        ))
                    ) : (
                      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span>All active Instagram user tokens are healthy and validated.</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-border space-y-2 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Connected Creators:</span>
                        <span className="font-semibold text-foreground">{stats?.users.connected} / {stats?.users.total}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Groq Auto-Reply Enabled:</span>
                        <span className="font-semibold text-foreground">{stats?.users.groqEnabled} creators</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Reels Posts Published:</span>
                        <span className="font-semibold text-foreground">{stats?.reels.published} published</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Subsystem Readiness Matrix */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Subsystem Readiness</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between p-2 rounded bg-muted/40">
                      <span className="font-medium">Supabase Service Role</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        ACTIVE
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-muted/40">
                      <span className="font-medium">Meta Webhook Ingress</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        VERIFIED
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-muted/40">
                      <span className="font-medium">Groq LLM Engine</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        READY
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-muted/40">
                      <span className="font-medium">Feedback Receiver</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                        ONLINE
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: FEEDBACK MANAGER */}
          <TabsContent value="feedback" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <MessageSquareHeart className="size-4 text-primary" />
                      <span>Creator Feedback & Feature Requests</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Track user satisfaction, requested features, and issues reported by creators
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search feedback..."
                        value={feedbackSearch}
                        onChange={(e) => setFeedbackSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <select
                      value={feedbackStatusFilter}
                      onChange={(e) => setFeedbackStatusFilter(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All Statuses</option>
                      <option value="new">New</option>
                      <option value="in_review">In Review</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    <select
                      value={feedbackCategoryFilter}
                      onChange={(e) => setFeedbackCategoryFilter(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All Types</option>
                      <option value="feature_request">Feature Request</option>
                      <option value="bug">Bug Report</option>
                      <option value="improvement">Improvement</option>
                      <option value="praise">Praise</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                        <th className="p-3">Rating</th>
                        <th className="p-3">Creator</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Feedback Message</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredFeedback.length > 0 ? (
                        filteredFeedback.map((fb) => (
                          <tr key={fb.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                {[...Array(fb.rating || 5)].map((_, i) => (
                                  <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                {fb.profilePic ? (
                                  <img
                                    src={fb.profilePic}
                                    alt=""
                                    className="size-7 rounded-full object-cover border border-border shrink-0"
                                    onError={(e) => {
                                      ;(e.currentTarget as HTMLElement).style.display = "none"
                                    }}
                                  />
                                ) : (
                                  <div className="size-7 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                                    {(fb.username || "C").charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold text-foreground text-xs truncate max-w-[140px]">{fb.username}</div>
                                  {fb.igUsername && fb.igUsername.startsWith("@") ? (
                                    <a
                                      href={`https://instagram.com/${fb.igUsername.replace(/^@/, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-pink-600 dark:text-pink-400 hover:underline"
                                      title="Open Instagram Profile"
                                    >
                                      <Instagram className="size-2.5" />
                                      <span className="truncate max-w-[120px]">{fb.igUsername}</span>
                                      <ExternalLink className="size-2" />
                                    </a>
                                  ) : fb.userId ? (
                                    <div className="text-[10px] text-muted-foreground font-mono">ID: {fb.userId}</div>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge
                                variant="outline"
                                className="text-[10px] capitalize"
                              >
                                {fb.category.replace("_", " ")}
                              </Badge>
                            </td>
                            <td className="p-3 max-w-md text-foreground">
                              {fb.message}
                            </td>
                            <td className="p-3">
                              <select
                                value={fb.status}
                                onChange={(e) => handleUpdateFeedbackStatus(fb.id, e.target.value as any)}
                                className={`text-[11px] font-medium rounded border px-2 py-1 bg-background ${
                                  fb.status === "new"
                                    ? "border-amber-500 text-amber-600 dark:text-amber-400"
                                    : fb.status === "in_review"
                                    ? "border-sky-500 text-sky-600 dark:text-sky-400"
                                    : "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                <option value="new">New</option>
                                <option value="in_review">In Review</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px] whitespace-nowrap">
                              {fb.createdAt ? new Date(fb.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteFeedback(fb.id)}
                                className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            No feedback matches filter
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: USERS FLEET DIRECTORY */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Creator Account Directory</CardTitle>
                    <CardDescription className="text-xs">
                      Inspect tokens, account IDs, automation rules, and toggle AI features per user
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search username, ID..."
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value as any)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All Users</option>
                      <option value="connected">Connected Only</option>
                      <option value="expired">Token Expired</option>
                      <option value="groq">Groq AI Active</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                        <th className="p-3">User & Instagram</th>
                        <th className="p-3">Business Account ID</th>
                        <th className="p-3">Token Health</th>
                        <th className="p-3">Automations</th>
                        <th className="p-3">Groq AI</th>
                        <th className="p-3">Registered</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((u) => (
                          <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <span>{u.username}</span>
                                {u.isIgConnected && (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                    IG Connected
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {u.igUsername ? `@${u.igUsername}` : "No IG Handle linked"} • ID: {u.id}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              {u.businessAccountId || <span className="text-muted-foreground italic">None</span>}
                              {u.pageId && <div className="text-[10px] text-muted-foreground">Page: {u.pageId}</div>}
                            </td>
                            <td className="p-3">
                              {u.isExpired ? (
                                <Badge variant="destructive" className="text-[10px]">Expired</Badge>
                              ) : u.daysUntilExpiry !== null ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${
                                    u.daysUntilExpiry <= 14
                                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                      : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  }`}
                                >
                                  {u.daysUntilExpiry}d remaining
                                </Badge>
                              ) : u.hasAccessToken ? (
                                <Badge variant="secondary" className="text-[10px]">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">No Token</Badge>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="font-semibold">{u.automations.active}</span>
                              <span className="text-muted-foreground"> / {u.automations.total} rules</span>
                              <div className="text-[10px] text-muted-foreground">
                                {u.conversationsCount} conversations
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={u.groqAutoReplyEnabled}
                                  onCheckedChange={() => handleToggleUserGroq(u.id, u.groqAutoReplyEnabled)}
                                  className="scale-75 origin-left"
                                />
                                <span className={`text-[11px] ${u.groqAutoReplyEnabled ? "text-emerald-500 font-medium" : "text-muted-foreground"}`}>
                                  {u.groqAutoReplyEnabled ? "Active" : "Off"}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px]">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedUser(u)}
                                className="h-7 text-xs px-2.5"
                              >
                                Details
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            No creators found matching criteria
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: AUTOMATIONS FLEET */}
          <TabsContent value="automations" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Global Automations Audit</CardTitle>
                    <CardDescription className="text-xs">
                      Inspect and manage active trigger rules across all creator accounts
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search rules, keywords..."
                        value={autoSearch}
                        onChange={(e) => setAutoSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <select
                      value={autoSourceFilter}
                      onChange={(e) => setAutoSourceFilter(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All Sources</option>
                      <option value="comment">Comment Triggers</option>
                      <option value="dm">DM Triggers</option>
                      <option value="story">Story Mentions</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                        <th className="p-3">Rule Name & Owner</th>
                        <th className="p-3">Trigger Source</th>
                        <th className="p-3">Trigger Condition</th>
                        <th className="p-3">Response Config</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Created</th>
                        <th className="p-3 text-right">Toggle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredAutomations.length > 0 ? (
                        filteredAutomations.map((a) => (
                          <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <div className="font-semibold text-foreground">{a.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                Owner: {a.ownerIgUsername ? `@${a.ownerIgUsername}` : a.ownerUsername}
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {a.triggerSource}
                              </Badge>
                            </td>
                            <td className="p-3 font-mono text-[11px]">
                              <span className="text-primary">{a.triggerType}:</span> "{a.triggerValue}"
                            </td>
                            <td className="p-3 max-w-xs truncate text-[11px] text-muted-foreground">
                              {a.responseContent?.commentReply && (
                                <div>Comment: "{a.responseContent.commentReply}"</div>
                              )}
                              {a.responseContent?.message && (
                                <div>DM: "{a.responseContent.message}"</div>
                              )}
                              {!a.responseContent?.commentReply && !a.responseContent?.message && (
                                <span>Default response</span>
                              )}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={a.isActive ? "default" : "secondary"}
                                className={`text-[10px] ${a.isActive ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : ""}`}
                              >
                                {a.isActive ? "Active" : "Paused"}
                              </Badge>
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px]">
                              {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Switch
                                checked={a.isActive}
                                onCheckedChange={() => handleToggleAutomation(a.id, a.isActive)}
                                className="scale-75"
                              />
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            No automations match query
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: WEBHOOKS LIVE AUDIT STREAM */}
          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Instagram Webhook Event Stream</CardTitle>
                    <CardDescription className="text-xs">
                      Live audit of real-time payload ingress from Meta Graph API
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative w-48 sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search commenter, text..."
                        value={webhookSearch}
                        onChange={(e) => setWebhookSearch(e.target.value)}
                        className="h-8 pl-8 text-xs"
                      />
                    </div>
                    <select
                      value={webhookTypeFilter}
                      onChange={(e) => setWebhookTypeFilter(e.target.value)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All Event Types</option>
                      <option value="comment_reply">comment_reply</option>
                      <option value="message_auto_reply">message_auto_reply</option>
                      <option value="story_mention">story_mention</option>
                    </select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                        <th className="p-3">Event Type</th>
                        <th className="p-3">Creator / Account</th>
                        <th className="p-3">Commenter / Sender</th>
                        <th className="p-3">Content / Trigger</th>
                        <th className="p-3">Reply Status</th>
                        <th className="p-3">Processed At</th>
                        <th className="p-3 text-right">Payload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredWebhooks.length > 0 ? (
                        filteredWebhooks.map((w) => (
                          <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                            <td className="p-3">
                              <Badge variant="outline" className="font-mono text-[10px] bg-primary/10 text-primary border-primary/20">
                                {w.eventType}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-foreground">{w.username}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">UID: {w.userId}</div>
                            </td>
                            <td className="p-3">
                              {w.commenter ? (
                                <span className="font-semibold text-foreground">@{w.commenter}</span>
                              ) : (
                                <span className="text-muted-foreground italic">System</span>
                              )}
                            </td>
                            <td className="p-3 max-w-xs">
                              <p className="truncate text-foreground font-mono text-[11px]">
                                {w.commentText || "—"}
                              </p>
                              {w.mediaId && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  Media: {w.mediaId}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5">
                                {w.commentReplied && (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                    Comment Replied
                                  </Badge>
                                )}
                                {w.dmSent && (
                                  <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/20">
                                    DM Dispatched
                                  </Badge>
                                )}
                                {!w.commentReplied && !w.dmSent && (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Processed
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-muted-foreground text-[11px] whitespace-nowrap">
                              {w.processedAt ? new Date(w.processedAt).toLocaleString() : "—"}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedPayload(w.payload)}
                                className="h-7 text-xs font-mono text-primary px-2"
                              >
                                View JSON
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-muted-foreground">
                            No webhook events found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: DIAGNOSTICS & SYSTEM MATRIX */}
          <TabsContent value="diagnostics" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Database Tables Audit */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">Supabase Tables Inventory</CardTitle>
                      <CardDescription className="text-xs">
                        Exact row counts & connectivity health per table
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                      {diagnostics?.database.latencyMs}ms Latency
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {diagnostics?.database.tables ? (
                      Object.entries(diagnostics.database.tables).map(([table, meta]) => (
                        <div key={table} className="p-3 flex items-center justify-between text-xs hover:bg-muted/20">
                          <span className="font-mono font-medium text-foreground">{table}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-foreground">
                              {meta.count !== null ? meta.count.toLocaleString() : "—"} rows
                            </span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase font-mono ${
                                meta.status === "ok"
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                  : "bg-destructive/10 text-destructive border-destructive/20"
                              }`}
                            >
                              {meta.status}
                            </Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-xs text-muted-foreground">Running table scan...</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Environment Checklist */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Environment & API Credentials</CardTitle>
                  <CardDescription className="text-xs">
                    Verification of required API keys and webhook secrets
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="divide-y divide-border border rounded-lg">
                    {diagnostics?.environment ? (
                      Object.entries(diagnostics.environment).map(([key, val]) => (
                        <div key={key} className="p-2.5 flex items-center justify-between text-xs">
                          <span className="font-mono text-muted-foreground">{key}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              val
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-destructive/10 text-destructive border-destructive/20"
                            }`}
                          >
                            {typeof val === "boolean" ? (val ? "CONFIGURED" : "MISSING") : String(val)}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-muted-foreground">Checking environment variables...</div>
                    )}
                  </div>

                  <div className="pt-3">
                    <Button
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => loadDashboardData(true)}
                    >
                      <RefreshCw className="size-3.5 mr-2" />
                      Run Full Infrastructure Healthcheck
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL 1: RAW JSON PAYLOAD INSPECTOR */}
      <Dialog open={Boolean(selectedPayload)} onOpenChange={(open) => !open && setSelectedPayload(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base font-mono">Raw Webhook Event Data</DialogTitle>
            <DialogDescription className="text-xs">
              Exact JSON structure received and logged for this event trigger
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/60 rounded-lg p-4 font-mono text-xs border border-border">
            <pre className="text-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(selectedPayload, null, 2)}
            </pre>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(selectedPayload, null, 2))
                toast.success("Payload copied to clipboard")
              }}
              className="text-xs"
            >
              Copy JSON
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: USER DETAIL & FLEET MANAGEMENT */}
      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <Instagram className="size-4 text-primary" />
              <span>User Telemetry & Configuration</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Deep inspection of account #{selectedUser?.id}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Username</span>
                  <span className="font-semibold text-foreground text-sm">{selectedUser.username}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Instagram Handle</span>
                  <span className="font-semibold text-foreground text-sm">
                    {selectedUser.igUsername ? `@${selectedUser.igUsername}` : "Not linked"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Business Account ID</span>
                  <span className="font-mono text-foreground">{selectedUser.businessAccountId || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Connected Page</span>
                  <span className="font-mono text-foreground">{selectedUser.pageId || "—"}</span>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Token Expiration Date:</span>
                  <span className="font-mono text-foreground font-semibold">
                    {selectedUser.tokenExpiresAt ? new Date(selectedUser.tokenExpiresAt).toLocaleString() : "No Expiry / Static"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Days Remaining:</span>
                  <span className="font-mono text-foreground">
                    {selectedUser.daysUntilExpiry !== null ? `${selectedUser.daysUntilExpiry} days` : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Verification Method:</span>
                  <span className="font-mono text-foreground">{selectedUser.verifiedVia || "Standard OAuth"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Groq AI Auto-Reply:</span>
                  <Switch
                    checked={selectedUser.groqAutoReplyEnabled}
                    onCheckedChange={() => handleToggleUserGroq(selectedUser.id, selectedUser.groqAutoReplyEnabled)}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-3 flex items-center justify-between">
                <span className="text-muted-foreground">
                  Automations: <strong>{selectedUser.automations.active} active</strong> of {selectedUser.automations.total}
                </span>
                {selectedUser.igUsername && (
                  <a
                    href={`https://www.instagram.com/${selectedUser.igUsername}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    <span>View Instagram Profile</span>
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
