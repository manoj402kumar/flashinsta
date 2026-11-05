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

/**
 * Edge-compatible session token verifier using standard W3C Web Cryptography API.
 * Contains no Node.js runtime dependencies and executes safely in Next.js Edge Middleware.
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

    // 1. Enforce absolute maximum lifetime (14 days)
    if (data.exp && now > data.exp) return null

    // 2. Enforce idle timeout (24 hours)
    if (data.lastActive && now - data.lastActive > 24 * 60 * 60 * 1000) return null

    return data
  } catch {
    return null
  }
}
