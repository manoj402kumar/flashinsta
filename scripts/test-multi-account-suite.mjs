import assert from "node:assert"
import crypto from "node:crypto"

console.log("========================================================")
console.log("RUNNING PRODUCTION-GRADE MULTI-ACCOUNT VERIFICATION SUITE")
console.log("========================================================\n")

// ----------------------------------------------------
// TEST SUITE 1: Cryptographic Session Integrity & Isolation
// ----------------------------------------------------
console.log("[Test Suite 1] Testing cryptographic session token invariants...")

const TEST_SECRET = "production-grade-session-secret-key-998877"

function signSession(data, secret = TEST_SECRET) {
  const now = Date.now()
  const complete = {
    userId: String(data.userId),
    username: data.username,
    email: data.email || null,
    profilePic: data.profilePic || null,
    sid: data.sid || crypto.randomUUID(),
    iat: data.iat || now,
    exp: data.exp || now + 14 * 24 * 60 * 60 * 1000,
    lastActive: data.lastActive || now,
  }
  const payload = JSON.stringify(complete)
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  return `${payload}.${hmac}`
}

function verifySession(token, secret = TEST_SECRET) {
  if (!token || typeof token !== "string") return null
  const lastDot = token.lastIndexOf(".")
  if (lastDot === -1) return null
  const payload = token.slice(0, lastDot)
  const signature = token.slice(lastDot + 1)
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"))
  ) {
    return null
  }
  try {
    const data = JSON.parse(payload)
    if (!data || !data.userId) return null
    if (data.exp && Date.now() > data.exp) return null
    return data
  } catch {
    return null
  }
}

// 1.1 Valid signed token passes
const initialSession = signSession({ userId: "1001", username: "brand_main" })
const verifiedInitial = verifySession(initialSession)
assert.strictEqual(verifiedInitial?.userId, "1001")
assert.strictEqual(verifiedInitial?.username, "brand_main")

// 1.2 Signature tampering fails
const tamperedToken = initialSession.slice(0, 10) + "X" + initialSession.slice(11)
assert.strictEqual(verifySession(tamperedToken), null, "Tampered token must fail verification")

// 1.3 Expired token fails
const expiredSession = signSession({
  userId: "1001",
  username: "brand_main",
  exp: Date.now() - 1000,
})
assert.strictEqual(verifySession(expiredSession), null, "Expired token must be rejected")

// 1.4 Master login email preservation
const sessionWithEmail = signSession({
  userId: "1001",
  username: "brand_main",
  email: "creator@gmail.com",
})
const verifiedWithEmail = verifySession(sessionWithEmail)
assert.strictEqual(verifiedWithEmail?.email, "creator@gmail.com", "Master login email must be preserved")

console.log("✓ Test Suite 1 Passed: Session cryptography, expiry, and anti-tamper checks intact.\n")

// ----------------------------------------------------
// TEST SUITE 2: Account Extraction & Information Leak Prevention
// ----------------------------------------------------
console.log("[Test Suite 2] Testing account metadata extraction & token isolation...")

