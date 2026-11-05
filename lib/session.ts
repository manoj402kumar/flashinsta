import crypto from "crypto"
import type { NextRequest, NextResponse } from "next/server"

export interface SessionData {
  userId: string
  username: string
  email?: string | null
  profilePic?: string | null
  sid?: string
  iat?: number
  exp?: number
  lastActive?: number
}

export const PRIMARY_COOKIE_NAME =
  process.env.NODE_ENV === "production" ? "__Host-insta_session" : "insta_session"
export const FALLBACK_COOKIE_NAME = "insta_session"

// Sensible lifetimes: 14 days absolute maximum, 24 hours idle timeout
export const SESSION_MAX_AGE_SECONDS = 14 * 24 * 60 * 60 // 14 days
export const SESSION_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000 // 24 hours

// In-memory set of revoked session IDs (TTL bounded)
const revokedSids = new Map<string, number>()

// Fast in-memory cache for recent database session validations (1.5s TTL)
interface SessionValidationCacheEntry {
  valid: boolean
  email?: string | null
  timestamp: number
}
const sessionValidationCache = new Map<string, SessionValidationCacheEntry>()
const VALIDATION_CACHE_TTL_MS = 1500 // 1.5 seconds

export function revokeSessionIdLocally(sid: string, expiresAt?: number): void {
  if (!sid) return
  const ttl = expiresAt || Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  revokedSids.set(sid, ttl)
  sessionValidationCache.delete(sid)
}

export function isSessionIdLocallyRevoked(sid: string): boolean {
  if (!sid) return false
  const exp = revokedSids.get(sid)
  if (!exp) return false
  if (Date.now() > exp) {
    revokedSids.delete(sid)
    return false
  }
  return true
}

let hasWarnedSessionSecret = false

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret

  const fallback = process.env.INSTAGRAM_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fallback) {
    if (process.env.NODE_ENV === "production" && !hasWarnedSessionSecret) {
      hasWarnedSessionSecret = true
      console.warn(
        "[Security Warning] SESSION_SECRET is not set. Falling back to secondary secret. For maximum cryptographic security and key isolation, configure a dedicated SESSION_SECRET environment variable."
      )
    }
    return fallback
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("[session] Fatal: SESSION_SECRET must be configured in production.")
  }
  return "dev-only-local-secret-do-not-use-in-production"
}

export function signSessionPayload(
  data: Omit<SessionData, "sid" | "iat" | "exp" | "lastActive"> & Partial<SessionData>
): string {
  const now = Date.now()
  const completeData: SessionData = {
    userId: String(data.userId),
    username: data.username,
    email: data.email || null,
    profilePic: data.profilePic || null,
    sid: data.sid || crypto.randomUUID(),
    iat: data.iat || now,
    exp: data.exp || now + SESSION_MAX_AGE_SECONDS * 1000,
    lastActive: data.lastActive || now,
  }
  const payload = JSON.stringify(completeData)
  const secret = getSessionSecret()
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  return `${payload}.${hmac}`
}

export function verifySessionToken(token: string): SessionData | null {
  if (!token || typeof token !== "string") return null
  const lastDot = token.lastIndexOf(".")
  if (lastDot === -1) return null

  const payload = token.slice(0, lastDot)
  const signature = token.slice(lastDot + 1)
  const secret = getSessionSecret()
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex")

  let isValid =
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))

  // Graceful secret rotation: if primary SESSION_SECRET verification fails, check fallback secret
  if (!isValid && process.env.SESSION_SECRET) {
    const fallback = process.env.INSTAGRAM_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (fallback) {
      const fallbackExpected = crypto.createHmac("sha256", fallback).update(payload).digest("hex")
      if (
        signature.length === fallbackExpected.length &&
        crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(fallbackExpected, "utf8"))
      ) {
        isValid = true
      }
    }
  }

  if (!isValid) {
    return null
  }

  try {
    const data = JSON.parse(payload) as SessionData
    if (!data || !data.userId) return null

    const now = Date.now()

    // 1. Enforce absolute maximum lifetime (exp)
    if (data.exp && now > data.exp) {
      return null
    }

    // 2. Enforce idle timeout (lastActive)
    if (data.lastActive && now - data.lastActive > SESSION_IDLE_TIMEOUT_MS) {
      return null
    }

    // 3. Reject if locally marked revoked
    if (data.sid && isSessionIdLocallyRevoked(data.sid)) {
      return null
    }

    return data
  } catch {
    return null
  }
}

