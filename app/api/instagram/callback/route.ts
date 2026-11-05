import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    const redirectUrl = new URL("/dashboard", request.url)
    redirectUrl.searchParams.set("ig_error", error)
    return NextResponse.redirect(redirectUrl)
  }

  if (code) {
    const redirectUrl = new URL("/dashboard", request.url)
    redirectUrl.searchParams.set("code", code)
    if (state) redirectUrl.searchParams.set("state", state)
    return NextResponse.redirect(redirectUrl)
  }

  return NextResponse.json({ error: "Invalid callback" }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, userId: explicitUserId } = body
    if (!code) return NextResponse.json({ error: "No code" }, { status: 400 })

    // Check if user is logged in via verified cookie session
    const session = getSessionFromRequest(request)
    const sessionUserId = session?.userId ? String(session.userId) : null

    // If both are provided, ensure caller cannot spoof another user's account
    if (explicitUserId && sessionUserId && String(explicitUserId) !== sessionUserId) {
      return NextResponse.json({ error: "Forbidden: Account ID mismatch" }, { status: 403 })
    }

    const targetUserId = sessionUserId || (explicitUserId ? String(explicitUserId) : null)

    // 1. Env Vars
    const clientId = process.env.INSTAGRAM_APP_ID
    const clientSecret = process.env.INSTAGRAM_APP_SECRET
    const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.warn("[Instagram Callback] Missing credentials in environment:", {
        INSTAGRAM_APP_ID: Boolean(clientId),
        INSTAGRAM_APP_SECRET: Boolean(clientSecret),
        NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI: Boolean(redirectUri),
      })
      return NextResponse.json(
        {
          error:
            "Instagram credentials not configured. Please set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, and NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI in .env.local",
        },
        { status: 500 }
      )
    }

    // 2. Exchange Code for Short Token
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    })

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) {
      if (tokenData.error_message?.includes("authorization code has been used")) {
        // Harmless double-fire from React StrictMode or double clicks
        return NextResponse.json({ error: "Code already used" }, { status: 400 })
      }
      console.error("[Instagram Callback] Token Error:", JSON.stringify(tokenData, null, 2))
      return NextResponse.json({ error: tokenData.error_description || "Token failed" }, { status: 400 })
    }

    const shortToken = tokenData.access_token
    const loginUserId = tokenData.user_id.toString()

    // 3. Exchange for Long Token (60 Days)
    const longLivedUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortToken}`
    const longRes = await fetch(longLivedUrl)
    const longData = await longRes.json()
    const accessToken = longData.access_token || shortToken
    const expiresIn = longData.expires_in || 5184000

    // 4. Get Username + IG Professional Account ID
    let username = `user_${loginUserId}`
    let businessAccountId = loginUserId // fallback
    let profilePic: string | null = null

    try {
      const meRes = await fetch(
        `https://graph.instagram.com/v24.0/me?fields=user_id,username,profile_picture_url&access_token=${accessToken}`
      )
      const meData = await meRes.json()

      if (meData.username) username = meData.username
      if (meData.profile_picture_url) profilePic = meData.profile_picture_url
      if (meData.user_id) {
        businessAccountId = meData.user_id.toString()
      }
    } catch (e) {
      console.error("[Instagram Callback] /me request failed:", e)
    }

    const adminSupabase = getSupabaseAdmin()

    // 5. If we have a logged-in creator, attach Instagram credentials to their existing row
    if (targetUserId) {
      console.log(`[Instagram Callback] Linking Instagram @${username} to logged-in user: ${targetUserId}`)

      const { data: existingUser } = await adminSupabase
        .from("users")
        .select("ai_context, username")
        .eq("id", targetUserId)
        .maybeSingle()

      let existingKnowledge: Record<string, any> = {}
      try {
        if (existingUser?.ai_context) existingKnowledge = JSON.parse(existingUser.ai_context)
      } catch {}

      const updatedContext = {
        ...existingKnowledge,
        _instagram: {
          username,
          profilePic,
          connectedAt: new Date().toISOString(),
          oauth: true,
        },
      }

      const { error: linkError } = await adminSupabase
        .from("users")
        .update({
          username,
          access_token: accessToken,
          business_account_id: businessAccountId,
          page_id: businessAccountId,
          token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
          ai_context: JSON.stringify(updatedContext),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetUserId)

      if (linkError) throw linkError

      const response = NextResponse.json({
        success: true,
        username,
        userId: targetUserId,
        profilePic,
        businessAccountId,
      })

      setSessionCookie(response, {
        userId: targetUserId,
        username,
        profilePic: profilePic || undefined,
      })

      return response
    }

    // 6. Fallback: Standalone Instagram login (creates/upserts row with loginUserId)
    const updates: any = {
      username,
      access_token: accessToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      business_account_id: businessAccountId,
      page_id: businessAccountId,
    }

    const { error: upsertError } = await adminSupabase
      .from("users")
      .upsert({ id: loginUserId, ...updates }, { onConflict: "id" })

    if (upsertError) throw upsertError

    const response = NextResponse.json({
      success: true,
      username,
      userId: loginUserId,
      profilePic,
      businessAccountId,
    })

    setSessionCookie(response, {
      username,
      userId: loginUserId,
      profilePic,
    })
    return response

  } catch (error: any) {
    return safeErrorResponse(error, "Failed to authenticate with Instagram")
  }
}