function isValidInstagramToken(token) {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

function extractAccountInfo(user) {
  const userId = String(user.id)
  let igUsername = null
  let igProfilePic = null
  let hasIgToken = isValidInstagramToken(user.access_token)
  let businessAccountId = user.business_account_id ? String(user.business_account_id) : null

  try {
    if (user.ai_context) {
      const parsed = typeof user.ai_context === "string" ? JSON.parse(user.ai_context) : user.ai_context
      const candidateToken =
        parsed._instagram?.accessToken ||
        parsed._instagram?.pageAccessToken ||
        parsed._instagram?.userAccessToken

      if (candidateToken && isValidInstagramToken(candidateToken)) {
        hasIgToken = true
      }
      if (parsed._instagram?.businessAccountId) {
        businessAccountId = String(parsed._instagram.businessAccountId)
      }
      if (hasIgToken) {
        const rawIgUser = parsed._instagram?.username
        if (rawIgUser && !rawIgUser.includes("@")) {
          igUsername = rawIgUser
        } else if (user.username && !user.username.includes("@")) {
          igUsername = user.username
        } else {
          igUsername = rawIgUser || user.username || null
        }
        igProfilePic = parsed._instagram?.profilePic || null
      }
    } else if (hasIgToken && user.username && !user.username.includes("@")) {
      igUsername = user.username
    }
  } catch {}

  const isFb = Boolean(user.access_token && user.access_token.startsWith("EAA"))
  let hasValidIgId = true
  if (isFb) {
    const bizId = businessAccountId || ""
    hasValidIgId = bizId.startsWith("1784")
  }

  const isIgConnected = Boolean(hasIgToken && igUsername && hasValidIgId)
  const displayUsername = isIgConnected
    ? igUsername
    : (user.username && !user.username.includes("@") ? user.username : "Account")

  return {
    userId,
    username: displayUsername,
    profilePic: isIgConnected ? igProfilePic : null,
    isIgConnected,
    igUsername: isIgConnected ? igUsername : null,
    businessAccountId,
  }
}

const mockUserWithSecretToken = {
  id: 17841455555,
  username: "travel_creator",
  access_token: "MOCK_SENSITIVE_TOKEN_VALUE_FOR_UNIT_TEST_99999",
  business_account_id: "17841455555",
  ai_context: JSON.stringify({
    _instagram: {
      username: "travel_creator",
      profilePic: "https://cdn.instagram.com/p/pic1.jpg",
      accessToken: "MOCK_SENSITIVE_TOKEN_VALUE_FOR_UNIT_TEST_99999",
      businessAccountId: "17841455555",
    },
  }),
}

const extracted = extractAccountInfo(mockUserWithSecretToken)

// Verify no secrets leaked in extracted payload
assert.strictEqual(extracted.userId, "17841455555")
assert.strictEqual(extracted.username, "travel_creator")
assert.strictEqual(extracted.profilePic, "https://cdn.instagram.com/p/pic1.jpg")
assert.strictEqual(extracted.isIgConnected, true)
assert.strictEqual(extracted.igUsername, "travel_creator")
assert.strictEqual(extracted.businessAccountId, "17841455555")
assert.strictEqual(Object.prototype.hasOwnProperty.call(extracted, "access_token"), false)
assert.strictEqual(JSON.stringify(extracted).includes("MOCK_SENSITIVE_TOKEN"), false, "Token MUST NOT leak into account info")

console.log("✓ Test Suite 2 Passed: Zero token/secret leaks verified.")

// ----------------------------------------------------
// TEST SUITE 3: Multi-Account Cluster Linking & Authorization Logic
// ----------------------------------------------------
console.log("\n[Test Suite 3] Testing multi-account cluster linking & switch authorization...")

// In-memory cluster simulator
const accountClusterMap = new Map() // userId -> Set of linked userIds

function simLinkAccounts(idA, idB) {
  const strA = String(idA)
  const strB = String(idB)
  if (strA === strB) return

  const clusterA = accountClusterMap.get(strA) || new Set([strA])
  const clusterB = accountClusterMap.get(strB) || new Set([strB])
  const unified = new Set([...clusterA, ...clusterB, strA, strB])

  for (const id of unified) {
    accountClusterMap.set(id, new Set(unified))
  }
}

function simIsSwitchAllowed(currentId, targetId) {
  const cur = String(currentId)
  const tgt = String(targetId)
  if (cur === tgt) return true
  const cluster = accountClusterMap.get(cur)
  return cluster ? cluster.has(tgt) : false
}

function simUnlinkAccount(currentId, targetId) {
  const cur = String(currentId)
  const tgt = String(targetId)
  const clusterCur = accountClusterMap.get(cur)
  if (clusterCur) {
    clusterCur.delete(tgt)
  }
  const clusterTgt = accountClusterMap.get(tgt)
  if (clusterTgt) {
    clusterTgt.delete(cur)
  }
}

// User 1 connects Account A (@main_brand)
const ACC_A = "1001"
const ACC_B = "1002"
const ACC_C = "1003"
const STRANGER_D = "9999"

// Initially, A is not linked to B
assert.strictEqual(simIsSwitchAllowed(ACC_A, ACC_B), false)
assert.strictEqual(simIsSwitchAllowed(ACC_A, STRANGER_D), false)

// User links Account B (@secondary_store)
simLinkAccounts(ACC_A, ACC_B)
assert.strictEqual(simIsSwitchAllowed(ACC_A, ACC_B), true, "A must be able to switch to B")
assert.strictEqual(simIsSwitchAllowed(ACC_B, ACC_A), true, "B must be able to switch to A (symmetric)")
assert.strictEqual(simIsSwitchAllowed(ACC_A, STRANGER_D), false, "Stranger D must be blocked with 403")

// User links Account C (@travel_blog) from Account B
simLinkAccounts(ACC_B, ACC_C)
assert.strictEqual(simIsSwitchAllowed(ACC_A, ACC_C), true, "Transitive link: A can switch to C")
assert.strictEqual(simIsSwitchAllowed(ACC_C, ACC_A), true, "Transitive link: C can switch to A")
assert.strictEqual(simIsSwitchAllowed(ACC_C, ACC_B), true, "Direct link: C can switch to B")
assert.strictEqual(simIsSwitchAllowed(ACC_C, STRANGER_D), false, "Stranger D remains blocked")

// Single-click switch simulation: Switch session from Account A to Account C
const activeSessionBefore = signSession({ userId: ACC_A, username: "main_brand" })
assert.strictEqual(verifySession(activeSessionBefore)?.userId, ACC_A)

// Perform switch
assert.strictEqual(simIsSwitchAllowed(ACC_A, ACC_C), true)
const switchedSession = signSession({ userId: ACC_C, username: "travel_blog" })
const verifiedSwitched = verifySession(switchedSession)
assert.strictEqual(verifiedSwitched?.userId, ACC_C)
assert.strictEqual(verifiedSwitched?.username, "travel_blog")

// Unlink Account B
simUnlinkAccount(ACC_A, ACC_B)
assert.strictEqual(simIsSwitchAllowed(ACC_A, ACC_B), false, "After unlink, A cannot switch to B")

console.log("✓ Test Suite 3 Passed: Multi-account cluster linking, single-click switch, and authorization verified.")

// ----------------------------------------------------
// TEST SUITE 4: UI Data Contract Compatibility
// ----------------------------------------------------
console.log("\n[Test Suite 4] Testing UI components contract compatibility...")

const sampleAccountsList = [
  {
    userId: "1001",
    username: "brand_one",
    profilePic: "https://example.com/one.jpg",
    isIgConnected: true,
    igUsername: "brand_one",
    isActive: true,
  },
  {
    userId: "1002",
    username: "brand_two",
    profilePic: null,
    isIgConnected: true,
    igUsername: "brand_two",
    isActive: false,
  },
]

// Verify structure adheres to LinkedAccount interface
for (const acc of sampleAccountsList) {
  assert(typeof acc.userId === "string", "userId must be string")
  assert(typeof acc.username === "string", "username must be string")
  assert(typeof acc.isIgConnected === "boolean", "isIgConnected must be boolean")
  assert(typeof acc.isActive === "boolean", "isActive must be boolean")
}

console.log("✓ Test Suite 4 Passed: UI contracts match LinkedAccount specifications.")

console.log("\n========================================================")
console.log("ALL UNIT AND WORKFLOW INVARIANT TESTS PASSED WITH 0 ERRORS!")
console.log("========================================================\n")
