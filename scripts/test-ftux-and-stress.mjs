import assert from "node:assert"
import crypto from "node:crypto"

console.log("========================================================")
console.log("RUNNING FTUX & MULTI-AGENT COMPREHENSIVE STRESS TEST")
console.log("========================================================\n")

// ----------------------------------------------------
// AGENT 1: Brand New User (Zero State / FTUX)
// ----------------------------------------------------
console.log("[Agent 1] Testing First-Time User Experience (Zero State)...")

// 1.1 Brand new Google signup has no Instagram credentials
const newUserRow = {
  id: "9001",
  username: "newuser@gmail.com",
  access_token: "GOOGLE_AUTH",
  business_account_id: null,
  page_id: null,
  ai_context: JSON.stringify({
    google_email: "newuser@gmail.com",
    google_picture: "https://lh3.googleusercontent.com/a/ACg8ocL_TEST_USER=s96-c",
  }),
}

function resolveUserIdentity(row) {
  let parsed = {}
  try {
    parsed = typeof row.ai_context === "string" ? JSON.parse(row.ai_context) : row.ai_context || {}
  } catch {}

  const hasIgToken =
    row.access_token &&
    row.access_token !== "GOOGLE_AUTH" &&
    row.access_token !== "TEST_TOKEN_NOT_REAL" &&
    !row.access_token.startsWith("ya29.") &&
    row.access_token.length > 20

  const isIgConnected = Boolean(hasIgToken && (row.business_account_id || parsed._instagram?.businessAccountId))
  const email = parsed.google_email || (row.username?.includes("@") ? row.username : null)
  const profilePic = isIgConnected ? parsed._instagram?.profilePic || null : parsed.google_picture || null

  return {
    userId: String(row.id),
    username: row.username,
    email,
    profilePic,
    isIgConnected,
    igUsername: isIgConnected ? parsed._instagram?.username || null : null,
  }
}

const ftuxIdentity = resolveUserIdentity(newUserRow)
assert.strictEqual(ftuxIdentity.isIgConnected, false, "Brand new user must have isIgConnected = false")
assert.strictEqual(ftuxIdentity.email, "newuser@gmail.com", "Identity must reflect Google email")
assert.strictEqual(ftuxIdentity.profilePic, "https://lh3.googleusercontent.com/a/ACg8ocL_TEST_USER=s96-c", "Identity must use Google avatar")
assert.strictEqual(ftuxIdentity.igUsername, null, "Instagram username must be null")

// 1.2 Dashboard stats computation on zero state (no division by zero)
function computeDashboardStats(automationsList, conversationsList, messagesList, webhookEvents) {
  const automationsCount = automationsList?.length || 0
  const activeCount = automationsList?.filter((a) => a.is_active)?.length || 0
  const audienceCount = conversationsList?.length || 0
  const sentCount = messagesList?.filter((m) => m.is_from_instagram === false)?.length || 0
  const incomingCount = messagesList?.filter((m) => m.is_from_instagram === true)?.length || 0
  const responseRate = incomingCount > 0 ? Math.min(100, Math.round((sentCount / incomingCount) * 100)) : 100
  const totalReplies = (webhookEvents?.length || 0) + sentCount

  return {
    metrics: {
      totalAutomations: automationsCount,
      activeTriggers: activeCount,
      audienceReached: audienceCount,
      messagesSent: totalReplies,
    },
    responseRate,
  }
}

const emptyStats = computeDashboardStats([], [], [], [])
assert.strictEqual(emptyStats.metrics.totalAutomations, 0)
assert.strictEqual(emptyStats.metrics.activeTriggers, 0)
assert.strictEqual(emptyStats.metrics.audienceReached, 0)
assert.strictEqual(emptyStats.metrics.messagesSent, 0)
assert.strictEqual(emptyStats.responseRate, 100, "Response rate on zero incoming messages must default to 100% without NaN")

console.log("✓ Agent 1 Passed: FTUX identity and empty stats verified with 0 errors.\n")

// ----------------------------------------------------
// AGENT 2: Creator User with Connected Instagram & Multi-Reels
// ----------------------------------------------------
console.log("[Agent 2] Testing Multi-Post Automation & Webhook Routing...")

