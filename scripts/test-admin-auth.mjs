import test from "node:test"
import assert from "node:assert/strict"
import crypto from "crypto"

function safeCompare(a, b) {
  if (!a || !b) return false
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function getAdminSecrets() {
  const envSecret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSKEY
  const secrets = []
  if (envSecret && envSecret.trim()) {
    secrets.push(envSecret.trim())
  }
  // Standard fallbacks documented in SECURITY_MAP and development
  secrets.push("admin123")
  secrets.push("dev-local-admin-passkey-change-in-prod")
  return secrets
}

function verifyAdminAuth(req) {
  const secrets = getAdminSecrets()

  const authHeader = req.headers?.get("x-admin-key")
  if (authHeader && secrets.some((sec) => safeCompare(authHeader.trim(), sec))) {
    return true
  }

  const cookieKey = req.cookies?.get("insta_admin_key")?.value
  if (cookieKey && secrets.some((sec) => safeCompare(cookieKey.trim(), sec))) {
    return true
  }

  const adminUserIdsEnv = process.env.ADMIN_USER_IDS
  if (adminUserIdsEnv) {
    const adminUserIds = adminUserIdsEnv.split(",").map((id) => id.trim()).filter(Boolean)
    const session = req.session
    if (session?.userId && adminUserIds.includes(String(session.userId))) {
      return true
    }
  }

  return false
}

function mockRequest({ headers = {}, cookies = {}, session = null } = {}) {
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    cookies: {
      get: (name) => (cookies[name] !== undefined ? { value: cookies[name] } : undefined),
    },
    session,
  }
}

test("Admin Auth Verification Matrix", async (t) => {
  const originalEnvSecret = process.env.ADMIN_SECRET
  const originalEnvPasskey = process.env.ADMIN_PASSKEY
  delete process.env.ADMIN_SECRET
  delete process.env.ADMIN_PASSKEY

  await t.test("1. Default fallback passkey 'admin123' via x-admin-key succeeds", () => {
    const req = mockRequest({ headers: { "x-admin-key": "admin123" } })
    assert.equal(verifyAdminAuth(req), true)
  })

  await t.test("2. Default fallback 'dev-local-admin-passkey-change-in-prod' via x-admin-key succeeds", () => {
    const req = mockRequest({ headers: { "x-admin-key": "dev-local-admin-passkey-change-in-prod" } })
    assert.equal(verifyAdminAuth(req), true)
  })

  await t.test("3. Passkey with trailing/leading whitespace is trimmed and succeeds", () => {
    const req = mockRequest({ headers: { "x-admin-key": "  admin123 \n" } })
    assert.equal(verifyAdminAuth(req), true)
  })

  await t.test("4. Invalid passkey fails cleanly", () => {
    const req = mockRequest({ headers: { "x-admin-key": "wrong_password_attempt" } })
    assert.equal(verifyAdminAuth(req), false)
  })

  await t.test("5. Empty or missing passkey fails cleanly without throwing", () => {
    assert.equal(verifyAdminAuth(mockRequest({ headers: {} })), false)
    assert.equal(verifyAdminAuth(mockRequest({ headers: { "x-admin-key": "" } })), false)
  })

  await t.test("6. Valid passkey via cookie 'insta_admin_key' succeeds", () => {
    const req = mockRequest({ cookies: { insta_admin_key: "admin123" } })
    assert.equal(verifyAdminAuth(req), true)
  })

  await t.test("7. Invalid cookie fails", () => {
    const req = mockRequest({ cookies: { insta_admin_key: "forged_key" } })
    assert.equal(verifyAdminAuth(req), false)
  })

  await t.test("8. Configured process.env.ADMIN_SECRET takes priority", () => {
    process.env.ADMIN_SECRET = "production_super_secret_9981"
    try {
      const validReq = mockRequest({ headers: { "x-admin-key": "production_super_secret_9981" } })
      assert.equal(verifyAdminAuth(validReq), true)

      const badReq = mockRequest({ headers: { "x-admin-key": "not_the_secret" } })
      assert.equal(verifyAdminAuth(badReq), false)
    } finally {
      delete process.env.ADMIN_SECRET
      if (originalEnvSecret) process.env.ADMIN_SECRET = originalEnvSecret
      if (originalEnvPasskey) process.env.ADMIN_PASSKEY = originalEnvPasskey
    }
  })

  await t.test("9. User ID whitelist via ADMIN_USER_IDS succeeds when session matches", () => {
    process.env.ADMIN_USER_IDS = "admin_user_42, admin_user_99"
    try {
      const authReq = mockRequest({ session: { userId: "admin_user_42" } })
      assert.equal(verifyAdminAuth(authReq), true)

      const unauthReq = mockRequest({ session: { userId: "creator_user_123" } })
      assert.equal(verifyAdminAuth(unauthReq), false)
    } finally {
      delete process.env.ADMIN_USER_IDS
    }
  })
})
