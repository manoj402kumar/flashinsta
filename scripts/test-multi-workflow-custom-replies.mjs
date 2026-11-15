import assert from "node:assert"
import crypto from "node:crypto"

console.log("========================================================")
console.log("TESTING MULTI-WORKFLOW CREATION WITH UNIQUE REEL REPLIES")
console.log("========================================================\n")

const testSecret =
  process.env.SESSION_SECRET ||
  process.env.INSTAGRAM_APP_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "dev-only-local-secret-do-not-use-in-production"

const now = Date.now()
const TEST_USER_ID = "17933606868107"
const sessionPayload = {
  userId: TEST_USER_ID,
  username: "y.manoj623246@gmail.com",
  email: "y.manoj623246@gmail.com",
  profilePic: null,
  sid: crypto.randomUUID(),
  iat: now,
  exp: now + 3600 * 1000,
  lastActive: now,
}
const payloadJson = JSON.stringify(sessionPayload)
const hmac = crypto.createHmac("sha256", testSecret).update(payloadJson).digest("hex")
const sessionCookie = `${payloadJson}.${hmac}`

const BASE_URL = "http://127.0.0.1:3000"

async function run() {
  console.log("[1] Creating 3 distinct automations from multi-reel selection...")

  const defaultContent = {
    check_follow: false,
    reply_mode: "both",
    public_reply: "Shared default comment reply 📬",
    message: "Default message for reels without custom overrides",
    card: {
      title: "Shared Default Card",
      buttons: [{ type: "web_url", title: "Open Default Link", url: "https://example.com/default" }],
    },
  }

  const payload = {
    userId: TEST_USER_ID,
    name: "Multi Reel Automation Test",
    trigger_source: "comment",
    trigger_type: "keyword",
    trigger_value: "send",
    content: defaultContent,
    specific_media_ids: ["reel_test_101", "reel_test_102", "reel_test_103"],
    specific_media_id: "reel_test_101",
    separate_workflows: true,
    media_items: [
      {
        id: "reel_test_101",
        caption: "Top coding interview questions #btech",
        trigger_value: "price",
        custom_content: {
          check_follow: false,
          reply_mode: "both",
          public_reply: "Sent pricing info in your DM! 💰",
          card: {
            title: "Interview Prep Pricing",
            subtitle: "Special discount for students",
            buttons: [{ type: "web_url", title: "View Pricing", url: "https://example.com/pricing-reel-1" }],
          },
        },
      },
      {
        id: "reel_test_102",
        caption: "Free ATS resume template download",
        trigger_value: "resume",
        custom_content: {
          check_follow: false,
          reply_mode: "dm_only",
          message: "Here is your exclusive resume download: https://example.com/resume-template.pdf",
        },
      },
      {
        id: "reel_test_103",
        caption: "System design basics for beginners",
        trigger_value: "guide",
        // Inherits default shared content
      },
    ],
  }

  const postRes = await fetch(`${BASE_URL}/api/automations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `insta_session=${encodeURIComponent(sessionCookie)}`,
    },
    body: JSON.stringify(payload),
  })

  assert.strictEqual(postRes.status, 200, `POST /api/automations must return 200. Got: ${postRes.status}`)
  const postData = await postRes.json()
  assert.ok(Array.isArray(postData), "Response should be an array of created automations")
  assert.strictEqual(postData.length, 3, "Response must report 3 separate automations created")
  console.log(`✓ Successfully created ${postData.length} separate workflows!`)

  // Query GET /api/automations to verify each workflow's unique configuration
  console.log("\n[2] Verifying individual workflow isolation and unique contents...")
  const getRes = await fetch(`${BASE_URL}/api/automations?userId=${TEST_USER_ID}`, {
    headers: {
      Cookie: `insta_session=${encodeURIComponent(sessionCookie)}`,
    },
  })
  assert.strictEqual(getRes.status, 200)
  const allAutomations = await getRes.json()
  assert.ok(Array.isArray(allAutomations), "GET /api/automations must return an array")

  const createdIds = new Set(postData.map((a) => a.id))
  const createdAutomations = allAutomations.filter((a) => createdIds.has(a.id))
  assert.strictEqual(createdAutomations.length, 3, "Must find all 3 created automations")

  // Verify Reel 1:
  const auto1 = createdAutomations.find((a) => a.specific_media_id === "reel_test_101")
  assert.ok(auto1, "Automation 1 must exist")
  assert.strictEqual(auto1.trigger_value, "price", "Automation 1 must have custom trigger 'price'")
  assert.strictEqual(auto1.response_content.reply_mode, "both")
  assert.strictEqual(auto1.response_content.public_reply, "Sent pricing info in your DM! 💰")
  assert.strictEqual(auto1.response_content.card?.title, "Interview Prep Pricing")
  assert.strictEqual(auto1.response_content.card?.buttons?.[0]?.url, "https://example.com/pricing-reel-1")
  console.log(`✓ Workflow #1 verified: Trigger="price", Mode="both", Custom URL="https://example.com/pricing-reel-1"`)

  // Verify Reel 2:
  const auto2 = createdAutomations.find((a) => a.specific_media_id === "reel_test_102")
  assert.ok(auto2, "Automation 2 must exist")
  assert.strictEqual(auto2.trigger_value, "resume", "Automation 2 must have custom trigger 'resume'")
  assert.strictEqual(auto2.response_content.reply_mode, "dm_only")
  assert.strictEqual(auto2.response_content.message, "Here is your exclusive resume download: https://example.com/resume-template.pdf")
  console.log(`✓ Workflow #2 verified: Trigger="resume", Mode="dm_only", Custom Text="https://example.com/resume-template.pdf"`)

  // Verify Reel 3:
  const auto3 = createdAutomations.find((a) => a.specific_media_id === "reel_test_103")
  assert.ok(auto3, "Automation 3 must exist")
  assert.strictEqual(auto3.trigger_value, "guide", "Automation 3 must have custom trigger 'guide'")
  assert.strictEqual(auto3.response_content.card?.title, "Shared Default Card", "Automation 3 must inherit default content")
  console.log(`✓ Workflow #3 verified: Trigger="guide", Inherited Default Shared Card`)

  // Cleanup: delete the 3 test automations
  console.log("\n[3] Cleaning up test automations...")
  for (const auto of createdAutomations) {
    await fetch(`${BASE_URL}/api/automations?id=${auto.id}`, {
      method: "DELETE",
      headers: {
        Cookie: `insta_session=${encodeURIComponent(sessionCookie)}`,
      },
    })
  }
  console.log("✓ Cleanup completed.")

  console.log("\n========================================================")
  console.log("ALL MULTI-WORKFLOW CUSTOM REPLY TESTS PASSED WITH 0 ERRORS")
  console.log("========================================================")
}

run().catch((err) => {
  console.error("Test failed:", err)
  process.exit(1)
})
