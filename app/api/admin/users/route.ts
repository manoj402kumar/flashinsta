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
    const { searchParams } = request.nextUrl
    const query = searchParams.get("q")?.toLowerCase() || ""
    const filter = searchParams.get("filter") || "all" // all, connected, expired, groq

    const now = new Date()

    // 1. Fetch users
    const { data: users, error: usersError } = await admin
      .from("users")
      .select("*")
      .order("created_at", { ascending: false })

    if (usersError) throw usersError

    // 2. Fetch automations counts
    const { data: automations } = await admin
      .from("automations")
      .select("id, user_id, is_active")

    // 3. Fetch conversations counts
    const { data: conversations } = await admin
      .from("conversations")
      .select("id, user_id")

    // 4. Fetch messages counts
    const { data: messages } = await admin
      .from("messages")
      .select("id, user_id, is_from_instagram")

    const automationsCountMap = new Map<string, { total: number; active: number }>()
    automations?.forEach((a) => {
      const uid = String(a.user_id)
      const current = automationsCountMap.get(uid) || { total: 0, active: 0 }
      current.total++
      if (a.is_active) current.active++
      automationsCountMap.set(uid, current)
    })

    const conversationsCountMap = new Map<string, number>()
    conversations?.forEach((c) => {
      const uid = String(c.user_id)
      conversationsCountMap.set(uid, (conversationsCountMap.get(uid) || 0) + 1)
    })

    const messagesCountMap = new Map<string, { incoming: number; outgoing: number }>()
    messages?.forEach((m) => {
      const uid = String(m.user_id)
      const current = messagesCountMap.get(uid) || { incoming: 0, outgoing: 0 }
      if (m.is_from_instagram) current.incoming++
      else current.outgoing++
      messagesCountMap.set(uid, current)
    })

    const enrichedUsers = (users || []).map((u) => {
      const uid = String(u.id)
      let igUsername: string | null = null
      let igPageName: string | null = null
      let verifiedVia: string | null = null
      let hasIgToken = isValidInstagramToken(u.access_token)

      if (u.ai_context) {
        try {
          const parsed = JSON.parse(u.ai_context)
          if (parsed._instagram?.accessToken && isValidInstagramToken(parsed._instagram.accessToken)) {
            hasIgToken = true
          }
          igUsername = parsed._instagram?.username || null
          igPageName = parsed._instagram?.pageName || parsed.business_name || null
          verifiedVia = parsed._instagram?.verifiedVia || null
        } catch {}
      }

      let isExpired = false
      let daysUntilExpiry: number | null = null
      if (u.token_expires_at) {
        const exp = new Date(u.token_expires_at)
        const diffMs = exp.getTime() - now.getTime()
        daysUntilExpiry = Math.round(diffMs / (1000 * 60 * 60 * 24))
        isExpired = diffMs <= 0
      }

      const autoStats = automationsCountMap.get(uid) || { total: 0, active: 0 }
      const convCount = conversationsCountMap.get(uid) || 0
      const msgStats = messagesCountMap.get(uid) || { incoming: 0, outgoing: 0 }

      return {
        id: uid,
        username: u.username,
        igUsername,
        igPageName,
        verifiedVia,
        isIgConnected: hasIgToken,
        hasAccessToken: Boolean(u.access_token),
        tokenExpiresAt: u.token_expires_at,
        daysUntilExpiry,
        isExpired,
        businessAccountId: u.business_account_id ? String(u.business_account_id) : null,
        pageId: u.page_id,
        groqAutoReplyEnabled: Boolean(u.groq_auto_reply_enabled),
        hasCustomAiConfig: Boolean(u.groq_api_key || u.ai_model || u.ai_base_url),
        aiModel: u.ai_model || "llama-3.1-8b-instant",
        automations: autoStats,
        conversationsCount: convCount,
        messagesCount: msgStats,
        createdAt: u.created_at,
        updatedAt: u.updated_at,
      }
    })

    // Filter
    let filtered = enrichedUsers
    if (query) {
      filtered = filtered.filter(
        (u) =>
          u.username.toLowerCase().includes(query) ||
          (u.igUsername && u.igUsername.toLowerCase().includes(query)) ||
          u.id.includes(query) ||
          (u.businessAccountId && u.businessAccountId.includes(query))
      )
    }

    if (filter === "connected") {
      filtered = filtered.filter((u) => u.isIgConnected)
    } else if (filter === "expired") {
      filtered = filtered.filter((u) => u.isExpired)
    } else if (filter === "groq") {
      filtered = filtered.filter((u) => u.groqAutoReplyEnabled)
    }

    return NextResponse.json({
      success: true,
      users: filtered,
      total: enrichedUsers.length,
      filteredCount: filtered.length,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load admin user fleet")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { userId, updates } = body

    if (!userId || !updates) {
      return NextResponse.json({ error: "userId and updates are required" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const allowedKeys = ["groq_auto_reply_enabled", "ai_model", "token_expires_at"]
    const safeUpdates: Record<string, any> = {}

    for (const key of allowedKeys) {
      if (key in updates) {
        safeUpdates[key] = updates[key]
      }
    }
    safeUpdates.updated_at = new Date().toISOString()

    const { data, error } = await admin
      .from("users")
      .update(safeUpdates)
      .eq("id", userId)
      .select("id, username, groq_auto_reply_enabled")
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, user: data })
  } catch (error) {
    return safeErrorResponse(error, "Failed to update user")
  }
}
