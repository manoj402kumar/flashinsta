import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import {
  getSessionFromRequest,
  clearSessionCookie,
  setSessionCookie,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/session"
import { getLinkedAccountIds } from "@/lib/account-links"
import { isGoogleProfilePhoto, parseAiContext, resolveIdentity } from "@/lib/identity"
import { refreshInstagramProfileIfStale } from "@/lib/instagram-profile"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)

    if (!session || !session.userId) {
      const res = NextResponse.json({ authenticated: false })
      clearSessionCookie(res)
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
      return res
    }

    const adminSupabase = getSupabaseAdmin()

    const { data: user, error } = await adminSupabase
      .from("users")
      .select("id, username, groq_auto_reply_enabled, ai_context, access_token, token_expires_at, business_account_id, page_id")
      .eq("id", session.userId)
      .maybeSingle()

    if (error || !user) {
      return NextResponse.json({ authenticated: false })
    }

    // Server-side session revocation verification
    if (user.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        const isGlobalRevoked =
          Boolean(parsed.session_revoked_at && session.iat && session.iat <= Number(parsed.session_revoked_at))
        const isSpecificRevoked =
          Boolean(session.sid && Array.isArray(parsed.revoked_sids) && parsed.revoked_sids.includes(session.sid))

        if (isGlobalRevoked || isSpecificRevoked) {
          const revokedResponse = NextResponse.json({ authenticated: false, message: "Session revoked" })
          clearSessionCookie(revokedResponse)
          return revokedResponse
        }
      } catch {}
    }

    const refreshed = await refreshInstagramProfileIfStale(user)
    const profileRow = {
      ...user,
      ai_context: refreshed.aiContext,
      business_account_id: refreshed.businessAccountId ?? user.business_account_id,
    }

    const identity = resolveIdentity(profileRow)
    const isIgConnected = identity.isIgConnected
    const igUsername = identity.igUsername
    const igProfilePic = identity.isIgConnected ? identity.profilePic : null

    // Backfill the Google photo for accounts created before it was persisted.
    let googleProfilePic = identity.googleProfilePic
    if (!googleProfilePic && isGoogleProfilePhoto(session.profilePic)) {
      googleProfilePic = session.profilePic || null
      try {
        const context = parseAiContext(refreshed.aiContext)
        if (!context.google_picture) {
          context.google_picture = googleProfilePic
          const nextContext = JSON.stringify(context)
          await adminSupabase
            .from("users")
            .update({ ai_context: nextContext })
            .eq("id", user.id)
        }
      } catch {}
    }

    // Resolve login email for master account identity
    let loginEmail: string | null = session.email || identity.email || null
    // If current account is an Instagram sub-account, resolve master email from linked cluster
    if (!loginEmail) {
      try {
        const clusterIds = await getLinkedAccountIds(user.id.toString())
        for (const cid of clusterIds) {
          if (cid === user.id.toString()) continue
          const { data: member } = await adminSupabase
            .from("users")
            .select("username, ai_context")
            .eq("id", cid)
            .maybeSingle()

          if (member) {
            if (member.ai_context) {
              try {
                const mp = JSON.parse(member.ai_context)
                if (mp.google_email) {
                  loginEmail = String(mp.google_email).toLowerCase().trim()
                  break
                }
              } catch {}
            }
            if (member.username && member.username.includes("@")) {
              loginEmail = member.username.toLowerCase().trim()
              break
            }
          }
        }
      } catch {}
    }

    // Connected: Instagram handle and photo. Disconnected: login email and
    // Google photo. A session photo is trusted only when Google hosts it, so an
    // expired Instagram URL can never leak into the disconnected identity.
    const displayUsername = isIgConnected
      ? igUsername || identity.username
      : loginEmail || identity.username
    const effectiveProfilePic = isIgConnected
      ? identity.profilePic
      : googleProfilePic

    const sessionUpdateData = {
      userId: user.id.toString(),
      username: displayUsername,
      email: loginEmail,
      profilePic: effectiveProfilePic || undefined,
      sid: session.sid,
      iat: session.iat || Date.now(),
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
      lastActive: Date.now(),
    }

    const res = NextResponse.json({
      authenticated: true,
      userId: user.id.toString(),
      username: displayUsername,
      email: loginEmail,
      profilePic: effectiveProfilePic,
      igUsername: isIgConnected ? igUsername : null,
      igProfilePic: isIgConnected ? igProfilePic : null,
      isIgConnected,
    })
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")

    // Re-issue / refresh the persistent cookie on every successful session verification
    const activeToken = setSessionCookie(res, sessionUpdateData)

    return NextResponse.json({
      authenticated: true,
      userId: user.id.toString(),
      username: displayUsername,
      email: loginEmail,
      profilePic: effectiveProfilePic,
      igUsername: isIgConnected ? igUsername : null,
      igProfilePic: isIgConnected ? igProfilePic : null,
      isIgConnected,
      token: activeToken,
    }, {
      headers: res.headers,
    })
  } catch (error) {
    return safeErrorResponse(error, "Authentication check failed")
  }
}
