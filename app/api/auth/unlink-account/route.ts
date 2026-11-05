import { type NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { unlinkAccount, getLinkedAccountIds, isAccountSwitchAllowed, extractAccountInfo } from "@/lib/account-links"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

async function disconnectAccountCredentials(admin: ReturnType<typeof getSupabaseAdmin>, targetId: string): Promise<void> {
  try {
    const { data: user } = await admin
      .from("users")
      .select("id, access_token, ai_context")
      .eq("id", targetId)
      .maybeSingle()

    if (!user) return

    let parsedContext: Record<string, any> = {}
    try {
      if (user.ai_context) parsedContext = JSON.parse(user.ai_context)
    } catch {}

    const tokensToRevoke: string[] = []
    if (user.access_token && user.access_token.startsWith("EAA")) {
      tokensToRevoke.push(user.access_token)
    }
    if (parsedContext._instagram?.userAccessToken?.startsWith("EAA")) {
      tokensToRevoke.push(parsedContext._instagram.userAccessToken)
    }
    if (parsedContext._instagram?.accessToken?.startsWith("EAA")) {
      tokensToRevoke.push(parsedContext._instagram.accessToken)
    }

    const appId = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    const appToken = appId && appSecret ? `${appId}|${appSecret}` : null

    for (const tok of tokensToRevoke) {
      await fetch(`https://graph.facebook.com/v24.0/me/permissions?access_token=${encodeURIComponent(tok)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(3000),
      }).catch(() => null)

      if (appToken && appId && appSecret) {
        await fetch(
          `https://graph.facebook.com/v24.0/oauth/revoke?client_id=${appId}&client_secret=${appSecret}&revoke_token=${encodeURIComponent(tok)}&access_token=${encodeURIComponent(appToken)}`,
          { signal: AbortSignal.timeout(3000) }
        ).catch(() => null)
      }
    }

    delete parsedContext._instagram
    delete parsedContext.business_name

    await admin
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
      .eq("id", targetId)
  } catch (err) {
    console.warn(`[Unlink Account] Error disconnecting credentials for ${targetId}:`, err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{ targetUserId?: string }>(request)
    if (errorResponse) return errorResponse

    const targetUserId = body?.targetUserId ? String(body.targetUserId).trim() : null
    if (!targetUserId) {
      return NextResponse.json({ error: "Missing targetUserId parameter" }, { status: 400 })
    }

    const strCurrentUserId = String(session.userId)
    const admin = getSupabaseAdmin()

    // Case 1: Removing the CURRENT active account from the switcher
    if (targetUserId === strCurrentUserId) {
      const cluster = await getLinkedAccountIds(strCurrentUserId)
      const remaining = cluster.filter((id) => id !== strCurrentUserId)

      if (remaining.length === 0) {
        return NextResponse.json(
          { error: "Cannot remove the only active account. To disconnect this account, click 'Disconnect Account'." },
          { status: 400 }
        )
      }

      const nextUserId = remaining[0]
      const { data: nextUser, error: userError } = await admin
        .from("users")
        .select("id, username, access_token, business_account_id, page_id, ai_context")
        .eq("id", nextUserId)
        .maybeSingle()

      if (userError || !nextUser) {
        return NextResponse.json(
          { error: "Failed to switch to alternative linked account." },
          { status: 500 }
        )
      }

      const nextInfo = extractAccountInfo(nextUser)

      // 1. Revoke credentials and wipe Instagram tokens for the removed account
      await disconnectAccountCredentials(admin, strCurrentUserId)

      // 2. Unlink current account from the cluster
      await unlinkAccount(strCurrentUserId, strCurrentUserId)

      const response = NextResponse.json({
        success: true,
        message: `Account disconnected and removed. Switched active session to @${nextInfo.username}`,
        unlinkedUserId: strCurrentUserId,
        switchedToUserId: nextInfo.userId,
      })

      // 3. Switch active session to the remaining account (preserving overarching master email)
      setSessionCookie(response, {
        userId: nextInfo.userId,
        username: nextInfo.username,
        email: session.email || undefined,
        profilePic: nextInfo.profilePic || undefined,
      })

      return response
    }

    // Case 2: Removing a secondary linked account
    const isAllowed = await isAccountSwitchAllowed(strCurrentUserId, targetUserId)
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Target account is not linked to your current session." },
        { status: 403 }
      )
    }

    // 1. Revoke credentials and wipe Instagram tokens on Meta and Supabase
    await disconnectAccountCredentials(admin, targetUserId)

    // 2. Unlink from cluster
    await unlinkAccount(strCurrentUserId, targetUserId)

    return NextResponse.json({
      success: true,
      message: "Account disconnected and removed successfully",
      unlinkedUserId: targetUserId,
      switchedToUserId: null,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to unlink account")
  }
}