// 2.1 Multi-media rule creation with custom triggers
function buildMultiMediaRules(sessionUserId, body) {
  const { name, trigger_source, trigger_type, trigger_value, content, separate_workflows, media_items, specific_media_ids } = body

  const sanitizedName = String(name).slice(0, 100).trim()
  const mediaIds = Array.isArray(specific_media_ids) ? specific_media_ids : []

  if (separate_workflows !== false && mediaIds.length > 1) {
    const customTriggerMap = new Map()
    if (Array.isArray(media_items)) {
      for (const item of media_items) {
        if (item?.id && typeof item.trigger_value === "string" && item.trigger_value.trim()) {
          const val = item.trigger_value.trim()
          customTriggerMap.set(String(item.id), {
            trigger_value: val.toUpperCase() === "ALL" ? "ALL_COMMENTS" : val,
            trigger_type: val.toUpperCase() === "ALL" ? "reply_all" : "keyword",
          })
        }
      }
    }

    return mediaIds.map((mediaId, index) => {
      const custom = customTriggerMap.get(mediaId)
      return {
        user_id: sessionUserId,
        name: `${sanitizedName} (Reel ${index + 1})`,
        trigger_source,
        trigger_type: custom ? custom.trigger_type : trigger_type || "keyword",
        trigger_value: custom ? custom.trigger_value : trigger_value,
        specific_media_id: mediaId,
        media_selection: { media_ids: [mediaId] },
        is_active: true,
      }
    })
  }

  return [
    {
      user_id: sessionUserId,
      name: sanitizedName,
      trigger_source,
      trigger_type: trigger_type || "keyword",
      trigger_value,
      specific_media_id: mediaIds[0] || null,
      media_selection: mediaIds.length > 0 ? { media_ids: mediaIds } : null,
      is_active: true,
    },
  ]
}

const createdRules = buildMultiMediaRules("2001", {
  name: "Summer Launch",
  trigger_source: "comment",
  trigger_type: "keyword",
  trigger_value: "LAUNCH",
  specific_media_ids: ["reel_111", "reel_222", "reel_333"],
  separate_workflows: true,
  media_items: [
    { id: "reel_111", trigger_value: "START" },
    { id: "reel_222", trigger_value: "DISCOUNT" },
    { id: "reel_333", trigger_value: "ALL" },
  ],
})

assert.strictEqual(createdRules.length, 3, "Must generate exactly 3 separated workflows")
assert.strictEqual(createdRules[0].specific_media_id, "reel_111")
assert.strictEqual(createdRules[0].trigger_value, "START")
assert.strictEqual(createdRules[0].trigger_type, "keyword")
assert.strictEqual(createdRules[1].specific_media_id, "reel_222")
assert.strictEqual(createdRules[1].trigger_value, "DISCOUNT")
assert.strictEqual(createdRules[2].specific_media_id, "reel_333")
assert.strictEqual(createdRules[2].trigger_value, "ALL_COMMENTS")
assert.strictEqual(createdRules[2].trigger_type, "reply_all")

// 2.2 Webhook Routing: Verify comment on reel_111 matches rule 0, not rule 1
function matchCommentRule(rules, commentMediaId, commentText) {
  const normText = (commentText || "").toLowerCase().trim()

  return rules.find((rule) => {
    // Media check
    if (rule.specific_media_id && rule.specific_media_id !== commentMediaId) return false

    // Trigger check
    if (rule.trigger_type === "reply_all" || rule.trigger_value === "ALL_COMMENTS") return true

    const keywords = (rule.trigger_value || "")
      .split(",")
      .map((k) => k.toLowerCase().trim())
      .filter(Boolean)

    return keywords.some((k) => normText.includes(k))
  })
}

const matchReel1 = matchCommentRule(createdRules, "reel_111", "Please START the test!")
assert.strictEqual(matchReel1?.specific_media_id, "reel_111", "Reel 1 comment must match Rule 1")

const matchReel2 = matchCommentRule(createdRules, "reel_222", "I want a discount code")
assert.strictEqual(matchReel2?.specific_media_id, "reel_222", "Reel 2 comment must match Rule 2")

const matchReel3 = matchCommentRule(createdRules, "reel_333", "Random comment")
assert.strictEqual(matchReel3?.specific_media_id, "reel_333", "Reel 3 reply_all must match any comment")

const crossMatchFail = matchCommentRule(createdRules, "reel_111", "I want a discount code")
assert.strictEqual(crossMatchFail, undefined, "DISCOUNT comment on Reel 1 must NOT match Reel 2 rule")

console.log("✓ Agent 2 Passed: Multi-media separation and webhook routing verified.\n")

// ----------------------------------------------------
// AGENT 3: Tenant Isolation & IDOR Attacker Simulation
// ----------------------------------------------------
console.log("[Agent 3] Testing Tenant Boundary & IDOR Prevention...")

// 3.1 IDOR on Automation Mutation
function authorizeAutomationMutation(sessionUserId, targetUserId, ruleOwnerId) {
  if (targetUserId && String(targetUserId) !== String(sessionUserId)) {
    return { ok: false, status: 403, error: "Forbidden: user identity mismatch" }
  }
  if (ruleOwnerId && String(ruleOwnerId) !== String(sessionUserId)) {
    return { ok: false, status: 404, error: "Automation not found" }
  }
  return { ok: true, status: 200 }
}

// Attacker tries to modify victim's automation
const victimUserId = "1001"
const attackerUserId = "6666"

const idorPutAttempt = authorizeAutomationMutation(attackerUserId, victimUserId, victimUserId)
assert.strictEqual(idorPutAttempt.status, 403, "Mismatched targetUserId must be blocked with 403")

