import test from "node:test"
import assert from "node:assert/strict"

// Mock Feedback In-Memory Store & Logic replicating app/api/feedback/route.ts
const ALLOWED_CATEGORIES = new Set(["feature_request", "bug", "improvement", "praise"])
const ALLOWED_STATUSES = new Set(["new", "in_review", "resolved"])

class FeedbackServiceFixture {
  constructor() {
    this.events = []
    this.users = new Map([
      ["101", { id: 101, username: "super_creator", email: "creator@example.com", profile_pic: "https://cdn.example.com/pfp.jpg" }],
      ["102", { id: 102, username: "@agency_lead", email: "agency@example.com", profile_pic: null }],
    ])
    this.rateLimitMap = new Map()
  }

  checkRateLimit(ip, limit = 10, windowMs = 600000, now = Date.now()) {
    const key = `feedback:${ip}`
    const record = this.rateLimitMap.get(key)
    if (!record || record.resetTime <= now) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs })
      return { allowed: true }
    }
    record.count++
    return { allowed: record.count <= limit }
  }

  async submitFeedback({ rating, category, message, customIgHandle, sessionUserId, ip = "127.0.0.1" }) {
    if (!this.checkRateLimit(ip).allowed) {
      return { status: 429, error: "Too many feedback submissions. Please slow down." }
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return { status: 400, error: "Rating must be an integer between 1 and 5." }
    }

    if (!ALLOWED_CATEGORIES.has(category)) {
      return { status: 400, error: "Invalid category." }
    }

    if (!message || message.trim().length < 5) {
      return { status: 400, error: "Feedback message must be at least 5 characters long." }
    }

    if (message.length > 2000) {
      return { status: 400, error: "Feedback message cannot exceed 2000 characters." }
    }

    let resolvedIg = customIgHandle ? (customIgHandle.startsWith("@") ? customIgHandle : `@${customIgHandle}`) : null
    let pfp = null

    if (sessionUserId && this.users.has(String(sessionUserId))) {
      const u = this.users.get(String(sessionUserId))
      if (!resolvedIg) {
        resolvedIg = u.username.startsWith("@") ? u.username : `@${u.username}`
      }
      pfp = u.profile_pic
    }

    const newEvent = {
      id: `fb_evt_${this.events.length + 1}`,
      event_type: "feedback",
      user_id: sessionUserId ? Number(sessionUserId) : null,
      data: {
        category,
        rating,
        message: message.trim(),
        status: "new",
        ig_username: resolvedIg || "Anonymous Creator",
        profile_pic: pfp,
        submitted_at: new Date().toISOString(),
      },
      processed_at: new Date().toISOString(),
    }

    this.events.unshift(newEvent)
    return { status: 201, success: true, id: newEvent.id, igUsername: resolvedIg }
  }

  getAdminFeedback(isAdmin = false) {
    if (!isAdmin) return { status: 401, error: "Unauthorized" }

    const items = this.events.map((ev) => ({
      id: ev.id,
      userId: ev.user_id ? String(ev.user_id) : null,
      username: ev.data.ig_username,
      igUsername: ev.data.ig_username,
      profilePic: ev.data.profile_pic,
      category: ev.data.category,
      rating: ev.data.rating,
      message: ev.data.message,
      status: ev.data.status,
      createdAt: ev.processed_at,
    }))

    return { status: 200, feedback: items }
  }

  updateFeedbackStatus(id, newStatus, isAdmin = false) {
    if (!isAdmin) return { status: 401, error: "Unauthorized" }
    if (!ALLOWED_STATUSES.has(newStatus)) return { status: 400, error: "Invalid status" }

    const ev = this.events.find((e) => e.id === id)
    if (!ev) return { status: 404, error: "Not found" }

    ev.data.status = newStatus
    return { status: 200, success: true }
  }

  deleteFeedback(id, isAdmin = false) {
    if (!isAdmin) return { status: 401, error: "Unauthorized" }
    const idx = this.events.findIndex((e) => e.id === id)
    if (idx === -1) return { status: 404, error: "Not found" }

    this.events.splice(idx, 1)
    return { status: 200, success: true }
  }
}

