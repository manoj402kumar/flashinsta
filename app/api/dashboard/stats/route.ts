import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId")
    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetUserId = session.userId
    const admin = getSupabaseAdmin()

    // 1. Fetch automations for this user ONLY
    const { data: automationsList } = await admin
      .from("automations")
      .select("id, name, trigger_source, trigger_type, trigger_value, is_active, created_at, response_content")
      .eq("user_id", targetUserId)

    const automationsCount = automationsList?.length || 0
    const activeCount = automationsList?.filter((a: any) => a.is_active)?.length || 0

    // Trigger distribution breakdown
    const triggerBreakdown = {
      comment: automationsList?.filter((a: any) => a.trigger_source === "comment")?.length || 0,
      story: automationsList?.filter((a: any) => a.trigger_source === "story")?.length || 0,
      dm: automationsList?.filter((a: any) => a.trigger_source === "dm" || !a.trigger_source)?.length || 0,
    }

    // 2. Fetch conversations for this user ONLY
    const { data: conversationsList } = await admin
      .from("conversations")
      .select("id, recipient_id, recipient_username, last_message_at, created_at")
      .eq("user_id", targetUserId)
      .order("last_message_at", { ascending: false })

    const audienceCount = conversationsList?.length || 0

    // 3. Fetch recent messages for this user ONLY
    const { data: messagesList } = await admin
      .from("messages")
      .select("id, content, created_at, is_from_instagram, conversation_id, sender_username")
      .eq("user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(300)

    const sentCount = messagesList?.filter((m: any) => m.is_from_instagram === false)?.length || 0
    const incomingCount = messagesList?.filter((m: any) => m.is_from_instagram === true)?.length || 0

    const responseRate = incomingCount > 0 ? Math.min(100, Math.round((sentCount / incomingCount) * 100)) : 100

    // 4. Fetch webhook reply events for this user ONLY
    const { data: webhookEvents } = await admin
      .from("webhook_events")
      .select("id, event_type, created_at")
      .eq("user_id", targetUserId)
      .limit(500)

    const totalRepliesSent = (webhookEvents?.length || 0) + sentCount

    // 5. Build 7-day trend
    const dayMap = new Map<string, { comments: number; dms: number; total: number }>()
    const days: string[] = []

    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString("en-US", { weekday: "short" })
      days.push(dateStr)
      dayMap.set(dateStr, { comments: 0, dms: 0, total: 0 })
    }

    if (messagesList) {
      for (const msg of messagesList) {
        if (!msg.created_at) continue
        const dateStr = msg.created_at.slice(0, 10)
        const entry = dayMap.get(dateStr)
        if (entry) {
          entry.dms += 1
          entry.total += 1
        }
      }
    }

    if (webhookEvents) {
      for (const ev of webhookEvents) {
        if (!ev.created_at) continue
        const dateStr = ev.created_at.slice(0, 10)
        const entry = dayMap.get(dateStr)
        if (entry) {
          entry.comments += 1
          entry.total += 1
        }
      }
    }

    const activityTrend = days.map((dateStr) => {
      const entry = dayMap.get(dateStr)!
      const d = new Date(dateStr)
      const name = d.toLocaleDateString("en-US", { weekday: "short" })
      return {
        name,
        date: dateStr,
        comments: entry.comments,
        dms: entry.dms,
        total: entry.total,
      }
    })

    // 6. Recent activities
    const recentActivities: any[] = []

    if (messagesList) {
      for (const msg of messagesList.slice(0, 10)) {
        recentActivities.push({
          id: `msg_${msg.id}`,
          type: msg.is_from_instagram ? "incoming_message" : "auto_reply",
          title: msg.is_from_instagram
            ? `DM received from @${msg.sender_username || "user"}`
            : `DM sent to @${msg.sender_username || "user"}`,
          description: msg.content ? (msg.content.length > 60 ? msg.content.slice(0, 60) + "..." : msg.content) : "Message",
          time: msg.created_at,
        })
      }
    }

    recentActivities.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

    return NextResponse.json({
      automationsCount,
      activeCount,
      audienceCount,
      messagesSent: totalRepliesSent,
      totalResponses: totalRepliesSent,
      responseRate,
      triggerBreakdown,
      activityTrend,
      recentActivities: recentActivities.slice(0, 8),
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load dashboard statistics")
  }
}
