import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"

// Import application functions
import { sanitizeLogData } from "../lib/logger.ts"

// ── PURE REPRODUCIBLE LOGIC MIRRORING PRODUCTION ──

function buildInitialLinkRequestCard(params) {
  const title = (params.title || "Hey there! I'm so happy you're here, thanks so much for your interest 😊").slice(0, 80)
  const subtitle = (params.subtitle || "Click below and I'll send you the link in just a sec ✨").slice(0, 80)
  const buttonTitle = (params.buttonText || "Send me the link").slice(0, 20)

  const card = {
    title,
    subtitle,
    buttons: [
      { type: "postback", title: buttonTitle, payload: `SEND_LINK_${params.ruleId}` },
    ],
  }
  if (params.imageUrl) {
    if (params.imageUrl.startsWith("http://") || params.imageUrl.startsWith("https://")) {
      card.image_url = params.imageUrl
    } else if (params.imageUrl.startsWith("/")) {
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://insta-p8-fawn.vercel.app"
      card.image_url = `${base.replace(/\/+$/, "")}${params.imageUrl}`
    }
  }
  return card
}

function resolveInitialCardImg(content) {
  if (!content || typeof content !== "object") return undefined
  const gate = content.follow_gate || {}
  return (content.initial_image_url?.trim() || gate.initial_image_url?.trim()) || undefined
}

// ── RANDOM FUZZ GENERATORS ──

const UNICODE_CORPUS = [
  "Hello World",
  "👋 🚀 🎁 ✨ 🔥",
  "مرحبا بالعالم", // Arabic RTL
  "こんにちは世界", // Japanese
  "Русский текст", // Cyrillic
  "<script>alert('xss')</script>",
  "\x00\x01\x02\x03\x04", // Control chars
  "'\"; DROP TABLE users; --",
  "https://example.com/valid.png",
  "/local/relative/path.jpg",
  "ftp://invalid-protocol.com/image.png",
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "A".repeat(500), // Oversized
  "",
  "   ",
  null,
  undefined,
]

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateRandomAutomationContent() {
  const hasInitialImg = Math.random() > 0.5
  const hasPayloadImg = Math.random() > 0.5
  const hasGateImg = Math.random() > 0.5

  return {
    type: pickRandom(["card", "text", "media"]),
    initial_title: pickRandom(UNICODE_CORPUS),
    initial_subtitle: pickRandom(UNICODE_CORPUS),
    initial_button_text: pickRandom(UNICODE_CORPUS),
    initial_image_url: hasInitialImg ? `https://cdn.example.com/initial-${crypto.randomBytes(4).toString("hex")}.jpg` : pickRandom(["", "   ", null, undefined]),
    follow_gate: {
      initial_title: pickRandom(UNICODE_CORPUS),
      initial_subtitle: pickRandom(UNICODE_CORPUS),
      initial_button_text: pickRandom(UNICODE_CORPUS),
      image_url: hasGateImg ? `https://cdn.example.com/gate-${crypto.randomBytes(4).toString("hex")}.jpg` : undefined,
    },
    card_data: {
      title: pickRandom(UNICODE_CORPUS),
      subtitle: pickRandom(UNICODE_CORPUS),
      image_url: hasPayloadImg ? `https://cdn.example.com/payload-${crypto.randomBytes(4).toString("hex")}.jpg` : undefined,
    },
    media_url: `https://cdn.example.com/media-${crypto.randomBytes(4).toString("hex")}.mp4`,
  }
}

function generateRandomNestedObject(depth = 0) {
  if (depth > 8) return "leaf"
  const obj = {}
  const keys = ["safeField", "access_token", "secret", "user_id", "nested", "token", "password", "apiKey"]
  const keyCount = Math.floor(Math.random() * 4) + 1
  for (let i = 0; i < keyCount; i++) {
    const k = pickRandom(keys)
    if (k === "nested") {
      obj[k] = generateRandomNestedObject(depth + 1)
    } else {
      obj[k] = pickRandom(UNICODE_CORPUS)
    }
  }
  return obj
}

// ── PROPERTY-BASED TESTS ──

test("PBT Invariant 1: Card Media Isolation Invariant across 1,000 randomized configurations", () => {
  for (let i = 0; i < 1000; i++) {
    const content = generateRandomAutomationContent()
    const resolvedInitialImg = resolveInitialCardImg(content)
    const card = buildInitialLinkRequestCard({
      ruleId: `rule_${i}`,
      title: content.initial_title,
      subtitle: content.initial_subtitle,
      buttonText: content.initial_button_text,
      imageUrl: resolvedInitialImg,
    })

    // INVARIANT A: If content has no valid initial_image_url, card.image_url must be undefined.
    // It must NEVER adopt card_data.image_url or follow_gate.image_url.
    const explicitInitial = content.initial_image_url?.trim()
    if (!explicitInitial) {
      assert.equal(
        card.image_url,
        undefined,
        `Iteration ${i}: Initial card image must be undefined when initial_image_url is not set, even if payload has: ${content.card_data.image_url}`
      )
    } else {
      assert.equal(
        card.image_url,
        explicitInitial,
        `Iteration ${i}: Initial card image must strictly match explicit initial_image_url`
      )
    }

    // INVARIANT B: Title must NEVER exceed 80 characters
    assert.ok(card.title.length <= 80, `Iteration ${i}: Title length ${card.title.length} exceeds 80`)

    // INVARIANT C: Subtitle must NEVER exceed 80 characters
    assert.ok(card.subtitle.length <= 80, `Iteration ${i}: Subtitle length ${card.subtitle.length} exceeds 80`)

    // INVARIANT D: Button text must NEVER exceed 20 characters
    assert.ok(card.buttons[0].title.length <= 20, `Iteration ${i}: Button title length ${card.buttons[0].title.length} exceeds 20`)

    // INVARIANT E: Button payload must strictly identify rule
    assert.equal(card.buttons[0].payload, `SEND_LINK_rule_${i}`)
  }
})

test("PBT Invariant 2: Secret Redaction Invariant across 500 randomized nested trees", () => {
  const sensitiveKeys = ["access_token", "secret", "token", "password", "apikey"]
  for (let i = 0; i < 500; i++) {
    const rawTree = generateRandomNestedObject()
    const sanitized = sanitizeLogData(rawTree)

    // Traverse sanitized tree and verify that NO sensitive key retains its raw value if it was a non-empty string
    function verifyNoExposedSecrets(node) {
      if (!node || typeof node !== "object") return
      for (const [k, v] of Object.entries(node)) {
        if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
          if (typeof v === "string") {
            assert.ok(
              v.includes("[REDACTED]"),
              `Sensitive key "${k}" has unredacted value: "${v}"`
            )
          }
        } else if (typeof v === "object") {
          verifyNoExposedSecrets(v)
        }
      }
    }
    verifyNoExposedSecrets(sanitized)
  }
})
