"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Users,
  Workflow,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { Button } from "@/components/ui/button"

interface DailyActivity {
  date: string
  label: string
  incoming: number
  sent: number
  total: number
}

interface AnalyticsData {
  automationsCount: number
  activeCount: number
  audienceCount: number
  sentCount: number
  incomingCount: number
  responseRate: number
  triggerBreakdown: {
    comment: number
    story: number
    dm: number
  }
  performanceOverTime: DailyActivity[]
  automations: Array<{
    id: string
    name: string
    trigger_source: string
    trigger_type: string
    trigger_value: string
    is_active: boolean
    created_at: string
  }>
  recentActivity: Array<{
    id: string
    content: string
    created_at: string
    sender_username?: string
    recipient?: { recipient_username: string }
  }>
}

export default function AnalyticsPage() {
  const { userId, isLoading: sessionLoading } = useInstagramSession()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hoveredDay, setHoveredDay] = useState<DailyActivity | null>(null)

  const fetchAnalytics = async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    try {
      setRefreshing(true)
      const res = await fetch(`/api/dashboard/stats?userId=${userId}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch (e) {
      console.error("Failed to load insights:", e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (sessionLoading) return
    fetchAnalytics()
  }, [userId, sessionLoading])

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const performance = data?.performanceOverTime || []
  const maxDaily = Math.max(...performance.map((d) => Math.max(d.incoming, d.sent, d.total)), 5)

  const triggerTotal =
    (data?.triggerBreakdown?.comment || 0) +
    (data?.triggerBreakdown?.story || 0) +
    (data?.triggerBreakdown?.dm || 0) || 1

  const commentPct = Math.round(((data?.triggerBreakdown?.comment || 0) / triggerTotal) * 100)
  const storyPct = Math.round(((data?.triggerBreakdown?.story || 0) / triggerTotal) * 100)
  const dmPct = Math.round(((data?.triggerBreakdown?.dm || 0) / triggerTotal) * 100)

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 space-y-7">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            Performance & Analytics
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-foreground">Insights</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time engagement, conversation metrics, and automated funnel performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAnalytics}
            disabled={refreshing}
            className="text-xs h-9 border-border bg-card hover:bg-accent text-foreground cursor-pointer"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh Data
          </Button>
          <Link
            href="/dashboard/automations"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Manage Workflows
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* Top Metrics Cards */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Key Performance Indicators">
        <MetricCard
          label="Conversations"
          value={data?.audienceCount ?? 0}
          icon={MessageSquare}
          description="Total active threads"
        />
        <MetricCard
          label="People Reached"
          value={data?.audienceCount ?? 0}
          icon={Users}
          description="Unique Instagram users"
        />
        <MetricCard
          label="DMs Sent"
          value={data?.sentCount ?? 0}
          icon={Send}
          highlight
          description="Automated & bot replies"
        />
        <MetricCard
          label="Inbound Inquiries"
          value={data?.incomingCount ?? 0}
          icon={Inbox}
          description="User messages & replies"
        />
        <MetricCard
          label="Response Rate"
          value={`${data?.responseRate ?? 100}%`}
          icon={Activity}
          description="Replies vs inquiries"
        />
        <MetricCard
          label="Live Workflows"
          value={data?.activeCount ?? 0}
          icon={Workflow}
          description="Active automations"
        />
      </section>

      {/* Performance Over Time Section */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Daily Activity & Messages</h2>
              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[11px] font-semibold">
                Last 14 Days
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Volume of incoming triggers and automated responses delivered over time.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-primary" />
              <span className="text-muted-foreground">Automated DMs Sent</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-sky-500" />
              <span className="text-muted-foreground">Inbound Messages</span>
            </span>
          </div>
        </div>

        {/* Visual Chart */}
        <div className="p-6">
          {performance.length > 0 && performance.some((d) => d.total > 0) ? (
            <div className="space-y-4">
              <div className="h-56 flex items-end gap-2 pt-6 pb-2 px-1 border-b border-border">
                {performance.map((day) => {
                  const sentHeight = Math.max(4, Math.round((day.sent / maxDaily) * 180))
                  const incomingHeight = Math.max(4, Math.round((day.incoming / maxDaily) * 180))
                  const isHovered = hoveredDay?.date === day.date

                  return (
                    <div
                      key={day.date}
                      className="group relative flex-1 flex flex-col items-center justify-end h-full cursor-pointer"
                      onMouseEnter={() => setHoveredDay(day)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute -top-16 z-20 whitespace-nowrap rounded-lg bg-popover border border-border px-3 py-1.5 text-xs shadow-xl animate-in fade-in zoom-in-95">
                          <p className="font-semibold text-foreground">{day.label}</p>
                          <div className="flex gap-3 text-[11px] mt-0.5">
                            <span className="text-primary font-medium">Sent: {day.sent}</span>
                            <span className="text-sky-400 font-medium">Inbound: {day.incoming}</span>
                          </div>
                        </div>
                      )}

                      {/* Bar columns */}
                      <div className="w-full flex items-end justify-center gap-1 max-w-[28px]">
                        <div
                          style={{ height: `${sentHeight}px` }}
                          className={`w-1/2 rounded-t transition-all ${
                            day.sent > 0 ? "bg-primary group-hover:brightness-125" : "bg-muted"
                          }`}
                        />
                        <div
                          style={{ height: `${incomingHeight}px` }}
                          className={`w-1/2 rounded-t transition-all ${
                            day.incoming > 0 ? "bg-sky-500 group-hover:brightness-125" : "bg-muted"
                          }`}
                        />
                      </div>

                      <span className="text-[10px] text-muted-foreground mt-2 truncate w-full text-center">
                        {day.label}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>0 messages</span>
                <span className="font-mono">Peak: {maxDaily} msgs/day</span>
              </div>
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-secondary mb-3">
                <BarChart3 className="size-5 text-muted-foreground" />
              </span>
              <h3 className="text-sm font-semibold text-foreground">Ready to track activity</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                As your Instagram followers reply to stories or comment on reels, your daily trends will appear here.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Two Columns: Trigger Distribution + Active Workflows */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trigger Distribution */}
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Trigger Sources</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Automations distribution by entry point</p>
            </div>
            <Sparkles className="size-4 text-primary" />
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-foreground">Post & Reel Comments</span>
                <span className="text-muted-foreground font-mono">
                  {data?.triggerBreakdown?.comment || 0} rules ({commentPct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div style={{ width: `${commentPct}%` }} className="h-full bg-amber-500 rounded-full transition-all duration-500" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-foreground">Story Replies & Mentions</span>
                <span className="text-muted-foreground font-mono">
                  {data?.triggerBreakdown?.story || 0} rules ({storyPct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div style={{ width: `${storyPct}%` }} className="h-full bg-rose-500 rounded-full transition-all duration-500" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-foreground">Direct Messages & Keywords</span>
                <span className="text-muted-foreground font-mono">
                  {data?.triggerBreakdown?.dm || 0} rules ({dmPct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                <div style={{ width: `${dmPct}%` }} className="h-full bg-sky-500 rounded-full transition-all duration-500" />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Rules Configured:</span>
            <span className="font-semibold text-foreground">{data?.automationsCount || 0} workflows</span>
          </div>
        </section>

        {/* Live Workflows Overview */}
        <section className="rounded-2xl border border-border bg-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">Active Workflows</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Automations actively responding to users</p>
              </div>
              <Link href="/dashboard/automations" className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                View all <ArrowRight className="size-3" />
              </Link>
            </div>

            <div className="mt-4 divide-y divide-border">
              {data?.automations && data.automations.length > 0 ? (
                data.automations.slice(0, 4).map((auto) => (
                  <div key={auto.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{auto.name}</p>
                        {auto.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            Paused
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        Trigger: <span className="text-foreground font-mono">{auto.trigger_value}</span> · {auto.trigger_source}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No workflows created yet.
                </div>
              )}
            </div>
          </div>

          <Link
            href="/dashboard/automations"
            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-2 text-xs font-semibold text-foreground hover:bg-accent transition-all"
          >
            Create New Automation
            <ArrowUpRight className="size-3.5" />
          </Link>
        </section>
      </div>

      {/* Recent Activity Feed */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Recent Interactions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Automated replies delivered to followers</p>
          </div>
          <Link href="/dashboard/inbox" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
            Open Inbox <ArrowRight className="size-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-border">
          {data?.recentActivity && data.recentActivity.length > 0 ? (
            data.recentActivity.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/30 transition-colors">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Send className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">
                    @{item.recipient?.recipient_username || "instagram_user"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.content}</p>
                </div>
                <time className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {new Date(item.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No recent automated messages yet.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  highlight,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  description: string
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4.5 transition-all ${
        highlight
          ? "border-primary/40 bg-primary/5 shadow-sm"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className={`flex size-7 items-center justify-center rounded-lg ${
            highlight ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
          }`}
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      <p className="mt-2.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground truncate">{description}</p>
    </div>
  )
}
