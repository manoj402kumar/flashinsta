import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { setSessionCookie } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const { data: body, errorResponse } = await parseSafeJson<{ code?: string; redirectUri?: string }>(request)
    if (errorResponse) return errorResponse

    const code = body?.code
    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    }

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri =
      body?.redirectUri ||
      process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ||
      (process.env.NODE_ENV === "production"
        ? (process.env.NEXT_PUBLIC_APP_URL || "https://insta-p8-fawn.vercel.app")
        : "http://localhost:3000")

    if (!clientId || !clientSecret || !redirectUri) {
      return NextResponse.json(
        { error: "Google OAuth is not properly configured on this server" },
        { status: 500 }
      )
    }

    // 1. Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.json(
        { error: tokenData.error_description || "Failed to exchange Google authorization code" },
        { status: 400 }
      )
    }

    // 2. Fetch user profile from Google
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    const profile = await userinfoRes.json()
    if (!profile.email) {
      return NextResponse.json({ error: "Failed to retrieve Google profile" }, { status: 400 })
    }

    const email = profile.email.toLowerCase().trim()
    const profilePic = profile.picture || null

    const adminSupabase = getSupabaseAdmin()

    // 3. Find existing user by verified Google email
    let existingUser: any = null

    // A. Check by username === email
    const { data: byUsername } = await adminSupabase
      .from("users")
      .select("id, username, access_token, ai_context")
      .eq("username", email)
      .maybeSingle()

    if (byUsername) {
      existingUser = byUsername
    }

    // B. Check if ai_context already contains this google_email (verified strictly with JSON.parse)
    if (!existingUser) {
      const { data: candidates } = await adminSupabase
        .from("users")
        .select("id, username, access_token, ai_context")
        .ilike("ai_context", `%"google_email":"${email}"%`)

      if (candidates && candidates.length > 0) {
        for (const candidate of candidates) {
          try {
            if (candidate.ai_context) {
              const parsed = JSON.parse(candidate.ai_context)
              if (parsed.google_email && parsed.google_email.toLowerCase().trim() === email) {
                existingUser = candidate
                break
              }
            }
          } catch {}
        }
      }
    }

    let userId: string
    let finalUsername = email

    if (existingUser) {
      userId = existingUser.id.toString()
      finalUsername = existingUser.username || email

      // Preserve existing ai_context and record Google metadata
      let ctx: Record<string, any> = {}
      try {
        if (existingUser.ai_context) ctx = JSON.parse(existingUser.ai_context)
      } catch {}
      ctx.google_email = email
      if (profile.name) ctx.google_name = profile.name
      if (profile.picture) ctx.google_picture = profile.picture
      if (profile.id) ctx.google_id = profile.id
      // Clear past logout marker to ensure new session is valid
      delete ctx.session_revoked_at

      await adminSupabase
        .from("users")
        .update({
          ai_context: JSON.stringify(ctx),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingUser.id)
    } else {
      // 4. Brand new user — automatically use email as initial username
      userId = (Date.now() * 10 + Math.floor(Math.random() * 10)).toString()
      finalUsername = email

      const newCtx = {
        google_email: email,
        google_name: profile.name || null,
        google_picture: profile.picture || null,
        google_id: profile.id || null,
      }

      const { error: insertError } = await adminSupabase.from("users").insert({
        id: userId,
        username: finalUsername,
        access_token: "GOOGLE_AUTH",
        token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        business_account_id: null,
        page_id: null,
        ai_context: JSON.stringify(newCtx),
        updated_at: new Date().toISOString(),
      })

      if (insertError) {
        console.error("[Google Auth] Insert user error:", insertError)
        return safeErrorResponse(insertError, "Failed to create user account")
      }
    }

    // 5. Set secure signed session cookie (with sameSite: lax and 90-day persistence)
    const sessionData = {
      userId,
      username: finalUsername,
      email,
      profilePic,
    }

    const response = NextResponse.json({
      success: true,
      email,
      username: finalUsername,
      userId,
      profilePic,
    })

    const token = setSessionCookie(response, sessionData)

    // Also return token in body for client device storage resilience
    return NextResponse.json({
      success: true,
      token,
      email,
      username: finalUsername,
      userId,
      profilePic,
    }, {
      headers: response.headers,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to process Google login")
  }
}
