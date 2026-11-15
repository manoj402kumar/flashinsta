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
    const { code } = body
    if (!code) return NextResponse.json({ error: "No code" }, { status: 400 })

    // Enforce Google Authentication: Standalone Instagram login without Google is strictly forbidden
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json(
        { error: "Authentication required: Please sign in with your Google account first before connecting an Instagram account." },
        { status: 401 }
      )
    }

    const targetUserId = String(session.userId)
    const masterEmail = session.email ? session.email.toLowerCase().trim() : null

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

    // 5. Multi-tenant anti-theft check: Verify this Instagram account isn't already claimed by another Google user
    const { data: existingOwners } = await adminSupabase
      .from("users")
      .select("id, username, ai_context, business_account_id")
      .or(`business_account_id.eq.${businessAccountId},id.eq.${loginUserId}`)

    if (existingOwners && existingOwners.length > 0) {
      for (const owner of existingOwners) {
        if (String(owner.id) === targetUserId) continue
        try {
          if (owner.ai_context) {
            const parsed = JSON.parse(owner.ai_context)
            const ownerEmail = (parsed.google_email || (owner.username?.includes("@") ? owner.username : "")).toLowerCase().trim()
            if (ownerEmail && masterEmail && ownerEmail !== masterEmail) {
              return NextResponse.json(
                {
                  error: `This Instagram account (@${username}) is already linked to another Google account. Please disconnect it from that account first.`,
                },
                { status: 409 }
              )
            }
          }
        } catch {}
      }
    }

    // 6. Attach Instagram credentials strictly to this authenticated Google creator
    console.log(`[Instagram Callback] Linking Instagram @${username} to Google user: ${targetUserId} (${masterEmail})`)

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
      google_email: masterEmail || existingKnowledge.google_email,
      _instagram: {
        username,
        profilePic,
        businessAccountId,
        connectedAt: new Date().toISOString(),
        profilePicUpdatedAt: new Date().toISOString(),
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
      email: masterEmail || session.email,
      profilePic: profilePic || undefined,
    })

    return response
  } catch (error: any) {
    return safeErrorResponse(error, "Failed to authenticate with Instagram")
  }
}
