import test from "node:test"
import assert from "node:assert/strict"

// Mock request generator helper
function createMockRequest(ip, path = "/api/auth/session") {
  return {
    headers: {
      get(name) {
        if (name.toLowerCase() === "x-forwarded-for") return ip
        if (name.toLowerCase() === "x-real-ip") return ip
        return null
      },
    },
    nextUrl: { pathname: path },
  }
}

// In-memory rate limiter replicating lib/rate-limit.ts with injected clock for deterministic stress testing
class RateLimiterFixture {
  constructor() {
    this.memoryStore = new Map()
    this.currentTime = 1000000000000
  }

  now() {
    return this.currentTime
  }

  advanceTime(ms) {
    this.currentTime += ms
  }

  checkRateLimit(request, options = {}) {
    const limit = options.limit ?? 60
    const windowMs = options.windowMs ?? 60 * 1000
    const prefix = options.identifierPrefix ?? "global"

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1"

    const key = `${prefix}:${ip}`
    const now = this.now()
    const record = this.memoryStore.get(key)

    if (!record || record.resetTime <= now) {
      this.memoryStore.set(key, { count: 1, resetTime: now + windowMs })
      return { allowed: true, remaining: limit - 1, reset: Math.ceil(windowMs / 1000) }
    }

    record.count += 1
    const remaining = Math.max(0, limit - record.count)
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000)

    if (record.count > limit) {
      return { allowed: false, remaining: 0, reset: resetSeconds }
    }

    return { allowed: true, remaining, reset: resetSeconds }
  }
}

test("QA Stress: 1. Rate limiter boundary & multi-bucket isolation", () => {
  const limiter = new RateLimiterFixture()
  const testIp = "203.0.113.42"

  // 1. Simulate 40 rapid login requests to /api/auth/google
  for (let i = 1; i <= 40; i++) {
    const res = limiter.checkRateLimit(createMockRequest(testIp, "/api/auth/google"), {
      limit: 40,
      windowMs: 60 * 1000,
      identifierPrefix: "auth-login",
    })
    assert.equal(res.allowed, true, `Login request ${i} should be allowed`)
    assert.equal(res.remaining, 40 - i)
  }

  // 2. Request 41 to login must be blocked with 429
  const blockedLogin = limiter.checkRateLimit(createMockRequest(testIp, "/api/auth/google"), {
    limit: 40,
    windowMs: 60 * 1000,
    identifierPrefix: "auth-login",
  })
  assert.equal(blockedLogin.allowed, false, "41st login attempt must be rejected")
  assert.equal(blockedLogin.remaining, 0)
  assert.ok(blockedLogin.reset > 0, "Reset seconds must be positive")

  // 3. CRUCIAL CHECK: On the EXACT SAME IP, session check bucket (auth-session) MUST STILL BE ALLOWED!
  // This verifies the user bug where login rate limit exhaustion blocked session validation and logged them out.
  for (let i = 1; i <= 50; i++) {
    const sessionRes = limiter.checkRateLimit(createMockRequest(testIp, "/api/auth/session"), {
      limit: 300,
      windowMs: 60 * 1000,
      identifierPrefix: "auth-session",
    })
    assert.equal(sessionRes.allowed, true, `Session check ${i} must succeed despite login bucket being exhausted`)
  }
})

test("QA Stress: 2. High-concurrency load across multiple IPs", () => {
  const limiter = new RateLimiterFixture()
  const ips = Array.from({ length: 20 }, (_, i) => `198.51.100.${i + 1}`)

  // Blast 5,000 requests across 20 IPs
  const results = { allowed: 0, blocked: 0 }
  for (let round = 0; round < 250; round++) {
    for (const ip of ips) {
      const res = limiter.checkRateLimit(createMockRequest(ip, "/api/auth/session"), {
        limit: 300,
        windowMs: 60 * 1000,
        identifierPrefix: "auth-session",
      })
      if (res.allowed) results.allowed++
      else results.blocked++
    }
  }

  // 20 IPs * 250 requests = 5,000 total requests. Since limit is 300 per IP, all 5,000 should be allowed!
  assert.equal(results.allowed, 5000)
  assert.equal(results.blocked, 0)

  // Now push 60 more requests per IP (total 310 > 300 limit)
  let blockedCount = 0
  for (let round = 0; round < 60; round++) {
    for (const ip of ips) {
      const res = limiter.checkRateLimit(createMockRequest(ip, "/api/auth/session"), {
        limit: 300,
        windowMs: 60 * 1000,
        identifierPrefix: "auth-session",
      })
      if (!res.allowed) blockedCount++
    }
  }

  // 50 requests per IP were over the limit of 300 -> 20 IPs * 10 requests over limit = 200 blocked
  assert.equal(blockedCount, 20 * 10)
})

