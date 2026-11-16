import test from "node:test"
import assert from "node:assert/strict"
import { sanitizeLogData, logger } from "../lib/logger.ts"

test("SanitizeLogData redacts sensitive keys recursively", () => {
  const payload = {
    userId: "usr_123",
    email: "creator@example.com",
    access_token: "EAABxyz1234567890secretToken",
    instagram_secret: "superSecretAppSecret",
    nested: {
      password: "myPassword123",
      apiKey: "secret_api_key",
      safeValue: 42,
    },
  }

  const sanitized = sanitizeLogData(payload)
  assert.equal(sanitized.userId, "usr_123")
  assert.equal(sanitized.email, "creator@example.com")
  assert.equal(sanitized.access_token, "EAAB...[REDACTED]")
  assert.equal(sanitized.instagram_secret, "supe...[REDACTED]")
  assert.equal(sanitized.nested.password, "myPa...[REDACTED]")
  assert.equal(sanitized.nested.apiKey, "secr...[REDACTED]")
  assert.equal(sanitized.nested.safeValue, 42)
})

test("Logger handles error objects and context cleanly without throwing", () => {
  assert.doesNotThrow(() => {
    logger.info("Test info message", { subsystem: "test", route: "/api/test" })
    logger.warn("Test warn message", { subsystem: "test" })
    logger.error("Test error message", new Error("Simulated failure"), { subsystem: "test" })
    logger.critical("Test critical incident", new Error("Fatal failure"), { subsystem: "test" })
  })
})
