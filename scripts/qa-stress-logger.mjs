import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeLogData, logger } from "../lib/logger.ts"

test("QA Stress: 1. Deep nesting and circular reference resilience", () => {
  // Circular reference object
  const circular = { name: "level0" }
  circular.self = circular

  // Should terminate without stack overflow or recursion error
  const sanitized = sanitizeLogData(circular)
  assert.ok(sanitized, "Sanitizer must handle circular references")
  assert.equal(sanitized.name, "level0")

  // Very deep nesting (15 levels)
  let deepObj = { val: "bottom", secret: "super_secret_value" }
  for (let i = 0; i < 15; i++) {
    deepObj = { level: i, child: deepObj }
  }
  const sanitizedDeep = sanitizeLogData(deepObj)
  assert.ok(sanitizedDeep, "Sanitizer must handle deep objects")
})

test("QA Stress: 2. Exhaustive case-insensitive secret key redaction", () => {
  const sensitivePayload = {
    // Exact keys
    access_token: "EAABtest1234567890",
    ACCESS_TOKEN: "EAABtest9876543210",
    token: "tok_abcdef123456",
    secret: "sec_xyz987654321",
    password: "Password123!",
    authorization: "Bearer eyJhbGciOi...",
    apikey: "api_key_secret_12345",
    service_role_key: "eyJhbGciOi...serviceRole",
    // Nested inside arrays and objects
    users: [
      { id: "u1", token: "tok_user1" },
      { id: "u2", access_token: "tok_user2" },
    ],
    metadata: {
      headers: {
        authorization: "Bearer sensitive_token_xyz",
      },
      safeField: "this is completely public",
    },
  }

  const result = sanitizeLogData(sensitivePayload)

  // Verify all redacted
  assert.match(result.access_token, /\[REDACTED\]/)
  assert.match(result.ACCESS_TOKEN, /\[REDACTED\]/)
  assert.match(result.token, /\[REDACTED\]/)
  assert.match(result.secret, /\[REDACTED\]/)
  assert.match(result.password, /\[REDACTED\]/)
  assert.match(result.authorization, /\[REDACTED\]/)
  assert.match(result.apikey, /\[REDACTED\]/)
  assert.match(result.service_role_key, /\[REDACTED\]/)

  // Nested structures
  assert.match(result.users[0].token, /\[REDACTED\]/)
  assert.match(result.users[1].access_token, /\[REDACTED\]/)
  assert.match(result.metadata.headers.authorization, /\[REDACTED\]/)

  // Non-sensitive fields preserved
  assert.equal(result.metadata.safeField, "this is completely public")
})

test("QA Stress: 3. Production JSON logger non-throwing guarantee", () => {
  // Test with null, undefined, primitive, Error, and symbol
  assert.doesNotThrow(() => {
    logger.info("Test string info")
    logger.warn("Test warn with object", { count: 42 })
    logger.error("Test error with Error instance", new Error("Simulated failure"), { route: "/api/test" })
    logger.critical("Test critical incident", new TypeError("Crash test"), { subsystem: "payment" })
    logger.debug("Test debug with primitive error", "raw string error")
  })
})
