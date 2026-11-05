import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAuthorizedAdmin } from "@/lib/admin-auth"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const { searchParams } = request.nextUrl
    const eventType = searchParams.get("type")
    const userId = searchParams.get("userId")
    const query = searchParams.get("q")?.toLowerCase() || ""
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    let dbQuery = admin
      .from("webhook_events")
      .select("id, event_type, user_id, data, processed_at", { count: "exact" })
      .order("processed_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (eventType && eventType !== "all") {
      dbQuery = dbQuery.eq("event_type", eventType)
    }

    if (userId) {
      dbQuery = dbQuery.eq("user_id", userId)
    }

    const { data: events, error, count } = await dbQuery

    if (error) throw error

    // Fetch user mapping to display readable usernames
    const userIds = Array.from(new Set((events || []).map((e) => e.user_id).filter(Boolean)))
    let userMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, username")
        .in("id", userIds)

      users?.forEach((u) => {
        userMap[String(u.id)] = u.username
      })
    }

    // Format and enrich events
    let items = (events || []).map((ev) => {
      const d = ev.data || {}
      return {
        id: ev.id,
        eventType: ev.event_type,
        userId: ev.user_id ? String(ev.user_id) : null,
        username: ev.user_id ? (userMap[String(ev.user_id)] || `User #${ev.user_id}`) : "System",
        commenter: d.commenter || d.sender_id || d.sender || null,
        commentText: d.text || d.message || null,
        mediaId: d.media_id || null,
        commentReplied: Boolean(d.commentReplied),
        dmSent: Boolean(d.dmSent),
        error: d.error || null,
        payload: d,
        processedAt: ev.processed_at,
      }
    })

    if (query) {
      items = items.filter(
        (it) =>
          it.eventType.toLowerCase().includes(query) ||
          (it.commenter && it.commenter.toLowerCase().includes(query)) ||
          (it.commentText && it.commentText.toLowerCase().includes(query)) ||
          (it.username && it.username.toLowerCase().includes(query)) ||
          (it.userId && it.userId.includes(query))
      )
    }

    return NextResponse.json({
      success: true,
      events: items,
      totalCount: count ?? items.length,
      limit,
      offset,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load webhook events")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const eventId = searchParams.get("id")
    const olderThanDays = searchParams.get("olderThanDays")

    const admin = getSupabaseAdmin()

    if (eventId) {
      const { error } = await admin.from("webhook_events").delete().eq("id", eventId)
      if (error) throw error
      return NextResponse.json({ success: true, message: `Event ${eventId} deleted` })
    }

    if (olderThanDays) {
      const days = parseInt(olderThanDays, 10)
      if (days >= 7) {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
        const { error } = await admin.from("webhook_events").delete().lt("processed_at", cutoff)
        if (error) throw error
        return NextResponse.json({ success: true, message: `Cleared events older than ${days} days` })
      }
    }

    return NextResponse.json({ error: "Specify id or olderThanDays >= 7" }, { status: 400 })
  } catch (error) {
    return safeErrorResponse(error, "Failed to delete webhook event(s)")
  }
}
