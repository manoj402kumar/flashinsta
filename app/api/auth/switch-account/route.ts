import { type NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAccountSwitchAllowed, extractAccountInfo } from "@/lib/account-links"
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
      .select("id, username, access_token, business_account_id, page_id, ai_context")
      .eq("id", targetUserId)
      .maybeSingle()

    if (userError || !targetUser) {
      return NextResponse.json(
        { error: "The requested account was not found in the database." },
        { status: 404 }
      )
    }

    // 3. Extract verified account details (never leaking raw secrets)
    const info = extractAccountInfo(targetUser)

    const response = NextResponse.json({
      success: true,
      userId: info.userId,
      username: info.username,
      profilePic: info.profilePic,
      isIgConnected: info.isIgConnected,
      igUsername: info.igUsername,
      businessAccountId: info.businessAccountId,
      message: `Switched to @${info.username}`,
    })

    // 4. Update the cryptographic session cookie to the new account (preserving login email)
    setSessionCookie(response, {
      userId: info.userId,
      username: info.username,
      email: session.email || undefined,
      profilePic: info.profilePic || undefined,
    })

    return response
  } catch (error) {
    return safeErrorResponse(error, "Failed to switch accounts")
  }
}
