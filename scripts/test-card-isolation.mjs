import test from "node:test"
import assert from "node:assert/strict"

// Pure implementation mirroring buildInitialLinkRequestCard contract from lib/instagram-api.ts
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

// Webhook & sync resolution logic for initial card image
function resolveInitialCardImg(content) {
  const gate = content.follow_gate || {}
  return (content.initial_image_url?.trim() || gate.initial_image_url?.trim()) || undefined
}

// Simulator check for displaying image in Stage 0 greeting card
function shouldRenderStage0Cover(initialImageUrl) {
  return Boolean(initialImageUrl?.trim())
}

test("Initial card without image remains strictly text-only", () => {
  const card = buildInitialLinkRequestCard({
    ruleId: "rule_1",
    imageUrl: undefined,
  })
  assert.equal(card.image_url, undefined)
  assert.equal(card.title, "Hey there! I'm so happy you're here, thanks so much for your interest 😊")
  assert.equal(card.buttons[0].title, "Send me the link")
})

test("Initial card with explicit image has image_url", () => {
  const card = buildInitialLinkRequestCard({
    ruleId: "rule_1",
    imageUrl: "https://example.com/greeting.png",
  })
  assert.equal(card.image_url, "https://example.com/greeting.png")
})

test("Webhook initialCardImg does NOT inherit payload card image or follow-gate image", () => {
  const content = {
    card: {
      title: "Payload ATS Resume",
      image_url: "https://example.com/payload.png",
    },
    follow_gate: {
      title: "Follow me first",
      image_url: "https://example.com/followgate.png",
    },
  }
  const initialImg = resolveInitialCardImg(content)
  assert.equal(initialImg, undefined, "Must be undefined to ensure text-only initial card")
})

test("Webhook initialCardImg correctly picks explicit initial_image_url", () => {
  const content = {
    initial_image_url: "https://example.com/custom-initial.jpg",
    card: {
      title: "Payload ATS Resume",
      image_url: "https://example.com/payload.png",
    },
  }
  const initialImg = resolveInitialCardImg(content)
  assert.equal(initialImg, "https://example.com/custom-initial.jpg")
})

test("Simulator Stage 0 cover renders if and only if initialImageUrl is non-empty", () => {
  assert.equal(shouldRenderStage0Cover(""), false)
  assert.equal(shouldRenderStage0Cover("   "), false)
  assert.equal(shouldRenderStage0Cover(undefined), false)
  assert.equal(shouldRenderStage0Cover(null), false)
  assert.equal(shouldRenderStage0Cover("https://cdn.example.com/photo.jpg"), true)
})
