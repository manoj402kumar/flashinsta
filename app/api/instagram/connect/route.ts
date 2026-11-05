import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"
import { linkAccounts, isValidInstagramToken } from "@/lib/account-links"

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized: Google session required." }, { status: 401 })
    }

    const masterEmail = session.email ? session.email.toLowerCase().trim() : null

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { userId, accessToken: rawToken, businessAccountId: customBusinessAccountId, asNewAccount } = body || {}
    if (userId && String(userId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetUserId = session.userId
    const adminSupabase = getSupabaseAdmin()

    // 1. Verify user exists in database
    const { data: user, error: userError } = await adminSupabase
      .from("users")
      .select("id, username, ai_context, page_id, business_account_id, access_token")
      .eq("id", targetUserId)
      .maybeSingle()

    if (userError || !user) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 })
    }

    if (!rawToken) {
      return NextResponse.json(
        { error: "Missing required field: accessToken is required." },
        { status: 400 }
      )
    }

    const token = rawToken.trim()
    if (token.length < 15) {
      return NextResponse.json(
        { error: "The provided access token is too short or malformed." },
        { status: 400 }
      )
    }

    // 2. Validate token dynamically against Graph API
    let igUserId: string | null = null
    let igUsername: string | null = null
    let profilePic: string | null = null
    let pageId: string | null = null
    let pageName: string | null = null
    let verifiedVia = "instagram_basic"
    let pageAccessToken: string | null = null
    let specificValidationError: string | null = null

    console.log(`[Connect IG] Validating token dynamically for user ${targetUserId}...`)

    const isMetaToken = token.startsWith("EAA")
    const appId = process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID
    const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    const appAccessToken = appId && appSecret ? `${appId}|${appSecret}` : null

    // Step A: Inspect token metadata via debug_token if app credentials available
    let tokenDebugData: any = null
    if (appAccessToken && isMetaToken) {
      try {
        const debugRes = await fetch(
          `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appAccessToken)}`,
          { signal: AbortSignal.timeout(7000) }
        )
        const debugJson = await debugRes.json()
        if (debugJson?.data) {
          tokenDebugData = debugJson.data
        } else if (debugJson?.error) {
          console.warn("[Connect IG] debug_token notice:", debugJson.error.message)
        }
      } catch (e) {
        console.warn("[Connect IG] debug_token call failed:", e)
      }
    }

    if (tokenDebugData) {
      if (tokenDebugData.is_valid === false && tokenDebugData.error?.code === 190) {
        const errMsg = tokenDebugData.error?.message || "Invalid or expired token"
        return NextResponse.json(
          { error: `Meta rejected this token: ${errMsg}` },
          { status: 400 }
        )
      }

      // Check if it's a PAGE token
      if (tokenDebugData.type === "PAGE") {
        const pageTargetId = tokenDebugData.profile_id
        if (pageTargetId) {
          try {
            const pageRes = await fetch(
              `https://graph.facebook.com/v24.0/${encodeURIComponent(pageTargetId)}?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`,
              { signal: AbortSignal.timeout(7000) }
            )
            const pageData = await pageRes.json()
            if (pageData?.instagram_business_account) {
              igUserId = String(pageData.instagram_business_account.id)
              igUsername = pageData.instagram_business_account.username || null
              profilePic = pageData.instagram_business_account.profile_picture_url || null
              pageId = String(pageData.id || pageTargetId)
              pageName = pageData.name || null
              pageAccessToken = token
              verifiedVia = "page_token"
            }
          } catch (e) {
            console.warn("[Connect IG] Error resolving page target:", e)
          }
        }
      }
    }

    // Step B: Query /me directly on Facebook Graph API
    if (!igUserId && isMetaToken) {
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v24.0/me?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(6000) }
        )
        const meData = await meRes.json()
        if (meData?.instagram_business_account) {
          igUserId = String(meData.instagram_business_account.id)
          igUsername = meData.instagram_business_account.username || null
          profilePic = meData.instagram_business_account.profile_picture_url || null
          pageId = String(meData.id)
          pageName = meData.name || null
          verifiedVia = "facebook_page_direct"
        }
      } catch {}
    }

    // Step C: Query /me/accounts to find connected Facebook Pages with Instagram accounts
    if (!igUserId && isMetaToken) {
      try {
        const accRes = await fetch(
          `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&limit=25&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(7000) }
        )
        const accData = await accRes.json()

        if (accData?.data && Array.isArray(accData.data)) {
          for (const page of accData.data) {
            if (page.instagram_business_account) {
              igUserId = String(page.instagram_business_account.id)
              igUsername = page.instagram_business_account.username || null
              profilePic = page.instagram_business_account.profile_picture_url || null
              pageId = String(page.id)
              pageName = page.name || null
              if (page.access_token) {
                pageAccessToken = page.access_token
              }
              verifiedVia = "facebook_user_pages"
              break
            }
          }
        }
      } catch (e) {
        console.warn("[Connect IG] Error checking me/accounts:", e)
      }
    }

    // Step D: Custom Business Account ID inspection if provided
    if (!igUserId && customBusinessAccountId && isMetaToken) {
      try {
        const customRes = await fetch(
          `https://graph.facebook.com/v24.0/${encodeURIComponent(customBusinessAccountId)}?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(6000) }
        )
        const customData = await customRes.json()
        if (customData?.id) {
          igUserId = String(customData.id)
          igUsername = customData.username || null
          profilePic = customData.profile_picture_url || null
          verifiedVia = "custom_account_id"
        }
      } catch {}
    }

    // Step E: Query Instagram Graph API directly for Instagram Login / Basic Display tokens
    if (!igUserId && !isMetaToken) {
      try {
        const igRes = await fetch(
          `https://graph.instagram.com/v24.0/me?fields=id,username,user_id,profile_picture_url&access_token=${encodeURIComponent(token)}`,
          { signal: AbortSignal.timeout(7000) }
        )
        const igData = await igRes.json()
        if (igData?.id) {
          igUserId = String(igData.user_id || igData.id)
          igUsername = igData.username || null
          profilePic = igData.profile_picture_url || null
          verifiedVia = "instagram_basic"
        }
      } catch (e) {
        console.warn("[Connect IG] Error checking graph.instagram.com/me:", e)
      }
    }

    // If dynamic discovery did not resolve igUserId, verify token liveness directly
    if (!igUserId) {
      const pingUrl = isMetaToken
        ? `https://graph.facebook.com/v24.0/me?access_token=${encodeURIComponent(token)}`
        : `https://graph.instagram.com/v24.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`

      const pingRes = await fetch(pingUrl, { signal: AbortSignal.timeout(6000) }).catch(() => null)
      const pingData = pingRes ? await pingRes.json().catch(() => null) : null

      // Check if token is rejected as expired
      if (pingData?.error?.code === 190) {
        return NextResponse.json(
          {
            error: `Your access token has expired (Meta error 190: ${pingData.error.message}). Please generate a fresh token.`,
          },
          { status: 400 }
        )
      }

      if (isMetaToken) {
        if (customBusinessAccountId && customBusinessAccountId.startsWith("1784")) {
          igUserId = customBusinessAccountId
          igUsername = pingData?.name || "Instagram Account"
          verifiedVia = "custom_account_id"
        } else {
          return NextResponse.json(
            {
              error:
                "No Instagram Professional/Business account found for this Meta token. Please ensure your Instagram account is converted to Professional and linked to a Facebook Page, or supply your Instagram Account ID.",
            },
            { status: 400 }
          )
        }
      } else {
        // Non-Meta token (Instagram Basic Display)
        if (pingData?.id) {
          igUserId = String(pingData.id)
          igUsername = pingData.username || "Instagram Account"
          verifiedVia = "instagram_basic"
        } else {
          return NextResponse.json(
            { error: "Could not verify Instagram token. Please generate a fresh token." },
            { status: 400 }
          )
        }
      }
    }

    // 3. Exchange for Long-Lived Token if applicable
    let finalToken = pageAccessToken || token
    let expiresInSeconds = 60 * 24 * 60 * 60 // 60 days default

    const clientSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
    const clientId = process.env.INSTAGRAM_APP_ID

    if (clientSecret && isMetaToken && clientId) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${encodeURIComponent(token)}`
        const exRes = await fetch(exchangeUrl)
        const exData = await exRes.json()
        if (exRes.ok && exData.access_token) {
          const longLivedUserToken = exData.access_token
          if (exData.expires_in) expiresInSeconds = exData.expires_in

          // Attempt to retrieve permanent Page Access Token using long-lived user token
          if (pageId) {
            try {
              const permPageRes = await fetch(
                `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}?fields=access_token,name,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(longLivedUserToken)}`,
                { signal: AbortSignal.timeout(6000) }
              )
              const permPageData = await permPageRes.json()
              if (permPageData.access_token) {
                pageAccessToken = permPageData.access_token
                finalToken = permPageData.access_token
                expiresInSeconds = 3650 * 24 * 60 * 60 // 10 years / permanent
                verifiedVia = "permanent_page_token"
              }
              if (permPageData.instagram_business_account?.id) {
                igUserId = String(permPageData.instagram_business_account.id)
                igUsername = permPageData.instagram_business_account.username || igUsername
                profilePic = permPageData.instagram_business_account.profile_picture_url || profilePic
              }
            } catch (pe) {
              console.warn("[Connect IG] Direct permanent page token lookup skipped:", pe)
            }
          }
        }
      } catch (e) {
        console.warn("[Connect IG] Meta token exchange skipped:", e)
      }
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

    // 3.5. Explicitly fetch Instagram Account details (Username, Display Name, Profile Picture DP)
    if (finalToken) {
      // If we have an IG business account ID (e.g. 1784...)
      if (igUserId && isMetaToken) {
        try {
          const igProfileRes = await fetch(
            `https://graph.facebook.com/v24.0/${encodeURIComponent(igUserId)}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(finalToken)}`,
            { signal: AbortSignal.timeout(6000) }
          )
          const igProfile = await igProfileRes.json()
          if (igProfile?.id && !igProfile.error) {
            if (igProfile.username) igUsername = igProfile.username
            if (igProfile.name) pageName = igProfile.name
            if (igProfile.profile_picture_url) profilePic = igProfile.profile_picture_url
          }
        } catch (err) {
          console.warn("[Connect IG] Error fetching IG profile by ID:", err)
        }
      }

      // If we have a Page ID but igUsername or profilePic is still missing or igUserId was the Page ID
      if ((!igUsername || !profilePic || igUserId === pageId) && pageId && isMetaToken) {
        try {
          const pageRes = await fetch(
            `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${encodeURIComponent(finalToken)}`,
            { signal: AbortSignal.timeout(6000) }
          )
          const pageData = await pageRes.json()
          if (pageData?.instagram_business_account?.id) {
            const igAcc = pageData.instagram_business_account
            igUserId = String(igAcc.id)
            if (igAcc.username) igUsername = igAcc.username
            if (igAcc.name) pageName = igAcc.name
            if (igAcc.profile_picture_url) profilePic = igAcc.profile_picture_url
          }
        } catch (err) {
          console.warn("[Connect IG] Error fetching page instagram_business_account:", err)
        }
      }

      // If still missing and not a Meta token (or Basic Display), try graph.instagram.com/me
      if (!profilePic || !igUsername) {
        try {
          const basicRes = await fetch(
            `https://graph.instagram.com/v24.0/me?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(finalToken)}`,
            { signal: AbortSignal.timeout(6000) }
          )
          const basicData = await basicRes.json()
          if (basicData?.username) igUsername = basicData.username
          if (basicData?.profile_picture_url) profilePic = basicData.profile_picture_url
        } catch {}
      }
    }

    const effectiveUsername = igUsername || pageName || "Instagram User"

    // 4. Update user context
    let existingKnowledge: Record<string, any> = {}
    try {
      if (user.ai_context) existingKnowledge = JSON.parse(user.ai_context)
    } catch {}

    const updatedContext = {
      ...existingKnowledge,
      business_name: pageName || effectiveUsername,
      _instagram: {
        username: effectiveUsername,
        name: pageName || effectiveUsername,
        profilePic,
        connectedAt: new Date().toISOString(),
        verifiedVia,
        tokenType: pageAccessToken || verifiedVia.includes("page") ? "PAGE" : "USER",
        pageId: pageId || null,
        pageName: pageName || effectiveUsername,
        businessAccountId: igUserId,
        accessToken: finalToken,
        userAccessToken: verifiedVia !== "page_token" ? token : undefined,
        pageAccessToken: pageAccessToken || (verifiedVia === "page_token" ? finalToken : undefined),
        manualToken: true,
      },
      google_email: masterEmail || existingKnowledge.google_email,
    }

    // 5. Prepare updates payload
    const updates: Record<string, any> = {
      access_token: finalToken,
      business_account_id: igUserId,
      page_id: pageId || null,
      token_expires_at: expiresAt,
      ai_context: JSON.stringify(updatedContext),
      updated_at: new Date().toISOString(),
    }

    // Determine whether to link as an additional account or update current workspace
    const isAdditionalAccount = Boolean(
      asNewAccount ||
      (isValidInstagramToken(user.access_token) && igUserId && String(user.id) !== String(igUserId))
    )

    let finalUserId = String(targetUserId)

    if (isAdditionalAccount) {
      // Create or update dedicated user record for the new Instagram account
      const newAccountRowId = /^\d+$/.test(igUserId || "")
        ? String(igUserId)
        : (Date.now() * 10 + Math.floor(Math.random() * 10)).toString()

      finalUserId = newAccountRowId

      const { data: existingTarget } = await adminSupabase
        .from("users")
        .select("id, username, ai_context")
        .eq("id", newAccountRowId)
        .maybeSingle()

      if (existingTarget) {
        // Multi-tenant check: Verify account is not already claimed by a different Google email
        try {
          if (existingTarget.ai_context) {
            const parsed = JSON.parse(existingTarget.ai_context)
            const ownerEmail = (parsed.google_email || (existingTarget.username?.includes("@") ? existingTarget.username : "")).toLowerCase().trim()
            if (ownerEmail && masterEmail && ownerEmail !== masterEmail) {
              return NextResponse.json(
                { error: "This Instagram account is already connected to a different Google account. Disconnect it there first." },
                { status: 409 }
              )
            }
          }
        } catch {}

        const { error: updateError } = await adminSupabase
          .from("users")
          .update(updates)
          .eq("id", newAccountRowId)

        if (updateError) {
          console.error("[Connect IG] Supabase update error on linked account:", updateError)
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
      } else {
        let candidateUsername = effectiveUsername
        const { data: nameConflict } = await adminSupabase
          .from("users")
          .select("id")
          .eq("username", candidateUsername)
          .maybeSingle()

        if (nameConflict) {
          candidateUsername = `${candidateUsername}_${Math.floor(100 + Math.random() * 900)}`
        }

        const { error: insertError } = await adminSupabase
          .from("users")
          .insert({
            id: newAccountRowId,
            username: candidateUsername,
            ...updates,
          })

        if (insertError) {
          console.error("[Connect IG] Supabase insert error on new linked account:", insertError)
          return NextResponse.json({ error: insertError.message }, { status: 500 })
        }
      }

      // Link new account with caller's current cluster bi-directionally
      await linkAccounts(targetUserId, newAccountRowId)
    } else {
      // Try setting primary username to Instagram handle if unique
      if (igUsername && igUsername !== user.username) {
        const { data: existingName } = await adminSupabase
          .from("users")
          .select("id")
          .eq("username", igUsername)
          .neq("id", targetUserId)
          .maybeSingle()

        if (!existingName) {
          updates.username = igUsername
        }
      }

      const { error: updateError } = await adminSupabase
        .from("users")
        .update(updates)
        .eq("id", targetUserId)

      if (updateError) {
        console.error("[Connect IG] Supabase update error:", updateError)
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }

    const response = NextResponse.json({
      success: true,
      message: `Successfully connected Instagram account @${effectiveUsername}`,
      instagramUsername: effectiveUsername,
      businessAccountId: igUserId,
      userId: finalUserId,
      profilePic,
      expiresAt,
    })

    setSessionCookie(response, {
      userId: finalUserId,
      username: effectiveUsername,
      email: masterEmail || session.email,
      profilePic: profilePic || undefined,
    })

    return response
  } catch (error: any) {
    console.error("[Connect IG] Internal error:", error)
    return NextResponse.json({ error: error.message || "Failed to connect Instagram account" }, { status: 500 })
  }
}
