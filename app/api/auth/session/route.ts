import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, clearSessionCookie } from "@/lib/session"
import { getLinkedAccountIds } from "@/lib/account-links"
import { safeErrorResponse } from "@/lib/security"

function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)

    if (!session || !session.userId) {
      return NextResponse.json({ authenticated: false })
    }

    const adminSupabase = getSupabaseAdmin()

    const { data: user, error } = await adminSupabase
      .from("users")
      .select("id, username, groq_auto_reply_enabled, ai_context, access_token, business_account_id")
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

    let igUsername: string | null = null
    let igProfilePic: string | null = null
    let hasIgToken = isValidInstagramToken(user.access_token)

    try {
      if (user.ai_context) {
        const parsed = JSON.parse(user.ai_context)
        const candidateToken =
          parsed._instagram?.accessToken ||
          parsed._instagram?.pageAccessToken ||
          parsed._instagram?.userAccessToken
        if (candidateToken && isValidInstagramToken(candidateToken)) {
          hasIgToken = true
        }
        if (hasIgToken) {
          const rawIgUser = parsed._instagram?.username
          if (rawIgUser && !rawIgUser.includes("@")) {
            igUsername = rawIgUser
          } else if (user.username && !user.username.includes("@")) {
            igUsername = user.username
          } else {
            igUsername = rawIgUser || user.username || null
          }
          igProfilePic = parsed._instagram?.profilePic || null
        }
      } else if (hasIgToken && user.username && !user.username.includes("@")) {
        igUsername = user.username
      }
    } catch {}

    const isFb = Boolean(user.access_token && user.access_token.startsWith("EAA"))
    let hasValidIgId = true
    if (isFb) {
      const bizId = user.business_account_id ? String(user.business_account_id) : ""
      let ctxBizId = ""
      try {
        if (user.ai_context) {
          const p = JSON.parse(user.ai_context)
          ctxBizId = p._instagram?.businessAccountId ? String(p._instagram.businessAccountId) : ""
        }
      } catch {}
      hasValidIgId = bizId.startsWith("1784") || ctxBizId.startsWith("1784")
    }

    const isIgConnected = Boolean(hasIgToken && igUsername && hasValidIgId)

    // STRICT REQUIREMENT: When Instagram is connected, show ONLY the Instagram account name
    // and ONLY the Instagram profile photo. Never leak Google, Facebook, or fallback photos.
    const displayUsername = isIgConnected
      ? igUsername
      : (user.username && !user.username.includes("@") ? user.username : (session.username || "Account"))

    const effectiveProfilePic = isIgConnected
      ? (igProfilePic || null)
      : (session.profilePic || null)

    // Resolve login email for master account identity
    let loginEmail: string | null = session.email || null
    if (!loginEmail && user.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        if (parsed.google_email && typeof parsed.google_email === "string") {
          loginEmail = parsed.google_email.toLowerCase().trim()
        }
      } catch {}
    }
    if (!loginEmail && user.username && user.username.includes("@")) {
      loginEmail = user.username.toLowerCase().trim()
    }
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

    return NextResponse.json({
      authenticated: true,
      userId: user.id.toString(),
      username: displayUsername,
      email: loginEmail,
      profilePic: effectiveProfilePic,
      igUsername: isIgConnected ? igUsername : null,
      igProfilePic: isIgConnected ? igProfilePic : null,
      isIgConnected,
    })
  } catch (error) {
    return safeErrorResponse(error, "Authentication check failed")
  }
}
