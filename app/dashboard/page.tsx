"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Plus,
  Users,
  Workflow,
  Instagram,
  AlertTriangle,
  Zap,
  Film,
  ExternalLink,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConnectInstagramModal } from "@/components/dashboard/ConnectInstagramModal"
import { FeedbackCard } from "@/components/dashboard/FeedbackCard"
import { formatIdentityHandle } from "@/lib/identity"

interface DashboardStats {
  metrics?: { totalAutomations: number; activeTriggers: number; audienceReached: number; messagesSent: number }
  automationsCount?: number
  activeCount?: number
  audienceCount?: number
  messagesSent?: number
  recentActivity?: Array<{
    id: string
    content: string
    created_at: string
    sender_username?: string
    recipient?: { recipient_username: string }
  }>
  recentActivities?: Array<{
    id: string
    title: string
    description: string
    time: string
  }>
}

// Per-user client cache ensuring 100% tenant isolation across account switches
const statsCacheByUserId = new Map<string, DashboardStats>()
const mediaCacheByUserId = new Map<string, any[]>()

export default function DashboardPage() {
  const {
    username,
    userId,
    profilePic,
    isLoading: sessionLoading,
    isIgConnected,
    igUsername,
    businessAccountId,
    refreshIgStatus,
  } = useInstagramSession()

  const [stats, setStats] = useState<DashboardStats | null>(() => {
    if (!userId) return null
    if (statsCacheByUserId.has(userId)) return statsCacheByUserId.get(userId) || null
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_stats_" + userId)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (
            parsed &&
            (parsed.metrics ||
              typeof parsed.automationsCount === "number" ||
              typeof parsed.totalAutomations === "number")
          ) {
            statsCacheByUserId.set(userId, parsed)
            return parsed
          }
        }
      } catch {}
    }
    return null
  })
  const [loading, setLoading] = useState(() => !(userId && statsCacheByUserId.has(userId)))
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [mediaList, setMediaList] = useState<any[]>(() => {
    if (!userId) return []
    if (mediaCacheByUserId.has(userId)) return mediaCacheByUserId.get(userId) || []
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_reels_" + userId)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            mediaCacheByUserId.set(userId, parsed)
            return parsed
          }
        }
      } catch {}
    }
    return []
  })
  const [loadingMedia, setLoadingMedia] = useState(false)

  const fetchMedia = () => {
    if (!userId || !isIgConnected) {
      setMediaList([])
      return
    }
    setLoadingMedia(true)
    fetch(`/api/instagram/media?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data)) ? data.data : []
        mediaCacheByUserId.set(userId, list)
        if (typeof window !== "undefined" && list.length > 0) {
          try {
            window.sessionStorage.setItem("flashinsta_reels_" + userId, JSON.stringify(list))
          } catch {}
        }
        setMediaList(list)
      })
      .catch(err => console.error("Failed to load Instagram media", err))
      .finally(() => setLoadingMedia(false))
  }

  useEffect(() => {
    if (sessionLoading && !userId) return
    if (!userId) {
      setStats(null)
      setMediaList([])
      setLoading(false)
      return
    }

    const cachedStats = statsCacheByUserId.get(userId)
    if (cachedStats) {
      setStats(cachedStats)
      setLoading(false)
    } else {
      setLoading(true)
    }

    fetch(`/api/dashboard/stats?userId=${userId}`)
      .then(response => response.json())
      .then(data => {
        if (data && !data.error) {
          statsCacheByUserId.set(userId, data)
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.setItem("flashinsta_stats_" + userId, JSON.stringify(data))
            } catch {}
          }
          setStats(data)
        }
      })
      .catch(error => console.error("Failed to load dashboard stats", error))
      .finally(() => setLoading(false))

    if (isIgConnected) {
      fetchMedia()
    } else {
      setMediaList([])
    }

    // Auto-sync comments and dispatch auto-replies
    fetch(`/api/instagram/sync-comments?userId=${userId}`, { method: "POST" }).catch(() => {})
    const syncInterval = setInterval(() => {
      fetch(`/api/instagram/sync-comments?userId=${userId}`, { method: "POST" }).catch(() => {})
    }, 30000)
    return () => clearInterval(syncInterval)
  }, [userId, sessionLoading, isIgConnected])

  if ((sessionLoading || loading) && !stats) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 space-y-7 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/60">
          <div className="space-y-2">
            <div className="w-56 h-8 rounded-lg bg-muted/60" />
            <div className="w-80 h-4 rounded-md bg-muted/40" />
          </div>
          <div className="w-36 h-10 rounded-xl bg-muted/50" />
        </div>

        {/* 4 Stat Cards Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={`stat-skel-${i}`} className="p-4 sm:p-5 rounded-2xl border border-border/60 bg-card/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-24 h-4 rounded bg-muted/60" />
                <div className="w-8 h-8 rounded-lg bg-muted/40" />
              </div>
              <div className="w-20 h-7 rounded-lg bg-muted/70" />
              <div className="w-32 h-3 rounded bg-muted/30" />
            </div>
          ))}
        </div>

        {/* Media Grid Skeleton */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="w-44 h-5 rounded bg-muted/60" />
            <div className="w-24 h-4 rounded bg-muted/40" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={`post-skel-${i}`}
                className="aspect-square rounded-xl border border-border/60 bg-muted/30 relative overflow-hidden flex flex-col justify-end p-2.5"
              >
                <div className="w-8 h-3 rounded bg-muted/60 mb-1.5" />
                <div className="w-16 h-2 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-5 py-16 text-center">
        <h2 className="text-xl font-semibold mb-2">No active account found</h2>
        <p className="text-sm text-muted-foreground mb-6">Please log in to access your automation workspace.</p>
        <Link href="/" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#ffe14d] text-black font-mono-ui text-sm font-bold px-6 hover:brightness-110 transition-all">
          Go to Log in
        </Link>
      </div>
    )
  }

  const metrics = stats?.metrics || {
    totalAutomations: stats?.automationsCount ?? 0,
    activeTriggers: stats?.activeCount ?? 0,
    messagesSent: stats?.messagesSent ?? 0,
    audienceReached: stats?.audienceCount ?? 0,
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3.5">
            {profilePic ? (
              <img
                src={profilePic}
                alt={username || "Account"}
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="size-11 rounded-full object-cover border border-border shadow-sm shrink-0"
              />
            ) : (
              <div className="size-11 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-base text-sidebar-primary-foreground border border-border shrink-0">
                {(username || "I").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground">
                Welcome back, {formatIdentityHandle(username, "Creator")}
              </p>
              <h1 className="mt-0.5 text-3xl font-semibold tracking-[-0.03em]">Your workspace</h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isIgConnected && (
            <button
              onClick={() => setShowConnectModal(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888] px-4 text-xs font-bold font-mono-ui text-white hover:opacity-95 transition-all shadow-md cursor-pointer"
            >
              <Instagram className="size-3.5" />
              Connect Instagram
            </button>
          )}
          <Link href="/dashboard/automations" className="inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" />
            Create workflow
          </Link>
        </div>
      </header>

      {/* Prominent Banner if Instagram is NOT connected */}
      {!isIgConnected && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="size-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono-ui text-foreground">
                Instagram account is not connected yet
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                Connect your Instagram account or enter your API access token to activate live comment-to-DM funnels, story replies, and inbox automations.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConnectModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#ffe14d] text-black font-mono-ui text-xs font-bold px-5 py-3 hover:brightness-110 active:scale-[0.98] transition-all shrink-0 cursor-pointer shadow-lg shadow-[#ffe14d]/10"
          >
            <Zap className="size-4" strokeWidth={2.5} />
            Connect Instagram Account
          </button>
        </div>
      )}

      <section className="grid border-b border-border sm:grid-cols-2 lg:grid-cols-4 mt-6" aria-label="Account summary">
        <Metric label="Workflows" value={metrics?.totalAutomations ?? 0} icon={Workflow} />
        <Metric label="Active triggers" value={metrics?.activeTriggers ?? 0} icon={CheckCircle2} />
        <Metric label="Messages sent" value={metrics?.messagesSent ?? 0} icon={MessageSquare} />
        <Metric label="People reached" value={metrics?.audienceReached ?? 0} icon={Users} />
      </section>

      <div className="grid gap-6 py-7 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">Recent conversations</h2>
              <p className="mt-1 text-xs text-muted-foreground">Latest replies sent by your workflows</p>
            </div>
            <Link href="/dashboard/inbox" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
              View all<ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {(() => {
              const activities = stats?.recentActivity?.length
                ? stats.recentActivity
                : stats?.recentActivities?.map((a) => ({
                    id: a.id,
                    content: a.description,
                    created_at: a.time,
                    recipient: { recipient_username: a.title.replace(/^DM (received from|sent to) @/, "") },
                  })) || []

              return activities.length > 0 ? (
                activities.slice(0, 6).map((message) => (
                  <div key={message.id} className="flex items-center gap-3 px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <MessageSquare className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        @{message.recipient?.recipient_username || (message as any).sender_username || "instagram_user"}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{message.content}</p>
                    </div>
                    <time className="text-xs text-muted-foreground">
                      {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  </div>
                ))
              ) : (
                <EmptyState icon={MessageSquare} title="No conversations yet" description="New automated replies will appear here." />
              )
            })()}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                  <Bot className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Automation status</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {isIgConnected ? "Operational & ready" : "Awaiting Instagram link"}
                  </p>
                </div>
              </div>
            </div>
            <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Instagram</dt>
                <dd className="flex items-center gap-2 font-medium">
                  {isIgConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-mono-ui">
                      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                      @{igUsername || "connected"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-mono-ui">
                      <span className="size-2 rounded-full bg-amber-500" />
                      Not connected
                    </span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Running workflows</dt>
                <dd className="font-medium">{metrics?.activeTriggers ?? 0}</dd>
              </div>
              {businessAccountId && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Account ID</dt>
                  <dd className="font-mono-ui text-xs text-muted-foreground truncate max-w-[140px]">
                    {businessAccountId}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-4 pt-3 border-t border-border">
              <button
                onClick={() => setShowConnectModal(true)}
                className="w-full text-center py-2 px-3 rounded-lg border border-border hover:bg-secondary text-xs font-mono-ui font-semibold transition-colors cursor-pointer"
              >
                {isIgConnected ? "Manage API Credentials" : "Connect Instagram"}
              </button>
            </div>
          </section>

          <section className="rounded-xl bg-primary p-5 text-primary-foreground">
            <h2 className="text-sm font-semibold">Build your next workflow</h2>
            <p className="mt-2 text-xs leading-5 text-primary-foreground/75">
              Turn a comment, direct message, or story reply into an automatic response.
            </p>
            <Link href="/dashboard/automations" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold">
              Open workflow builder<ArrowRight className="size-3.5" />
            </Link>
          </section>
        </aside>
      </div>

      {/* Instagram Live Feed & Posts Section */}
      <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-sm">
              <Instagram className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-mono-ui text-foreground">
                  Instagram Feed & Reels
                </h2>
                {isIgConnected && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono-ui font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    @{igUsername} (Live)
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mediaList.length > 0
                  ? `Retrieved ${mediaList.length} live reels and posts directly from your Instagram account.`
                  : "Live posts, reels, and stories synced from your Instagram account."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchMedia}
              disabled={loadingMedia}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-mono-ui text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${loadingMedia ? "animate-spin" : ""}`} />
              Refresh Feed
            </button>
            <Link
              href="/dashboard/automations"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffe14d] text-black font-mono-ui text-xs font-bold px-3.5 py-1.5 hover:brightness-110 transition-all cursor-pointer shadow-sm"
            >
              <Sparkles className="size-3.5" />
              Automate Post
            </Link>
          </div>
        </div>

        {loadingMedia && mediaList.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={`media-skel-${i}`}
                className="aspect-square rounded-xl border border-border/60 bg-muted/30 animate-pulse relative overflow-hidden flex flex-col justify-end p-2.5"
              >
                <div className="w-8 h-3 rounded bg-muted/60 mb-1.5" />
                <div className="w-16 h-2 rounded bg-muted/40" />
              </div>
            ))}
          </div>
        ) : mediaList.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {mediaList.map((item) => (
              <div
                key={item.id}
                className="group relative aspect-square rounded-xl overflow-hidden border border-border bg-neutral-900 shadow-sm transition-all hover:border-foreground/40 hover:shadow-md"
              >
                {(() => {
                  const isVideo = item.media_type === "VIDEO" || (!item.media_type && (item.media_url?.includes(".mp4") || item.permalink?.includes("/reel/")))
                  const cover = item.thumbnail_url || (isVideo ? null : (item.image_url || item.media_url || item.cover_url))
                  return cover ? (
                    <img
                      src={cover}
                      alt={item.caption || "Instagram Media"}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none"
                      }}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-500">
                      <Film className="size-6" />
                    </div>
                  )
                })()}

                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                <span className="absolute top-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[9px] font-mono-ui uppercase tracking-wider text-white border border-white/10 backdrop-blur-sm">
                  {item.media_type === "VIDEO" ? "Reel" : item.media_type === "STORY" ? "Story" : "Post"}
                </span>

                {item.permalink && (
                  <a
                    href={item.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-md bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80"
                    title="View on Instagram"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                )}

                <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-none">
                  <p className="text-[10px] text-white line-clamp-2 font-sans drop-shadow-sm leading-tight">
                    {item.caption || "Instagram post"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : !isIgConnected ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            <Instagram className="size-8 text-muted-foreground/50 mb-2" />
            <p className="font-semibold text-foreground">Instagram Account Not Linked</p>
            <p className="mt-1 max-w-sm">
              Link your Instagram Professional account to display and automate your live feed & reels.
            </p>
            <button
              onClick={() => setShowConnectModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#ffe14d] text-black font-mono-ui text-xs font-bold px-3.5 py-1.5 hover:brightness-110 transition-all cursor-pointer shadow-sm"
            >
              Connect Instagram
            </button>
          </div>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
            <Instagram className="size-8 text-muted-foreground/50 mb-2" />
            <p className="font-semibold text-foreground">No posts or reels found yet</p>
            <p className="mt-1 max-w-sm">
              Make sure your connected account has active posts or reels uploaded.
            </p>
          </div>
        )}
      </section>

      {/* Creator Feedback Section */}
      <section className="pt-2">
        <FeedbackCard
          userId={userId}
          username={username}
          igUsername={igUsername}
          profilePic={profilePic}
          isIgConnected={isIgConnected}
        />
      </section>

      {/* Connect Instagram Modal */}
      <ConnectInstagramModal
        open={showConnectModal}
        onOpenChange={setShowConnectModal}
        userId={userId}
        onConnected={refreshIgStatus}
      />
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="border-border py-6 sm:border-r sm:px-6 first:pl-0 last:border-r-0">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value.toLocaleString()}</p>
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-secondary">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