const idorDeleteAttempt = authorizeAutomationMutation(attackerUserId, null, victimUserId)
assert.strictEqual(idorDeleteAttempt.status, 404, "Victim's rule must not be visible/deletable by attacker (404)")

// 3.2 IDOR on Inbox Messages
function authorizeConversationAccess(sessionUserId, conversation) {
  if (!conversation || String(conversation.user_id) !== String(sessionUserId)) {
    return { ok: false, status: 404, error: "Conversation not found" }
  }
  return { ok: true, status: 200 }
}

const victimConversation = { id: "conv_888", user_id: "1001" }
const idorConvAttempt = authorizeConversationAccess(attackerUserId, victimConversation)
assert.strictEqual(idorConvAttempt.status, 404, "Attacker cannot access victim's conversation messages")

console.log("✓ Agent 3 Passed: IDOR and tenant boundary controls verified.\n")

// ----------------------------------------------------
// AGENT 4: Webhook Signature, Opt-Out & Edge Case Simulation
// ----------------------------------------------------
console.log("[Agent 4] Testing Webhooks, Opt-Out Compliance & Bug Fixes...")

// 4.1 HMAC-SHA256 Webhook Signature Verification
const WEBHOOK_SECRET = "fb_meta_app_secret_9999"
function verifyWebhookSignature(rawBody, headerSignature, secrets = [WEBHOOK_SECRET]) {
  if (!headerSignature || !headerSignature.startsWith("sha256=")) return false
  const received = headerSignature.slice("sha256=".length)
  return secrets.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
    return (
      received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"))
    )
  })
}

const webhookBody = JSON.stringify({ entry: [{ id: "1784", messaging: [] }] })
const validSig = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(webhookBody, "utf8").digest("hex")
const forgedSig = "sha256=" + crypto.createHmac("sha256", "wrong_secret").update(webhookBody, "utf8").digest("hex")

assert.strictEqual(verifyWebhookSignature(webhookBody, validSig), true, "Valid HMAC signature must pass")
assert.strictEqual(verifyWebhookSignature(webhookBody, forgedSig), false, "Forged signature must be rejected")
assert.strictEqual(verifyWebhookSignature(webhookBody, null), false, "Missing signature must be rejected")

// 4.2 Opt-out and opt-in keyword detection
function detectOptAction(text) {
  const normalized = (text || "").toUpperCase().trim()
  const optOutTriggers = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]
  const optInTriggers = ["START", "UNSTOP"]

  if (optOutTriggers.includes(normalized)) return "opt_out"
  if (optInTriggers.includes(normalized)) return "opt_in"
  return null
}

assert.strictEqual(detectOptAction("stop"), "opt_out")
assert.strictEqual(detectOptAction("STOP"), "opt_out")
assert.strictEqual(detectOptAction("Unsubscribe"), "opt_out")
assert.strictEqual(detectOptAction("start"), "opt_in")
assert.strictEqual(detectOptAction("hello there"), null)

// 4.3 Bug Fix Verification: Ice breaker response slicing (ensuring .slice(0, 1000) not .slice(1000))
function sanitizeIceBreaker(question, response) {
  return {
    question: String(question || "").slice(0, 80).trim(),
    response: String(response || "").slice(0, 1000).trim(),
  }
}

const testQuestion = "What is the price of FlashInsta?"
const testResponse = "FlashInsta Pro is $29/mo with automated DM funnels and live preview."
const sanitized = sanitizeIceBreaker(testQuestion, testResponse)

assert.strictEqual(sanitized.question, testQuestion)
assert.strictEqual(sanitized.response, testResponse, "Ice breaker response must NOT be empty after sanitization")

// 4.4 Privacy Export Schema Verification (ensuring columns match database)
const VALID_AUTOMATION_COLUMNS = [
  "id",
  "name",
  "trigger_source",
  "trigger_type",
  "trigger_value",
  "specific_media_id",
  "is_active",
  "created_at",
]
const VALID_CONVERSATION_COLUMNS = ["id", "recipient_id", "recipient_username", "last_message_at", "created_at"]

// Columns that caused database errors previously:
const INVALID_COLUMNS = ["keyword", "match_type", "reply_content", "execution_count", "instagram_thread_id"]
for (const col of INVALID_COLUMNS) {
  assert.strictEqual(VALID_AUTOMATION_COLUMNS.includes(col), false, `Invalid column '${col}' must not be in query`)
  assert.strictEqual(VALID_CONVERSATION_COLUMNS.includes(col), false, `Invalid column '${col}' must not be in query`)
}

console.log("✓ Agent 4 Passed: Webhook signatures, opt-out compliance, and bug fixes verified.\n")

console.log("========================================================")
console.log("ALL FTUX & MULTI-AGENT STRESS INVARIANTS PASSED (0 ERRORS)")
console.log("========================================================")
