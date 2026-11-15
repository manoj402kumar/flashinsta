import {
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_SECONDS,
} from "./session-policy"

export interface EdgeSessionData {
  userId: string
  username: string
  profilePic?: string | null
  sid?: string
  iat?: number
  exp?: number
  lastActive?: number
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) return new Uint8Array(new ArrayBuffer(0))
  const buffer = new ArrayBuffer(hex.length / 2)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (secret) return secret
  const fallback = process.env.INSTAGRAM_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fallback) return fallback
  if (process.env.NODE_ENV === "production") {
    throw new Error("[session] Fatal: SESSION_SECRET must be configured in production.")
  }
  return "dev-only-local-secret-do-not-use-in-production"
}

// Fast in-memory cache for recent edge session validations (1.5s TTL)
const edgeSessionValidationCache = new Map<string, { valid: boolean; timestamp: number }>()
const edgeRevokedSids = new Set<string>()
const EDGE_CACHE_TTL_MS = 1500

export function revokeSessionIdEdgeLocally(sid: string): void {
  if (!sid) return
  edgeRevokedSids.add(sid)
  edgeSessionValidationCache.delete(sid)
}

/**
 * Edge-compatible session token verifier using standard W3C Web Cryptography API.
 * Contains no Node.js runtime dependencies and executes safely in Next.js Edge Middleware.
 * Fully checks HMAC signature, expiration, idle timeout, and validates against
 * persistent server-side revocation in Supabase (session_revoked_at & revoked_sids).
 */
export async function verifySessionTokenEdge(token: string): Promise<EdgeSessionData | null> {
  if (!token || typeof token !== "string") return null
  const lastDot = token.lastIndexOf(".")
  if (lastDot === -1) return null

  const payload = token.slice(0, lastDot)
  const signatureHex = token.slice(lastDot + 1)
  if (!payload || !signatureHex || signatureHex.length !== 64) return null

  try {
    const secret = getSessionSecret()
    const enc = new TextEncoder()
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    )

    let isValid = await globalThis.crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      hexToBytes(signatureHex),
      enc.encode(payload)
    )

    // Graceful secret rotation: if primary SESSION_SECRET verification fails, check fallback secret
    if (!isValid && process.env.SESSION_SECRET) {
      const fallback = process.env.INSTAGRAM_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (fallback) {
        const fallbackKey = await globalThis.crypto.subtle.importKey(
          "raw",
          enc.encode(fallback),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["verify"]
        )
        isValid = await globalThis.crypto.subtle.verify(
          "HMAC",
          fallbackKey,
          hexToBytes(signatureHex),
          enc.encode(payload)
        )
      }
    }

    if (!isValid) return null

    const data = JSON.parse(payload) as EdgeSessionData
    if (!data || !data.userId) return null

    const now = Date.now()

    // 1. Enforce absolute maximum lifetime
    const absoluteDeadline =
      data.exp || (data.iat ? data.iat + SESSION_MAX_AGE_SECONDS * 1000 : null)
    if (absoluteDeadline && now > absoluteDeadline) return null

    // 2. Enforce idle timeout
    if (data.lastActive && now - data.lastActive > SESSION_IDLE_TIMEOUT_MS) return null

    // 3. Local edge revocation check
    if (data.sid && edgeRevokedSids.has(data.sid)) return null

    // 4. Persistent Revocation Check against Supabase
    const cacheKey = data.sid || `${data.userId}:${data.iat}`
    const cached = edgeSessionValidationCache.get(cacheKey)
    if (cached && now - cached.timestamp < EDGE_CACHE_TTL_MS) {
      if (!cached.valid) return null
      return data
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/users?id=eq.${encodeURIComponent(data.userId)}&select=id,ai_context`,
          {
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            signal: AbortSignal.timeout(3000),
          }
        )

        if (res.ok) {
          const rows = await res.json()
          if (!rows || rows.length === 0) {
            edgeSessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
            return null
          }

          const userRow = rows[0]
          if (userRow?.ai_context) {
            try {
              const ctx = JSON.parse(userRow.ai_context)
              const revokedAt = ctx.session_revoked_at ? Number(ctx.session_revoked_at) : 0
              if (revokedAt && data.iat && data.iat <= revokedAt) {
                edgeSessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
                return null
              }
              if (data.sid && Array.isArray(ctx.revoked_sids) && ctx.revoked_sids.includes(data.sid)) {
                edgeSessionValidationCache.set(cacheKey, { valid: false, timestamp: now })
                return null
              }
            } catch {}
          }

          edgeSessionValidationCache.set(cacheKey, { valid: true, timestamp: now })
        }
      } catch (err) {
        // If Supabase check times out or has temporary network error, log and allow cryptographic fallback
        console.warn("[EdgeSession] Revocation check network notice:", err)
      }
    }

    return data
  } catch {
    return null
  }
}
