import test from "node:test"
import assert from "node:assert/strict"

import {
  INSTAGRAM_PROFILE_TTL_MS,
  instagramProfileNeedsRefresh,
} from "../lib/identity.ts"

const IG_PIC = "https://scontent.cdninstagram.com/avatar.jpg"
const FB_TOKEN = "EAAvalidtokenvalue1234567890"

function user(overrides = {}) {
  return {
    id: "1",
    username: "creator@example.com",
    access_token: FB_TOKEN,
    business_account_id: "17841400000000000",
    ai_context: JSON.stringify({
      google_email: "creator@example.com",
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
        businessAccountId: "17841400000000000",
      },
    }),
    ...overrides,
  }
}

test("a connected account with no stored photo refreshes", () => {
  const row = user({
    ai_context: JSON.stringify({
      _instagram: { username: "flash.creator", businessAccountId: "17841400000000000" },
    }),
  })
  assert.equal(instagramProfileNeedsRefresh(row), true)
})

test("a stored photo without a refresh timestamp is treated as stale", () => {
  assert.equal(instagramProfileNeedsRefresh(user()), true)
})

test("a photo refreshed within the TTL is served from storage", () => {
  const now = Date.now()
  const row = user({
    ai_context: JSON.stringify({
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
        businessAccountId: "17841400000000000",
        profilePicUpdatedAt: new Date(now - 60_000).toISOString(),
      },
    }),
  })
  assert.equal(instagramProfileNeedsRefresh(row, now), false)
})

test("a photo older than the TTL refreshes", () => {
  const now = Date.now()
  const row = user({
    ai_context: JSON.stringify({
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
        businessAccountId: "17841400000000000",
        profilePicUpdatedAt: new Date(now - INSTAGRAM_PROFILE_TTL_MS - 1000).toISOString(),
      },
    }),
  })
  assert.equal(instagramProfileNeedsRefresh(row, now), true)
})

test("accounts without an Instagram token or with an expired token do not refresh", () => {
  assert.equal(
    instagramProfileNeedsRefresh(user({ access_token: "GOOGLE_AUTH", business_account_id: null })),
    false,
  )
  assert.equal(
    instagramProfileNeedsRefresh(
      user({ token_expires_at: new Date(Date.now() - 60_000).toISOString() }),
    ),
    false,
  )
})
