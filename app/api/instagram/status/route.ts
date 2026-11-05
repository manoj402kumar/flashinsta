import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

function isTokenValidInstagramFormat(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false // Google OAuth token
  return token.length > 20
}

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

    // 2. Check if this specific user has an Instagram token
    let hasIgToken = isTokenValidInstagramFormat(user.access_token)
    let effectiveToken = user.access_token || ""

    if (!hasIgToken && user.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        const savedToken =
          parsed._instagram?.accessToken ||
          parsed._instagram?.pageAccessToken ||
          parsed._instagram?.userAccessToken
        if (savedToken && isTokenValidInstagramFormat(savedToken)) {
          hasIgToken = true
          effectiveToken = savedToken
        }
      } catch {}
    }

    // If no Instagram token on this user, return disconnected state immediately
    if (!hasIgToken) {
      const emptyRes = {
        connected: false,
        username: user.username,
        instagramUsername: null,
        businessAccountId: null,
        expiresAt: null,
        message: "No Instagram account connected",
      }
      statusCache.set(session.userId, { data: emptyRes, timestamp: Date.now() })
      return NextResponse.json(emptyRes)
    }

    // Parse Instagram metadata stored in this user's ai_context
    let igUsername: string | null = null
    let profilePic: string | null = null
    let businessAccountId: string | null = user.business_account_id ? String(user.business_account_id) : null

    try {
      if (user.ai_context) {
        const parsed = JSON.parse(user.ai_context)
        if (parsed._instagram?.username) igUsername = parsed._instagram.username
        if (parsed._instagram?.profilePic) profilePic = parsed._instagram.profilePic
        if (parsed._instagram?.businessAccountId && !businessAccountId) {
          businessAccountId = String(parsed._instagram.businessAccountId)
        }
      }
    } catch {}

    const isExpired = user.token_expires_at
      ? new Date(user.token_expires_at).getTime() < Date.now()
      : false

    // Auto-fetch profile picture or username if missing from DB cache
    if (hasIgToken && (!profilePic || !igUsername) && effectiveToken) {
      try {
        const isFb = effectiveToken.startsWith("EAA")
        const targetId = (businessAccountId && !businessAccountId.startsWith("1015"))
          ? businessAccountId
          : (user.page_id || businessAccountId)

        if (isFb && targetId) {
          const testUrl = `https://graph.facebook.com/v24.0/${targetId}?fields=id,username,name,profile_picture_url,instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(effectiveToken)}`
          const res = await fetch(testUrl, { signal: AbortSignal.timeout(5000) })
          const data = await res.json()
          if (data && !data.error) {
            const igAcc = data.instagram_business_account || data
            if (igAcc.id) businessAccountId = String(igAcc.id)
            if (igAcc.username) igUsername = igAcc.username
            if (igAcc.profile_picture_url) profilePic = igAcc.profile_picture_url

            // Persist back to user record asynchronously
            let existingCtx: any = {}
            try { if (user.ai_context) existingCtx = JSON.parse(user.ai_context) } catch {}
            const newCtx = {
              ...existingCtx,
              business_name: igUsername || existingCtx.business_name || "Creator",
              _instagram: {
                ...(existingCtx._instagram || {}),
                username: igUsername || existingCtx._instagram?.username,
                profilePic: profilePic || existingCtx._instagram?.profilePic,
                businessAccountId: businessAccountId || existingCtx._instagram?.businessAccountId,
              },
            }
            void admin.from("users").update({
              username: igUsername || user.username,
              business_account_id: businessAccountId || user.business_account_id,
              ai_context: JSON.stringify(newCtx),
              updated_at: new Date().toISOString(),
            }).eq("id", user.id)
          }
        } else {
          const testUrl = `https://graph.instagram.com/v24.0/me?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(effectiveToken)}`
          const res = await fetch(testUrl, { signal: AbortSignal.timeout(5000) })
          const data = await res.json()
          if (data && !data.error) {
            if (data.username) igUsername = data.username
            if (data.profile_picture_url) profilePic = data.profile_picture_url
          }
        }
      } catch (err) {
        console.warn("[Instagram Status] Auto-fetch profile picture failed:", err)
      }
    }

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
      instagramUsername: hasValidInstagramId ? igUsername : null,
      businessAccountId: hasValidInstagramId ? businessAccountId : null,
      pageId: user.page_id,
      expiresAt: user.token_expires_at,
      isExpired,
      isValid: hasValidInstagramId && liveValid,
      error: !hasValidInstagramId && isFb
        ? "No Instagram Business account linked to this token. Please connect an Instagram Professional account."
        : liveError,
      profilePic: hasValidInstagramId ? profilePic : null,
    }

    statusCache.set(session.userId, { data: result, timestamp: Date.now() })
    return NextResponse.json(result)
  } catch (error) {
    return safeErrorResponse(error, "Failed to get Instagram status")
  }
}
