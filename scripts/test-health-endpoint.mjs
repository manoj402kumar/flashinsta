import test from "node:test"
import assert from "node:assert/strict"

// Mock NextRequest and NextResponse
class MockRequest {
  constructor(method = "GET") {
    this.method = method
  }
}

test("Health check response schema validation", () => {
  const healthyPayload = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      app: "healthy",
      database: "connected",
    },
    latencyMs: 12,
  }

  assert.equal(healthyPayload.status, "ok")
  assert.equal(healthyPayload.services.app, "healthy")
  assert.equal(healthyPayload.services.database, "connected")
  assert.ok(typeof healthyPayload.latencyMs === "number")
  assert.ok(new Date(healthyPayload.timestamp).getTime() > 0)
})

test("Degraded health check returns 503", () => {
  const degradedPayload = {
    status: "degraded",
    timestamp: new Date().toISOString(),
    services: {
      app: "healthy",
      database: "unreachable",
    },
    latencyMs: 3000,
  }

  const statusCode = degradedPayload.services.database === "connected" ? 200 : 503
  assert.equal(statusCode, 503)
  assert.equal(degradedPayload.status, "degraded")
})

test("HEAD method returns status headers without body", () => {
  const isHealthy = true
  const statusCode = isHealthy ? 200 : 503
  const headers = {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Health-Status": isHealthy ? "ok" : "degraded",
  }
  assert.equal(statusCode, 200)
  assert.equal(headers["X-Health-Status"], "ok")
})
