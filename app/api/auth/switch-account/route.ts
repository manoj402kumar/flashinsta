import { type NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAccountSwitchAllowed, extractAccountInfo } from "@/lib/account-links"
import { formatIdentityHandle } from "@/lib/identity"
import { refreshInstagramProfileIfStale } from "@/lib/instagram-profile"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"
import type { SwitchAccountRequest } from "@/lib/types"

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<SwitchAccountRequest>(request)
    if (errorResponse) return errorResponse

    const targetUserId = body?.targetUserId ? String(body.targetUserId).trim() : null
    if (!targetUserId) {
      return NextResponse.json({ error: "Missing targetUserId parameter" }, { status: 400 })
    }

    // 1. Strict Security Check: Verify target account is owned by the exact same Google account
    const isAllowed = await isAccountSwitchAllowed(session.userId, targetUserId, session.email)
    if (!isAllowed) {
      return NextResponse.json(
        { error: "Access denied: Account is not linked to your Google account." },
        { status: 403 }
      )
    }

    // 2. Fetch the target account record
    const admin = getSupabaseAdmin()
    const { data: targetUser, error: userError } = await admin
      .from("users")
      .select("id, username, access_token, token_expires_at, business_account_id, page_id, ai_context")
      .eq("id", targetUserId)
      .maybeSingle()

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: "The requested account was not found in the database." },
        { status: 404 }
      )
    }

    // 3. Extract verified account details (never leaking raw secrets)
    const refreshed = await refreshInstagramProfileIfStale(targetUser)
    const info = extractAccountInfo({
      ...targetUser,
      ai_context: refreshed.aiContext,
      business_account_id: refreshed.businessAccountId ?? targetUser.business_account_id,
    })

    // 4. Update the cryptographic session cookie to the new account (preserving login email)
    const newSessionData = {
      userId: info.userId,
      username: info.username,
      email: session.email || undefined,
      profilePic: info.profilePic || undefined,
    }

    const response = NextResponse.json({
      success: true,
      userId: info.userId,
      username: info.username,
      profilePic: info.profilePic,
      isIgConnected: info.isIgConnected,
      igUsername: info.igUsername,
      businessAccountId: info.businessAccountId,
      message: `Switched to ${formatIdentityHandle(info.username)}`,
    })

    const token = setSessionCookie(response, newSessionData)

    return NextResponse.json({
      success: true,
      token,
      userId: info.userId,
      username: info.username,
      profilePic: info.profilePic,
      isIgConnected: info.isIgConnected,
      igUsername: info.igUsername,
      businessAccountId: info.businessAccountId,
      message: `Switched to ${formatIdentityHandle(info.username)}`,
    }, {
      headers: response.headers,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to switch accounts")
  }
}
