import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"
import { isMetaThrottled, recordMetaApiResponse } from "@/lib/meta-rate-limit"
import { isRecipientOptedOut } from "@/lib/opt-out"

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{
      recipientId?: string
      message?: string
      attachment?: any
    }>(request)
    if (errorResponse) return errorResponse

    const { recipientId, message, attachment } = body || {}

    if (!recipientId || (!message && !attachment)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Strictly enforce Meta & DPDP / GDPR Opt-Out compliance
    const isOptedOut = await isRecipientOptedOut(session.userId, recipientId)
    if (isOptedOut) {
      return NextResponse.json(
        {
          error:
            "Outbound message blocked: This recipient has opted out of messaging (STOP/UNSUBSCRIBE). You cannot message this user until they reply START.",
        },
        { status: 403 }
      )
    }

    const supabase = await getSupabaseServerClient()

    // 1. Get User Access Token using authenticated session ID
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("access_token, username, business_account_id, ai_context")
      .eq("id", session.userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    let token = user.access_token
    if ((!token || token.startsWith("ya29.") || token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") && user.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        token = parsed._instagram?.accessToken || parsed._instagram?.userAccessToken || token
      } catch {}
    }

    if (!token || token === "TEST_TOKEN_NOT_REAL" || token.startsWith("ya29.")) {
      return NextResponse.json({ error: "No active Instagram connection found for this account" }, { status: 400 })
    }

    // 2. Prepare Payload for Instagram API
    const apiBody: any = { recipient: { id: String(recipientId).trim() } }

    if (message) {
      apiBody.message = { text: String(message).slice(0, 1000) }
    } else if (attachment) {
      apiBody.message = { attachment }
    }

    // Check Meta BUC Rate Limit Circuit Breaker (Section 5.B)
    const throttleStatus = isMetaThrottled(user.business_account_id)
    if (throttleStatus.throttled) {
      return NextResponse.json(
        { error: `Meta API rate limit circuit breaker active (${throttleStatus.waitSeconds}s remaining).` },
        { status: 429, headers: { "Retry-After": String(throttleStatus.waitSeconds) } },
      )
    }

    // 3. Send to Instagram Graph API (supports both User Access Tokens and Page Access Tokens)
    const baseGraph = token.startsWith("EAA")
      ? "https://graph.facebook.com/v24.0"
      : "https://graph.instagram.com/v24.0"

    const endpointsToTry = user.business_account_id
      ? [`${baseGraph}/${user.business_account_id}/messages`, `${baseGraph}/me/messages`]
      : [`${baseGraph}/me/messages`]

    let data: any = null
    let sendOk = false

    for (const endpoint of endpointsToTry) {
      const res = await fetch(`${endpoint}?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
        signal: AbortSignal.timeout(15000),
      })
      data = await res.json().catch(() => ({}))
      recordMetaApiResponse(res.headers, res.status, user.business_account_id, data?.error)
      if (res.ok && !data.error) {
        sendOk = true
        break
      }
    }

    if (!sendOk) {
      return NextResponse.json({ error: data?.error?.message || "Failed to deliver message via Instagram" }, { status: 502 })
    }

    // 4. Log to Database (Outbound Message)
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", session.userId)
      .eq("recipient_id", recipientId)
      .maybeSingle()

    if (conv) {
      await supabase.from("messages").insert({
        id: `mid_out_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        conversation_id: conv.id,
        user_id: session.userId,
        sender_id: user.business_account_id,
        sender_username: user.username,
        content: message ? String(message).slice(0, 1000) : "[Attachment]",
        is_from_instagram: false,
      })

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conv.id)
    }

    return NextResponse.json({ success: true, messageId: data.message_id || data.recipient_id })
  } catch (error) {
    return safeErrorResponse(error, "Failed to send message")
  }
}