// ── TEST SUITE ──

test("Feedback API 1: Input validation boundaries", async () => {
  const service = new FeedbackServiceFixture()

  // 1. Invalid rating (0, 6, float)
  assert.equal((await service.submitFeedback({ rating: 0, category: "praise", message: "Great app" })).status, 400)
  assert.equal((await service.submitFeedback({ rating: 6, category: "praise", message: "Great app" })).status, 400)
  assert.equal((await service.submitFeedback({ rating: 4.5, category: "praise", message: "Great app" })).status, 400)

  // 2. Invalid category
  assert.equal((await service.submitFeedback({ rating: 5, category: "invalid_cat", message: "Great app" })).status, 400)

  // 3. Too short message (<5 chars)
  assert.equal((await service.submitFeedback({ rating: 5, category: "praise", message: "Hi" })).status, 400)

  // 4. Valid submission
  const valid = await service.submitFeedback({ rating: 5, category: "praise", message: "Incredible automations for Reels!" })
  assert.equal(valid.status, 201)
  assert.ok(valid.id)
})

test("Feedback API 2: Connected Instagram account linking & resolution", async () => {
  const service = new FeedbackServiceFixture()

  // 1. Authenticated creator with connected account 101
  const res1 = await service.submitFeedback({
    rating: 5,
    category: "feature_request",
    message: "Would love automated carousel comment replies!",
    sessionUserId: "101",
  })
  assert.equal(res1.status, 201)
  assert.equal(res1.igUsername, "@super_creator", "Must resolve connected Instagram handle")

  // 2. Unauthenticated creator entering manual handle
  const res2 = await service.submitFeedback({
    rating: 4,
    category: "bug",
    message: "Follower gate button took 2 seconds to appear",
    customIgHandle: "independent_creator",
  })
  assert.equal(res2.status, 201)
  assert.equal(res2.igUsername, "@independent_creator", "Must format handle with @")
})

test("Feedback API 3: Admin dashboard authorization & enriched display", async () => {
  const service = new FeedbackServiceFixture()

  await service.submitFeedback({
    rating: 5,
    category: "praise",
    message: "Best tool ever!",
    sessionUserId: "101",
  })

  // 1. Unauthorized admin access blocked
  const unauthRes = service.getAdminFeedback(false)
  assert.equal(unauthRes.status, 401)

  // 2. Authorized admin access succeeds
  const authRes = service.getAdminFeedback(true)
  assert.equal(authRes.status, 200)
  assert.equal(authRes.feedback.length, 1)

  const item = authRes.feedback[0]
  assert.equal(item.igUsername, "@super_creator", "Instagram account must be present for admin display")
  assert.equal(item.profilePic, "https://cdn.example.com/pfp.jpg")
  assert.equal(item.status, "new")

  // 3. Admin status update (PATCH)
  const patchRes = service.updateFeedbackStatus(item.id, "in_review", true)
  assert.equal(patchRes.status, 200)
  assert.equal(service.getAdminFeedback(true).feedback[0].status, "in_review")

  // 4. Admin delete (DELETE)
  const deleteRes = service.deleteFeedback(item.id, true)
  assert.equal(deleteRes.status, 200)
  assert.equal(service.getAdminFeedback(true).feedback.length, 0)
})

test("Feedback API 4: Rate limit enforcement", async () => {
  const service = new FeedbackServiceFixture()
  const spamIp = "198.51.100.77"

  // 10 submissions allowed
  for (let i = 0; i < 10; i++) {
    const res = await service.submitFeedback({
      rating: 5,
      category: "improvement",
      message: `Feedback note number ${i + 1}`,
      ip: spamIp,
    })
    assert.equal(res.status, 201)
  }

  // 11th submission blocked with 429
  const blocked = await service.submitFeedback({
    rating: 5,
    category: "improvement",
    message: "Feedback note number 11",
    ip: spamIp,
  })
  assert.equal(blocked.status, 429)
  assert.equal(blocked.error, "Too many feedback submissions. Please slow down.")
})