/**
 * Full database-backed cryptographic session verifier.
 * Checks HMAC signature, expiration, idle timeout, and validates against
 * persistent server-side revocation in Supabase (session_revoked_at & revoked_sids).
 */
export async function verifySessionTokenAsync(token: string): Promise<SessionData | null> {
  const data = verifySessionToken(token)
  if (!data || !data.userId) return null

  const cacheKey = data.sid || `${data.userId}:${data.iat}`
  const cached = sessionValidationCache.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.timestamp < VALIDATION_CACHE_TTL_MS) {
    if (!cached.valid) return null
    if (cached.email && !data.email) data.email = cached.email
    return data
  }

  try {
    const { getSupabaseAdmin } = await import("./supabase-admin")
    const admin = getSupabaseAdmin()
    const { data: user, error } = await admin
      .from("users")
      .select("id, ai_context, username")
      .eq("id", data.userId)
      .maybeSingle()

    if (error || !user) {
      sessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
      return null
    }

    let userGoogleEmail: string | null = null
    if (user.ai_context) {
      try {
        const ctx = JSON.parse(user.ai_context)
        if (ctx.google_email && typeof ctx.google_email === "string") {
          userGoogleEmail = ctx.google_email.toLowerCase().trim()
        }
        const revokedAt = ctx.session_revoked_at ? Number(ctx.session_revoked_at) : 0
        if (revokedAt && data.iat && data.iat <= revokedAt) {
          if (data.sid) revokeSessionIdLocally(data.sid)
          sessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
          return null
        }
        if (data.sid && Array.isArray(ctx.revoked_sids) && ctx.revoked_sids.includes(data.sid)) {
          revokeSessionIdLocally(data.sid)
          sessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
          return null
        }
      } catch {}
    }

    if (!userGoogleEmail && user.username && user.username.includes("@")) {
      userGoogleEmail = user.username.toLowerCase().trim()
    }

    if (userGoogleEmail) {
      data.email = userGoogleEmail
    }

    sessionValidationCache.set(cacheKey, { valid: true, email: data.email, timestamp: now })
    return data
  } catch (err) {
    console.error("[Session] Database verification error:", err)
    // Fall back to cryptographic HMAC verification if DB is temporarily unreachable
    return data
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionData | null> {
  // Support both production __Host- prefix and standard cookie name for backward compatibility
  const cookieValue =
    request.cookies.get(PRIMARY_COOKIE_NAME)?.value ||
    request.cookies.get(FALLBACK_COOKIE_NAME)?.value

  if (!cookieValue) return null

  return verifySessionTokenAsync(cookieValue)
}

export function getSessionFromRequestSync(request: NextRequest): SessionData | null {
  const cookieValue =
    request.cookies.get(PRIMARY_COOKIE_NAME)?.value ||
    request.cookies.get(FALLBACK_COOKIE_NAME)?.value

  if (!cookieValue) return null

  return verifySessionToken(cookieValue)
}

export function setSessionCookie(
  response: NextResponse,
  data: Omit<SessionData, "sid" | "iat" | "exp" | "lastActive"> & Partial<SessionData>
): void {
  const signedToken = signSessionPayload(data)
  const isProd = process.env.NODE_ENV === "production"

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  }

  response.cookies.set(PRIMARY_COOKIE_NAME, signedToken, cookieOptions)

  // In production, also set fallback cookie for compatibility during rolling upgrades
  if (isProd && PRIMARY_COOKIE_NAME !== FALLBACK_COOKIE_NAME) {
    response.cookies.set(FALLBACK_COOKIE_NAME, signedToken, cookieOptions)
  }
}

export function clearSessionCookie(response: NextResponse): void {
  const isProd = process.env.NODE_ENV === "production"
  const clearOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  }

  response.cookies.set(PRIMARY_COOKIE_NAME, "", clearOptions)
  if (PRIMARY_COOKIE_NAME !== FALLBACK_COOKIE_NAME) {
    response.cookies.set(FALLBACK_COOKIE_NAME, "", clearOptions)
  }

  // Explicitly clear legacy & environment-variant cookie names with Max-Age=0 and Expires=1970
  response.cookies.set("insta_session", "", { ...clearOptions, secure: false })
  response.cookies.set("__Host-insta_session", "", { ...clearOptions, secure: true })
}
