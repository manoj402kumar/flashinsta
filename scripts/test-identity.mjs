import test from "node:test"
import assert from "node:assert/strict"

import {
  formatIdentityHandle,
  isEmailAddress,
  isGoogleProfilePhoto,
  resolveIdentity,
} from "../lib/identity.ts"

const GOOGLE_EMAIL = "creator@example.com"
const GOOGLE_PIC = "https://lh3.googleusercontent.com/avatar.jpg"
const IG_PIC = "https://scontent.cdninstagram.com/avatar.jpg"

function googleContext(extra = {}) {
  return JSON.stringify({
    google_email: GOOGLE_EMAIL,
    google_name: "Example Creator",
    google_picture: GOOGLE_PIC,
    ...extra,
  })
}

test("a Google-only account shows the login email and Google photo", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "GOOGLE_AUTH",
    ai_context: googleContext(),
  })

  assert.equal(identity.email, GOOGLE_EMAIL)
  assert.equal(identity.username, GOOGLE_EMAIL)
  assert.equal(identity.profilePic, GOOGLE_PIC)
  assert.equal(identity.isIgConnected, false)
  assert.equal(identity.igUsername, null)
})

test("a disconnected account still shows the email when the username column holds an Instagram handle", () => {
  const identity = resolveIdentity({
    username: "flash.creator",
    access_token: "",
    ai_context: googleContext(),
  })

  assert.equal(identity.username, GOOGLE_EMAIL)
  assert.equal(identity.profilePic, GOOGLE_PIC)
  assert.equal(identity.isIgConnected, false)
})

test("a connected Instagram account shows its handle and Instagram photo", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "EAAvalidtokenvalue1234567890",
    business_account_id: "17841400000000000",
    ai_context: googleContext({
      _instagram: {
        username: "flash.creator",
        name: "Flash Creator",
        profilePic: IG_PIC,
        businessAccountId: "17841400000000000",
      },
    }),
  })

  assert.equal(identity.email, GOOGLE_EMAIL)
  assert.equal(identity.username, "flash.creator")
  assert.equal(identity.profilePic, IG_PIC)
  assert.equal(identity.isIgConnected, true)
  assert.equal(identity.igUsername, "flash.creator")
})

test("a context token with a Google placeholder access token still resolves as connected", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "GOOGLE_AUTH",
    business_account_id: "17841400000000000",
    ai_context: googleContext({
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
        accessToken: "IGAAvalidtokenvalue1234567890",
        businessAccountId: "17841400000000000",
      },
    }),
  })

  assert.equal(identity.username, "flash.creator")
  assert.equal(identity.isIgConnected, true)
})

test("a Facebook token without an Instagram business id is not connected", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "EAAvalidtokenvalue1234567890",
    business_account_id: "10150000000000000",
    ai_context: googleContext({
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
      },
    }),
  })

  assert.equal(identity.username, GOOGLE_EMAIL)
  assert.equal(identity.profilePic, GOOGLE_PIC)
  assert.equal(identity.isIgConnected, false)
})

test("an expired Instagram token falls back to the email and Google photo", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "EAAvalidtokenvalue1234567890",
    token_expires_at: "2020-01-01T00:00:00.000Z",
    business_account_id: "17841400000000000",
    ai_context: googleContext({
      _instagram: {
        username: "flash.creator",
        profilePic: IG_PIC,
        businessAccountId: "17841400000000000",
      },
    }),
  })

  assert.equal(identity.username, GOOGLE_EMAIL)
  assert.equal(identity.profilePic, GOOGLE_PIC)
  assert.equal(identity.isIgConnected, false)
  assert.equal(identity.igUsername, null)
})

test("a connected account without an Instagram photo falls back to the Google photo", () => {
  const identity = resolveIdentity({
    username: GOOGLE_EMAIL,
    access_token: "EAAvalidtokenvalue1234567890",
    business_account_id: "17841400000000000",
    ai_context: googleContext({
      _instagram: {
        username: "flash.creator",
        businessAccountId: "17841400000000000",
      },
    }),
  })

  assert.equal(identity.username, "flash.creator")
  assert.equal(identity.profilePic, GOOGLE_PIC)
  assert.equal(identity.isIgConnected, true)
})

test("only Google-hosted photos are accepted as session fallbacks", () => {
  assert.equal(isGoogleProfilePhoto(GOOGLE_PIC), true)
  assert.equal(isGoogleProfilePhoto(IG_PIC), false)
  assert.equal(isGoogleProfilePhoto("not a url"), false)
  assert.equal(isGoogleProfilePhoto(null), false)
})

test("handles keep one @ and emails and display names stay bare", () => {
  assert.equal(formatIdentityHandle("flash.creator"), "@flash.creator")
  assert.equal(formatIdentityHandle("@flash.creator"), "@flash.creator")
  assert.equal(formatIdentityHandle(GOOGLE_EMAIL), GOOGLE_EMAIL)
  assert.equal(formatIdentityHandle("Veera Babu"), "Veera Babu")
  assert.equal(isEmailAddress(GOOGLE_EMAIL), true)
  assert.equal(isEmailAddress("flash.creator"), false)
})