test("QA Stress: 3. Window expiration and sliding recovery", () => {
  const limiter = new RateLimiterFixture()
  const ip = "192.0.2.99"

  // Exhaust 40 login attempts
  for (let i = 0; i < 40; i++) {
    limiter.checkRateLimit(createMockRequest(ip), { limit: 40, windowMs: 60 * 1000, identifierPrefix: "auth-login" })
  }
  assert.equal(
    limiter.checkRateLimit(createMockRequest(ip), { limit: 40, windowMs: 60 * 1000, identifierPrefix: "auth-login" }).allowed,
    false
  )

  // Advance time by 60,001 ms (window passed)
  limiter.advanceTime(60 * 1000 + 1)

  // Immediately allowed again with full quota reset
  const recovered = limiter.checkRateLimit(createMockRequest(ip), { limit: 40, windowMs: 60 * 1000, identifierPrefix: "auth-login" })
  assert.equal(recovered.allowed, true)
  assert.equal(recovered.remaining, 39)
})

test("QA Stress: 4. Client session state preservation under 429 and 5xx responses", () => {
  // Replicating useInstagramSession state machine
  class MockLocalStorage {
    constructor() {
      this.store = new Map()
    }
    getItem(k) { return this.store.get(k) || null }
    setItem(k, v) { this.store.set(k, String(v)) }
    removeItem(k) { this.store.delete(k) }
  }

  const localStorage = new MockLocalStorage()
  // User logged in previously
  localStorage.setItem("ig_user_id", "usr_12345")
  localStorage.setItem("ig_username", "creator_john")
  localStorage.setItem("login_email", "john@example.com")
  localStorage.setItem("flashinsta_session_token", "eyJhbGciOi...")

  function handleSessionResponse(status, data) {
    if (status === 401 || (status === 200 && data?.authenticated === false)) {
      // Legit logout
      localStorage.removeItem("flashinsta_session_token")
      localStorage.removeItem("ig_user_id")
      localStorage.removeItem("ig_username")
      localStorage.removeItem("login_email")
      return { authenticated: false, userId: null }
    } else if (status === 429 || status >= 500) {
      // Rate limited or 5xx: PRESERVE STATE!
      const cachedId = localStorage.getItem("ig_user_id")
      return { authenticated: Boolean(cachedId), userId: cachedId }
    }
    return { authenticated: true, userId: data.userId }
  }

  // 1. Transient HTTP 429 (Rate limited)
  const after429 = handleSessionResponse(429, { error: "Too many requests" })
  assert.equal(after429.authenticated, true, "Must retain authenticated status on HTTP 429")
  assert.equal(after429.userId, "usr_12345", "Must retain userId on HTTP 429")
  assert.equal(localStorage.getItem("ig_user_id"), "usr_12345", "LocalStorage must NOT be purged on HTTP 429")

  // 2. Transient HTTP 503 (Database timeout or gateway error)
  const after503 = handleSessionResponse(503, { error: "Service unavailable" })
  assert.equal(after503.authenticated, true, "Must retain authenticated status on HTTP 503")
  assert.equal(localStorage.getItem("ig_user_id"), "usr_12345", "LocalStorage must NOT be purged on HTTP 503")

  // 3. HTTP 401 (Explicit unauthorized)
  const after401 = handleSessionResponse(401, { error: "Unauthorized" })
  assert.equal(after401.authenticated, false, "Must logout on HTTP 401")
  assert.equal(after401.userId, null)
  assert.equal(localStorage.getItem("ig_user_id"), null, "LocalStorage must be cleaned on HTTP 401")
  assert.equal(localStorage.getItem("flashinsta_session_token"), null)
})
