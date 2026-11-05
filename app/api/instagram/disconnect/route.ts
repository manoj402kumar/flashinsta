import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{ userId?: string }>(request)
    if (errorResponse) return errorResponse

    const { userId } = body || {}
    if (userId && String(userId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetUserId = session.userId
    const admin = getSupabaseAdmin()

    // 1. Fetch user credentials before wiping
    const { data: user, error: userErr } = await admin
      .from("users")
      .select("id, username, access_token, business_account_id, page_id, ai_context")
      .eq("id", targetUserId)
      .maybeSingle()

    if (userErr || !user) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 })
    }

    // 2. Extract tokens to revoke on Meta Graph API
    let parsedContext: Record<string, any> = {}
    try {
      if (user.ai_context) parsedContext = JSON.parse(user.ai_context)
    } catch {}

    const tokensToRevoke: string[] = []
    if (user.access_token && user.access_token.startsWith("EAA")) {
      tokensToRevoke.push(user.access_token)
    }
    if (parsedContext._instagram?.userAccessToken && parsedContext._instagram.userAccessToken.startsWith("EAA")) {
      if (!tokensToRevoke.includes(parsedContext._instagram.userAccessToken)) {
        tokensToRevoke.push(parsedContext._instagram.userAccessToken)
      }
    }
    if (parsedContext._instagram?.accessToken && parsedContext._instagram.accessToken.startsWith("EAA")) {
      if (!tokensToRevoke.includes(parsedContext._instagram.accessToken)) {
        tokensToRevoke.push(parsedContext._instagram.accessToken)
      }
    }

    // 3. Revoke permissions on Meta servers (kills tokens remotely so they can never be reused)
    const appId = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    const appToken = appId && appSecret ? `${appId}|${appSecret}` : null

    for (const tok of tokensToRevoke) {
      try {
        // Meta endpoint 1: DELETE /me/permissions
        await fetch(`https://graph.facebook.com/v24.0/me/permissions?access_token=${encodeURIComponent(tok)}`, {
          method: "DELETE",
          signal: AbortSignal.timeout(4000),
        }).catch(() => null)

        // Meta endpoint 2: /oauth/revoke if app credentials available
        if (appToken && appId && appSecret) {
          await fetch(
            `https://graph.facebook.com/v24.0/oauth/revoke?client_id=${appId}&client_secret=${appSecret}&revoke_token=${encodeURIComponent(tok)}&access_token=${encodeURIComponent(appToken)}`,
            { signal: AbortSignal.timeout(4000) }
          ).catch(() => null)
        }
      } catch (err) {
        console.warn("[Disconnect IG] Error revoking token on Meta:", err)
      }
    }

    // 4. Complete deletion of passkeys and credentials from database
    delete parsedContext._instagram
    delete parsedContext.business_name

    const { error: updateError } = await admin
      .from("users")
      .update({
        access_token: "",
        business_account_id: null,
        page_id: null,
        token_expires_at: null,
        groq_auto_reply_enabled: false,
        ai_context: JSON.stringify(parsedContext),
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId)

    if (updateError) {
      console.error("[Disconnect IG] Failed to wipe user credentials:", updateError)
      return NextResponse.json({ error: "Failed to purge database passkeys." }, { status: 500 })
    }

    // 5. Halt / Stop all automations for this user while preserving their setup data
    const { data: pausedAutomations, error: autoError } = await admin
      .from("automations")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", targetUserId)
      .select("id")

    if (autoError) {
      console.warn("[Disconnect IG] Warning: Could not pause automations:", autoError)
    }

    const pausedCount = pausedAutomations?.length || 0
    console.log(`[Disconnect IG] Security Kill-Switch: Purged passkeys for user ${targetUserId}, paused ${pausedCount} automations, revoked on Meta.`)

    // 6. Update session cookie to reflect disconnected state immediately
    const response = NextResponse.json({
      success: true,
      message: `Instagram account and passkeys securely deleted from database. ${pausedCount} automations have been stopped.`,
      pausedCount,
    })

    setSessionCookie(response, {
      userId: String(targetUserId),
      username: user.username,
      profilePic: undefined,
    })

    return response
  } catch (error) {
    return safeErrorResponse(error, "Failed to disconnect account.")
  }
}
