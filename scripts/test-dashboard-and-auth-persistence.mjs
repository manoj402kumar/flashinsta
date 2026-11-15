import assert from "node:assert"
import crypto from "node:crypto"

console.log("========================================================")
console.log("VERIFYING DASHBOARD METRICS & AUTH SESSION PERSISTENCE")
console.log("========================================================\n")

const secret =
  process.env.SESSION_SECRET ||
  process.env.INSTAGRAM_APP_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "dev-only-local-secret-do-not-use-in-production"

const BASE_URL = "http://127.0.0.1:3000"
const TEST_USER_ID = "17934631767196"

function createSignedToken(payload) {
  const payloadStr = JSON.stringify(payload)
  const hmac = crypto.createHmac("sha256", secret).update(payloadStr).digest("hex")
  return `${payloadStr}.${hmac}`
}

async function run() {
  const now = Date.now()

  // -------------------------------------------------------------------
  // TEST 1: Session Recovery with Device Token (Authorization: Bearer)
  // -------------------------------------------------------------------
  console.log("[Test 1] Testing Session Recovery via Device Token without Cookies...")
  const validPayload = {
    userId: TEST_USER_ID,
    username: "Veera Babu",
    email: "find83097@gmail.com",
    profilePic: null,
    sid: crypto.randomUUID(),
    iat: now,
    exp: now + 90 * 24 * 60 * 60 * 1000,
    lastActive: now,
  }
  const deviceToken = createSignedToken(validPayload)

  // Call /api/auth/session with NO COOKIE, only Bearer device token in header
  const authRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${deviceToken}`,
    },
  })

  assert.strictEqual(authRes.status, 200, `Expected 200 from /api/auth/session. Got ${authRes.status}`)
  const authData = await authRes.json()
  assert.strictEqual(authData.authenticated, true, "Session must authenticate via Bearer token")
  assert.strictEqual(String(authData.userId), TEST_USER_ID, "UserId must match authenticated account")
  assert.ok(authData.token, "Response must include refreshed session token")

  // Verify Set-Cookie header was issued to re-establish browser cookie
  const setCookie = authRes.headers.get("set-cookie")
  assert.ok(setCookie, "Server must issue Set-Cookie header when recovering session from device token")
  assert.ok(setCookie.includes("Max-Age="), "Cookie must have Max-Age")
  console.log("✓ Test 1 Passed: Device token successfully recovers session, sets cookie, and identifies account.")

  // -------------------------------------------------------------------
  // TEST 2: Rejection of Revoked / Invalid Device Token
  // -------------------------------------------------------------------
  console.log("\n[Test 2] Testing Rejection of Revoked / Tampered Device Token...")
  const tamperedToken = `${deviceToken.slice(0, -10)}0000000000`
  const tamperedRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: {
      Authorization: `Bearer ${tamperedToken}`,
    },
  })
  const tamperedData = await tamperedRes.json()
  assert.strictEqual(tamperedData.authenticated, false, "Tampered token must be rejected")
  console.log("✓ Test 2 Passed: Tampered token safely rejected with authenticated: false.")

  // -------------------------------------------------------------------
  // TEST 3: Dashboard Numbers & Metrics Verification
  // -------------------------------------------------------------------
  console.log("\n[Test 3] Testing Dashboard Metrics API (/api/dashboard/stats)...")
  const statsRes = await fetch(`${BASE_URL}/api/dashboard/stats?userId=${TEST_USER_ID}`, {
    headers: {
      Authorization: `Bearer ${deviceToken}`,
    },
  })

  assert.strictEqual(statsRes.status, 200, `Expected 200 from /api/dashboard/stats. Got ${statsRes.status}`)
  const statsData = await statsRes.json()

  // Verify nested metrics object for DashboardPage
  assert.ok(statsData.metrics, "Response must include metrics object")
  assert.strictEqual(typeof statsData.metrics.totalAutomations, "number", "metrics.totalAutomations must be number")
  assert.strictEqual(typeof statsData.metrics.activeTriggers, "number", "metrics.activeTriggers must be number")
  assert.strictEqual(typeof statsData.metrics.audienceReached, "number", "metrics.audienceReached must be number")
  assert.strictEqual(typeof statsData.metrics.messagesSent, "number", "metrics.messagesSent must be number")

  // Check numbers are greater than 0 for active user
  assert.ok(statsData.metrics.totalAutomations > 0, "totalAutomations must be > 0 for active user")
  assert.ok(statsData.metrics.audienceReached > 0, "audienceReached must be > 0 for active user")
  assert.ok(statsData.metrics.messagesSent > 0, "messagesSent must be > 0 for active user")

  // Verify flat backwards-compatible properties for Analytics
  assert.strictEqual(statsData.automationsCount, statsData.metrics.totalAutomations)
  assert.strictEqual(statsData.activeCount, statsData.metrics.activeTriggers)
  assert.strictEqual(statsData.audienceCount, statsData.metrics.audienceReached)
  assert.strictEqual(statsData.messagesSent, statsData.metrics.messagesSent)

  console.log("✓ Test 3 Passed: All 4 key dashboard metrics verified with real numbers:")
  console.log(`   - Workflows (totalAutomations): ${statsData.metrics.totalAutomations}`)
  console.log(`   - Active triggers: ${statsData.metrics.activeTriggers}`)
  console.log(`   - People reached (audienceReached): ${statsData.metrics.audienceReached}`)
  console.log(`   - Messages sent: ${statsData.metrics.messagesSent}`)

  // -------------------------------------------------------------------
  // TEST 4: Recent Conversations / Interactions Verification
  // -------------------------------------------------------------------
  console.log("\n[Test 4] Testing Recent Conversations Structure...")
  assert.ok(Array.isArray(statsData.recentActivity), "recentActivity must be an array")
  assert.ok(statsData.recentActivity.length > 0, "recentActivity must contain items for active account")

  const firstActivity = statsData.recentActivity[0]
  assert.ok(firstActivity.id, "Activity must have an id")
  assert.ok(firstActivity.content, "Activity must have content")
  assert.ok(firstActivity.created_at, "Activity must have created_at timestamp")
  assert.ok(firstActivity.recipient, "Activity must have recipient object")
  assert.ok(firstActivity.recipient.recipient_username, "Activity must have recipient.recipient_username")
  console.log(`✓ Test 4 Passed: Recent activity verified (${statsData.recentActivity.length} conversations loaded). Latest: @${firstActivity.recipient.recipient_username}: "${firstActivity.content}"`)

  // -------------------------------------------------------------------
  // TEST 5: FTUX (Zero-state) User Verification
  // -------------------------------------------------------------------
  console.log("\n[Test 5] Testing FTUX Zero-State User Dashboard Numbers...")
  const FTUX_USER_ID = "17935556715285"
  const ftuxPayload = {
    userId: FTUX_USER_ID,
    username: "manojkumar",
    email: "manojkumar@example.com",
    sid: crypto.randomUUID(),
    iat: now,
    exp: now + 3600 * 1000,
    lastActive: now,
  }
  const ftuxToken = createSignedToken(ftuxPayload)

  const ftuxStatsRes = await fetch(`${BASE_URL}/api/dashboard/stats?userId=${FTUX_USER_ID}`, {
    headers: {
      Authorization: `Bearer ${ftuxToken}`,
    },
  })

  assert.strictEqual(ftuxStatsRes.status, 200)
  const ftuxData = await ftuxStatsRes.json()
  assert.strictEqual(ftuxData.metrics.totalAutomations, 0, "FTUX workflows must be 0")
  assert.strictEqual(ftuxData.metrics.activeTriggers, 0, "FTUX active triggers must be 0")
  assert.strictEqual(ftuxData.metrics.audienceReached, 0, "FTUX audience reached must be 0")
  assert.strictEqual(ftuxData.metrics.messagesSent, 0, "FTUX messages sent must be 0")
  assert.strictEqual(ftuxData.recentActivity.length, 0, "FTUX recent activity must be empty array")
  console.log("✓ Test 5 Passed: FTUX zero-state metrics return 0 with zero errors or crashes.")

  console.log("\n========================================================")
  console.log("ALL DASHBOARD METRICS & AUTH PERSISTENCE TESTS PASSED!")
  console.log("========================================================")
}

run().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
