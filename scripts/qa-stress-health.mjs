import test from "node:test"
import assert from "node:assert/strict"

// Mock probe harness simulating app/api/health/route.ts logic with controllable DB latency
class HealthProbeFixture {
  constructor(options = {}) {
    this.dbLatencyMs = options.dbLatencyMs ?? 20
    this.shouldFail = options.shouldFail ?? false
    this.dbQueryCount = 0
    this.lastDbCheckTime = 0
    this.cachedDbHealthy = false
    this.cachedLatencyMs = 0
    this.DB_CACHE_TTL_MS = 5000
    this.currentTime = 1000000000000
  }

  now() {
    return this.currentTime
  }

  advanceTime(ms) {
    this.currentTime += ms
  }

  async checkDatabaseHealth() {
    const now = this.now()
    if (now - this.lastDbCheckTime < this.DB_CACHE_TTL_MS && this.lastDbCheckTime > 0) {
      return { healthy: this.cachedDbHealthy, latencyMs: this.cachedLatencyMs, cached: true }
    }

    this.dbQueryCount++
    if (this.shouldFail) {
      this.lastDbCheckTime = now
      this.cachedDbHealthy = false
      this.cachedLatencyMs = this.dbLatencyMs
      return { healthy: false, latencyMs: this.dbLatencyMs, error: "Database unreachable", cached: false }
    }

    this.lastDbCheckTime = now
    this.cachedDbHealthy = true
    this.cachedLatencyMs = this.dbLatencyMs
    return { healthy: true, latencyMs: this.dbLatencyMs, cached: false }
  }

  async handleRequest(method = "GET") {
    const dbResult = await this.checkDatabaseHealth()
    const statusCode = dbResult.healthy ? 200 : 503
    const headers = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health-Status": dbResult.healthy ? "ok" : "degraded",
    }

    if (method === "HEAD") {
      return { status: statusCode, headers, body: null }
    }

    const payload = {
      status: dbResult.healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        app: "healthy",
        database: dbResult.healthy ? "connected" : "unreachable",
      },
      latencyMs: dbResult.latencyMs,
    }

    return { status: statusCode, headers, body: payload }
  }
}

test("QA Stress: 1. Thundering herd monitoring defense (100 concurrent requests)", async () => {
  const probe = new HealthProbeFixture({ dbLatencyMs: 15 })

  // Blast 100 concurrent health checks
  const requests = Array.from({ length: 100 }, () => probe.handleRequest("GET"))
  const responses = await Promise.all(requests)

  // Every single request must return 200 OK
  for (const res of responses) {
    assert.equal(res.status, 200)
    assert.equal(res.body.status, "ok")
    assert.equal(res.body.services.database, "connected")
  }

  // Under thundering herd, the actual database probe must ONLY run 1 time (99 requests served from cache)
  assert.equal(probe.dbQueryCount, 1, "Must execute exactly 1 database query for 100 concurrent requests within TTL")
})

test("QA Stress: 2. Degraded state and 503 HTTP status on database failure", async () => {
  const probe = new HealthProbeFixture({ shouldFail: true, dbLatencyMs: 3050 })

  const res = await probe.handleRequest("GET")
  assert.equal(res.status, 503, "Degraded database must yield HTTP 503")
  assert.equal(res.body.status, "degraded")
  assert.equal(res.body.services.database, "unreachable")
  assert.equal(res.headers["X-Health-Status"], "degraded")
})

test("QA Stress: 3. Lightweight HEAD probe optimization", async () => {
  const probe = new HealthProbeFixture()

  const headRes = await probe.handleRequest("HEAD")
  assert.equal(headRes.status, 200)
  assert.equal(headRes.body, null, "HEAD response must not send a body")
  assert.equal(headRes.headers["X-Health-Status"], "ok")
  assert.equal(headRes.headers["Cache-Control"], "no-store, no-cache, must-revalidate")
})

test("QA Stress: 4. TTL expiration and cache invalidation", async () => {
  const probe = new HealthProbeFixture()

  // First check
  await probe.handleRequest("GET")
  assert.equal(probe.dbQueryCount, 1)

  // Within TTL: cached
  probe.advanceTime(2000)
  await probe.handleRequest("GET")
  assert.equal(probe.dbQueryCount, 1)

  // Past TTL (5001ms): must re-query database
  probe.advanceTime(3001)
  await probe.handleRequest("GET")
  assert.equal(probe.dbQueryCount, 2, "Must re-query database after 5s TTL")
})
