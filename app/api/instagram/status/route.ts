import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { getInstagramToken, resolveIdentity } from "@/lib/identity"
import { refreshInstagramProfileIfStale } from "@/lib/instagram-profile"
import { safeErrorResponse } from "@/lib/security"

// In-memory status cache (10s) per user
const statusCache = new Map<string, { data: any; timestamp: number }>()
const STATUS_CACHE_TTL = 10 * 1000

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ connected: false, error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const validateLive = searchParams.get("validate") === "true"
    const requestedUserId = searchParams.get("userId")

    // Security: users cannot query other users' Instagram status
    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ connected: false, error: "Forbidden" }, { status: 403 })
    }

    // Return from in-memory cache if valid and not explicitly validating live
    if (!validateLive) {
      const cached = statusCache.get(session.userId)
      if (cached && Date.now() - cached.timestamp < STATUS_CACHE_TTL) {
        return NextResponse.json(cached.data)
      }
    }

    const admin = getSupabaseAdmin()

    // 1. Fetch authenticated user record ONLY
    const { data: user, error: userError } = await admin
      .from("users")
      .select("id, username, access_token, business_account_id, page_id, token_expires_at, ai_context")
      .eq("id", session.userId)
      .maybeSingle()

    if (userError || !user) {
      return NextResponse.json({ connected: false, error: "User not found" }, { status: 404 })
    }

    // 2. Refresh stale Instagram profile data before resolving identity.
    const refreshed = await refreshInstagramProfileIfStale(user)
    const profileRow = {
      ...user,
      ai_context: refreshed.aiContext,
      business_account_id: refreshed.businessAccountId ?? user.business_account_id,
    }
    const identity = resolveIdentity(profileRow)
    const effectiveToken = getInstagramToken(profileRow)

    // If no Instagram token on this user, return disconnected state immediately
    if (!effectiveToken) {
      const emptyRes = {
        connected: false,
        username: identity.username,
        email: identity.email,
        profilePic: identity.googleProfilePic,
        instagramUsername: null,
        businessAccountId: null,
        expiresAt: null,
        message: "No Instagram account connected",
      }
      statusCache.delete(session.userId)
      return NextResponse.json(emptyRes)
    }

    // 3. Serve the refreshed snapshot.
    let igUsername: string | null = identity.igUsername
    let profilePic: string | null = identity.isIgConnected ? identity.profilePic : null
    let businessAccountId: string | null = identity.businessAccountId

    const isExpired = user.token_expires_at
      ? new Date(user.token_expires_at).getTime() < Date.now()
      : false

    let liveValid = true
    let liveError: string | null = null

    if (validateLive) {
      try {
        const isFb = effectiveToken.startsWith("EAA")
        const testUrl = isFb && businessAccountId
          ? `https://graph.facebook.com/v24.0/${businessAccountId}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(effectiveToken)}`
          : `https://graph.instagram.com/v24.0/me?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(effectiveToken)}`
        const testRes = await fetch(testUrl, { signal: AbortSignal.timeout(4000) })
        const testData = await testRes.json()
        if (!testRes.ok || testData.error) {
          liveValid = false
          liveError = testData.error?.message || "Token verification failed with Instagram"
        } else {
          if (testData.username && !igUsername) igUsername = testData.username
          if (testData.profile_picture_url && !profilePic) profilePic = testData.profile_picture_url
        }
      } catch (err: any) {
        liveValid = false
        liveError = err.message
      }
    }

    const isFb = effectiveToken.startsWith("EAA")
    // For Facebook/Meta tokens, a valid connected state strictly requires an Instagram Business Account ID (starts with 1784).
    // A Facebook User ID is NOT an Instagram account.
    const hasValidInstagramId = isFb ? Boolean(businessAccountId && businessAccountId.startsWith("1784")) : true

    const isConnected = !isExpired && hasValidInstagramId && (validateLive ? liveValid : true)

    const result = {
      connected: isConnected,
      username: isConnected ? (igUsername || identity.username) : identity.username,
      email: identity.email,
      instagramUsername: isConnected ? igUsername : null,
      businessAccountId: isConnected ? businessAccountId : null,
      pageId: user.page_id,
      expiresAt: user.token_expires_at,
      isExpired,
      isValid: hasValidInstagramId && liveValid,
      error: !hasValidInstagramId && isFb
        ? "No Instagram Business account linked to this token. Please connect an Instagram Professional account."
        : liveError,
      profilePic: isConnected ? profilePic : identity.googleProfilePic,
    }

    if (isConnected) {
      statusCache.set(session.userId, { data: result, timestamp: Date.now() })
    } else {
      statusCache.delete(session.userId)
    }
    return NextResponse.json(result)
  } catch (error) {
    return safeErrorResponse(error, "Failed to get Instagram status")
  }
}
