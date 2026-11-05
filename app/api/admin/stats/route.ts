import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAuthorizedAdmin } from "@/lib/admin-auth"
import { safeErrorResponse } from "@/lib/security"

function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const now = new Date()
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // 1. Fetch Users
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("id, username, access_token, token_expires_at, business_account_id, groq_auto_reply_enabled, created_at, ai_context")

    if (usersError) {
      console.error("[admin-stats] Users fetch error:", usersError)
    }

    const allUsers = users || []
    const totalUsers = allUsers.length
    let igConnectedCount = 0
    let expiringTokensCount = 0
    let expiredTokensCount = 0
    let groqEnabledCount = 0

    allUsers.forEach((u) => {
      let isConnected = isValidInstagramToken(u.access_token)
      if (u.ai_context) {
        try {
          const parsed = JSON.parse(u.ai_context)
          if (parsed._instagram?.accessToken && isValidInstagramToken(parsed._instagram.accessToken)) {
            isConnected = true
          }
        } catch {}
      }
      if (isConnected) igConnectedCount++
      if (u.groq_auto_reply_enabled) groqEnabledCount++

      if (u.token_expires_at) {
        const exp = new Date(u.token_expires_at)
        if (exp < now) {
          expiredTokensCount++
        } else if (exp <= fourteenDaysFromNow) {
          expiringTokensCount++
        }
      }
    })

    // 2. Fetch Automations
    const { data: automations } = await admin
      .from("automations")
      .select("id, trigger_source, is_active, trigger_type, user_id")

    const allAutomations = automations || []
    const totalAutomations = allAutomations.length
    const activeAutomations = allAutomations.filter((a) => a.is_active).length
    const pausedAutomations = totalAutomations - activeAutomations

    const automationSources = {
      comment: allAutomations.filter((a) => a.trigger_source === "comment").length,
      dm: allAutomations.filter((a) => a.trigger_source === "dm" || !a.trigger_source).length,
      story: allAutomations.filter((a) => a.trigger_source === "story").length,
    }

    // 3. Fetch Webhook Events
    const { data: webhookEvents, count: totalWebhooks } = await admin
      .from("webhook_events")
      .select("id, event_type, processed_at, user_id, data", { count: "exact" })
      .order("processed_at", { ascending: false })
      .limit(500)

    const allWebhooks = webhookEvents || []
    const webhooks24h = allWebhooks.filter(
      (w) => w.processed_at && new Date(w.processed_at).toISOString() >= twentyFourHoursAgo
    ).length

    // Event type breakdown
    const eventTypeCounts: Record<string, number> = {}
    allWebhooks.forEach((w) => {
      const type = w.event_type || "unknown"
      eventTypeCounts[type] = (eventTypeCounts[type] || 0) + 1
    })

    // 7-day trend
    const dayMap = new Map<string, { comments: number; messages: number; other: number; total: number }>()
    const days: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      days.push(dateStr)
      dayMap.set(dateStr, { comments: 0, messages: 0, other: 0, total: 0 })
    }

    allWebhooks.forEach((w) => {
      if (!w.processed_at) return
      const dateStr = w.processed_at.slice(0, 10)
      const bucket = dayMap.get(dateStr)
      if (bucket) {
        if (w.event_type?.includes("comment")) bucket.comments++
        else if (w.event_type?.includes("message") || w.event_type?.includes("dm")) bucket.messages++
        else bucket.other++
        bucket.total++
      }
    })

    const activityTimeline = days.map((dateStr) => {
      const b = dayMap.get(dateStr)!
      const d = new Date(dateStr)
      const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      return {
        date: dateStr,
        label,
        comments: b.comments,
        messages: b.messages,
        other: b.other,
        total: b.total,
      }
    })

    // 4. Fetch DM Queue
    const { data: dmQueue } = await admin
      .from("dm_queue")
      .select("id, status, attempts, send_at")

    const allDmQueue = dmQueue || []
    const dmQueueMetrics = {
      total: allDmQueue.length,
      pending: allDmQueue.filter((d) => d.status === "pending").length,
      sent: allDmQueue.filter((d) => d.status === "sent").length,
      failed: allDmQueue.filter((d) => d.status === "failed").length,
    }

    // 5. Fetch Reels Posts & Content Pool
    const { data: reelsPosts } = await admin
      .from("reels_posts")
      .select("id, status")

    const allReels = reelsPosts || []
    const reelsMetrics = {
      total: allReels.length,
      published: allReels.filter((r) => r.status === "PUBLISHED").length,
      pending: allReels.filter((r) => r.status === "PENDING").length,
      failed: allReels.filter((r) => r.status === "FAILED").length,
    }

    // 6. Recent Raw Activity Stream
    const recentEvents = allWebhooks.slice(0, 15).map((ev) => ({
      id: ev.id,
      eventType: ev.event_type,
      userId: ev.user_id,
      data: ev.data,
      processedAt: ev.processed_at,
    }))

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      users: {
        total: totalUsers,
        connected: igConnectedCount,
        expiringTokens: expiringTokensCount,
        expiredTokens: expiredTokensCount,
        groqEnabled: groqEnabledCount,
      },
      automations: {
        total: totalAutomations,
        active: activeAutomations,
        paused: pausedAutomations,
        sources: automationSources,
      },
      webhooks: {
        total: totalWebhooks ?? allWebhooks.length,
        past24h: webhooks24h,
        types: eventTypeCounts,
        timeline: activityTimeline,
      },
      dmQueue: dmQueueMetrics,
      reels: reelsMetrics,
      recentEvents,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load platform admin stats")
  }
}
