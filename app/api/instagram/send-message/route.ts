import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"
import { isMetaThrottled, recordMetaApiResponse } from "@/lib/meta-rate-limit"
import { isRecipientOptedOut } from "@/lib/opt-out"

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{
      user_id?: string
      recipient_id?: string
      message?: string
    }>(request)
    if (errorResponse) return errorResponse

    const { user_id, recipient_id, message } = body || {}

    if (user_id && String(user_id) !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!recipient_id || !message) {
      return NextResponse.json({ error: "Missing required fields: recipient_id, message" }, { status: 400 })
    }

    // Strictly enforce Meta & DPDP / GDPR Opt-Out compliance
    const isOptedOut = await isRecipientOptedOut(session.userId, recipient_id)
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

    // Get user's access token strictly for the authenticated session
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("access_token, username, ai_context, business_account_id")
      .eq("id", session.userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    let token = user.access_token
    let businessAccountId = user.business_account_id

    if ((!token || token.startsWith("ya29.") || token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") && user.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        token = parsed._instagram?.accessToken || parsed._instagram?.userAccessToken || token
        if (!businessAccountId) businessAccountId = parsed._instagram?.businessAccountId
      } catch {}
    }

    if (!token || token.startsWith("ya29.") || token === "TEST_TOKEN_NOT_REAL") {
      return NextResponse.json({ error: "No active Instagram connection found" }, { status: 400 })
    }

    // Check Meta BUC Rate Limit Circuit Breaker (Section 5.B)
    const throttleStatus = isMetaThrottled(businessAccountId)
    if (throttleStatus.throttled) {
      return NextResponse.json(
        { error: `Meta API rate limit circuit breaker active (${throttleStatus.waitSeconds}s remaining).` },
        { status: 429, headers: { "Retry-After": String(throttleStatus.waitSeconds) } },
      )
    }

    // Send message via Instagram API (supports both User Access Tokens and Page Access Tokens)
    const baseGraph = token.startsWith("EAA")
      ? "https://graph.facebook.com/v24.0"
      : "https://graph.instagram.com/v24.0"

    const endpointsToTry = businessAccountId
      ? [`${baseGraph}/${businessAccountId}/messages`, `${baseGraph}/me/messages`]
      : [`${baseGraph}/me/messages`]

    let data: any = null
    let sendOk = false

    for (const sendUrl of endpointsToTry) {
      const response = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipient_id.toString() },
          message: { text: String(message).slice(0, 1000) },
        }),
        signal: AbortSignal.timeout(15000),
      })
      data = await response.json().catch(() => ({}))
      recordMetaApiResponse(response.headers, response.status, businessAccountId, data?.error)
      if (response.ok && !data.error) {
        sendOk = true
        break
      }
    }

    if (!sendOk) {
      return NextResponse.json({ error: data?.error?.message || "Failed to send message via Instagram" }, { status: 502 })
    }

    // Store the sent message in database
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", session.userId)
      .eq("recipient_id", recipient_id)
      .maybeSingle()

    if (conversation) {
      await supabase.from("messages").insert({
        id: data.message_id || `mid_${Date.now()}`,
        conversation_id: conversation.id,
        user_id: session.userId,
        sender_id: user.business_account_id || user.username || String(session.userId),
        sender_username: user.username || "me",
        content: String(message).slice(0, 1000),
        is_from_instagram: false,
      })
    }

    return NextResponse.json({ success: true, message_id: data.message_id })
  } catch (error) {
    return safeErrorResponse(error, "Failed to send Instagram message")
  }
}
