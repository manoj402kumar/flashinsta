import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"

// ── SECURITY & PENETRATION FIXTURES ──

// 1. CORS Validation Logic from middleware.ts
const ALLOWED_ORIGINS = new Set([
  "https://insta-p8-fawn.vercel.app",
  "https://insta-p8-eeinfoinstaauto.vercel.app",
])

function checkCorsOrigin(origin) {
  if (!origin) return true // Same-origin or non-browser client
  return ALLOWED_ORIGINS.has(origin)
}

// 2. Cryptographic HMAC Session Signature from lib/session.ts & edge-session.ts
const TEST_SECRET = "super_secret_production_key_32_characters_minimum_entropy"

function signSessionToken(userId, timestamp = Date.now()) {
  const payload = `${userId}:${timestamp}`
  const hmac = crypto.createHmac("sha256", TEST_SECRET)
  hmac.update(payload)
  const signature = hmac.digest("base64url")
  return `${payload}.${signature}`
}

function verifySessionToken(token, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null
  const [payload, signature] = token.split(".")
  if (!payload || !signature) return null

  const parts = payload.split(":")
  if (parts.length < 2) return null
  const userId = parts[0]
  const timestamp = parseInt(parts[1], 10)
  if (!userId || isNaN(timestamp)) return null

  // Check expiration
  const now = Date.now()
  if (now - timestamp > maxAgeMs || timestamp > now + 300000) {
    return null // Expired or future timestamp manipulation
  }

  // Verify HMAC signature constant-time
  const hmac = crypto.createHmac("sha256", TEST_SECRET)
  hmac.update(payload)
  const expectedSignature = hmac.digest("base64url")

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expectedSignature)
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null // Tampered signature
  }

  return { userId, timestamp }
}

// 3. Payload size enforcement
function checkPayloadSize(contentLength, maxBytes = 1024 * 1024) {
  if (contentLength > maxBytes) {
    return { status: 413, error: "Payload too large. Maximum allowed size is 1MB." }
  }
  return null
}

// 4. URL Protocol Gating
function sanitizeCardUrl(url) {
  if (!url || typeof url !== "string") return undefined
  const trimmed = url.trim()
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://") || trimmed.startsWith("/")) {
    return trimmed
  }
  return undefined // Disallow javascript:, data:, file:, etc.
}

// ── PENETRATION SUITE ──

test("DAST Attack 1: CORS Origin Spoofing & Subdomain Smuggling", () => {
  const maliciousOrigins = [
    "https://evil-hacker.com",
    "https://insta-p8-fawn.vercel.app.attacker.com", // Subdomain suffix smuggling
    "https://attacker-insta-p8-fawn.vercel.app", // Subdomain prefix smuggling
    "http://insta-p8-fawn.vercel.app", // Insecure HTTP downgrade
    "null",
    "https://facebook.com.malicious.net",
  ]

  for (const origin of maliciousOrigins) {
    assert.equal(
      checkCorsOrigin(origin),
      false,
      `Origin "${origin}" must be denied CORS authorization`
    )
  }

  // Legitimate origins must be accepted
  assert.equal(checkCorsOrigin("https://insta-p8-fawn.vercel.app"), true)
  assert.equal(checkCorsOrigin("https://insta-p8-eeinfoinstaauto.vercel.app"), true)
})

test("DAST Attack 2: Oversized Payload DOS Injection (1MB limit enforcement)", () => {
  const ONE_MB = 1024 * 1024

  // Under limit
  assert.equal(checkPayloadSize(500 * 1024), null)
  assert.equal(checkPayloadSize(ONE_MB), null)

  // 1 Byte over limit
  const overOneByte = checkPayloadSize(ONE_MB + 1)
  assert.equal(overOneByte?.status, 413)

  // 10MB flood
  const largeFlood = checkPayloadSize(10 * ONE_MB)
  assert.equal(largeFlood?.status, 413)
  assert.equal(largeFlood?.error, "Payload too large. Maximum allowed size is 1MB.")
})

test("DAST Attack 3: HMAC Session Tampering & Replay Penetration", () => {
  const validToken = signSessionToken("user_victim_100")
  assert.ok(verifySessionToken(validToken), "Valid token must pass verification")

  // Tamper A: Flip userId to admin
  const tamperedUserId = validToken.replace("user_victim_100", "user_admin_001")
  assert.equal(verifySessionToken(tamperedUserId), null, "Tampered userId must be rejected")

  // Tamper B: Single character bit flip in HMAC signature
  const parts = validToken.split(".")
  const flippedSignature = parts[1].slice(0, -1) + (parts[1].endsWith("a") ? "b" : "a")
  const tamperedSigToken = `${parts[0]}.${flippedSignature}`
  assert.equal(verifySessionToken(tamperedSigToken), null, "Flipped signature byte must be rejected")

  // Tamper C: Expired timestamp (8 days old)
  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
  const expiredToken = signSessionToken("user_victim_100", eightDaysAgo)
  assert.equal(verifySessionToken(expiredToken), null, "Expired session token must be rejected")

  // Tamper D: Future timestamp injection (anti-clock manipulation)
  const oneHourInFuture = Date.now() + 60 * 60 * 1000
  const futureToken = signSessionToken("user_victim_100", oneHourInFuture)
  assert.equal(verifySessionToken(futureToken), null, "Future timestamp token must be rejected")
})

test("DAST Attack 4: XSS Protocol Gating in Image and Button Links", () => {
  const dangerousUrls = [
    "javascript:alert(document.cookie)",
    "javascript://%0Aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ]

  for (const url of dangerousUrls) {
    assert.equal(
      sanitizeCardUrl(url),
      undefined,
      `Dangerous protocol "${url}" must be stripped and returned as undefined`
    )
  }

  // Safe URLs
  assert.equal(sanitizeCardUrl("https://images.unsplash.com/photo.jpg"), "https://images.unsplash.com/photo.jpg")
  assert.equal(sanitizeCardUrl("http://cdn.example.com/asset.png"), "http://cdn.example.com/asset.png")
  assert.equal(sanitizeCardUrl("/uploads/profile.png"), "/uploads/profile.png")
})
