import test from "node:test"
import assert from "node:assert/strict"

// ── PURE CONTRACT IMPLEMENTATIONS (from lib/instagram-api.ts & webhook) ──

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

function buildFollowGateCard(params) {
  const title = (params.title || "Oh no! It seems you're not following me 👀").slice(0, 80)
  const subtitle = (params.subtitle || "Follow my profile first, then tap below to get your link! ✨").slice(0, 80)
  const followTitle = (params.followButtonText || "Visit Profile").slice(0, 20)
  const unlockTitle = (params.unlockButtonText || "I'm following ✅").slice(0, 20)

  const card = {
    title,
    subtitle,
    buttons: [
      { type: "web_url", url: `https://instagram.com/${(params.creatorUsername || "instagram").replace(/^@/, "")}`, title: followTitle },
      { type: "postback", title: unlockTitle, payload: `UNLOCK_CONTENT_${params.ruleId}` },
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

function resolvePayloadMedia(content) {
  if (!content || typeof content !== "object") return null
  if (content.type === "card") {
    return {
      type: "card",
      imageUrl: content.card_data?.image_url || content.card?.image_url || null,
      title: content.card_data?.title || content.card?.title || "",
      subtitle: content.card_data?.subtitle || content.card?.subtitle || "",
    }
  }
  if (content.type === "media") {
    return {
      type: "media",
      mediaType: content.media_type || "image",
      mediaUrl: content.media_url || null,
    }
  }
  return {
    type: "text",
    text: content.text || content.response_content || "",
  }
}

// ── TEST SUITE: ISOLATION STRESS TESTING ──

test("QA Stress: 1. Strict boundary between initial greeting card and delivered payload card", () => {
  const testScenarios = [
    {
      name: "Text-only initial card + Image payload card",
      content: {
        type: "card",
        initial_title: "Hey there!",
        initial_image_url: undefined, // User did not upload initial image
        card_data: {
          title: "Get 50% Off Courses",
          image_url: "https://cdn.example.com/payload-sale.jpg",
          buttons: [{ title: "Buy Now", type: "web_url", url: "https://example.com" }],
        },
      },
      expectInitialHasImage: false,
      expectPayloadHasImage: true,
    },
    {
      name: "Image initial card + Different Image payload card",
      content: {
        type: "card",
        initial_title: "Welcome offer",
        initial_image_url: "https://cdn.example.com/initial-welcome.jpg",
        card_data: {
          title: "Your Personal Coupon",
          image_url: "https://cdn.example.com/payload-coupon.jpg",
        },
      },
      expectInitialHasImage: true,
      expectPayloadHasImage: true,
      expectedInitialImg: "https://cdn.example.com/initial-welcome.jpg",
      expectedPayloadImg: "https://cdn.example.com/payload-coupon.jpg",
    },
    {
      name: "Image initial card + Text-only payload",
      content: {
        type: "text",
        initial_image_url: "https://cdn.example.com/initial-badge.png",
        text: "Here is your secret promo code: FLASH2026",
      },
      expectInitialHasImage: true,
      expectPayloadHasImage: false,
    },
    {
      name: "Text-only initial card + Video media payload",
      content: {
        type: "media",
        media_type: "video",
        media_url: "https://cdn.example.com/demo.mp4",
      },
      expectInitialHasImage: false,
      expectPayloadHasImage: false,
    },
  ]

  for (const scenario of testScenarios) {
    const initialImg = resolveInitialCardImg(scenario.content)
    const initialCard = buildInitialLinkRequestCard({
      ruleId: "rule_100",
      title: scenario.content.initial_title,
      imageUrl: initialImg,
    })

    const payload = resolvePayloadMedia(scenario.content)

    if (scenario.expectInitialHasImage) {
      assert.ok(initialCard.image_url, `${scenario.name}: initial card must have image`)
      if (scenario.expectedInitialImg) {
        assert.equal(initialCard.image_url, scenario.expectedInitialImg)
      }
    } else {
      assert.equal(initialCard.image_url, undefined, `${scenario.name}: initial card must be strictly text-only`)
    }

    if (scenario.expectPayloadHasImage) {
      assert.ok(payload.imageUrl, `${scenario.name}: payload card must retain its image`)
      if (scenario.expectedPayloadImg) {
        assert.equal(payload.imageUrl, scenario.expectedPayloadImg)
      }
    }

    // Crucial check: verify that initialCard.image_url does not equal payload.imageUrl when initial is text-only
    if (!scenario.expectInitialHasImage && scenario.expectPayloadHasImage) {
      assert.notEqual(initialCard.image_url, payload.imageUrl, "Initial card must NOT inherit payload card image")
    }
  }
})

test("QA Stress: 2. Three-way image isolation (Initial Greeting vs Follow-Gate vs Payload)", () => {
  const content = {
    type: "card",
    check_follow: true,
    initial_title: "Step 1: Request Link",
    initial_image_url: "https://cdn.example.com/step1-greeting.jpg",
    follow_gate: {
      title: "Step 2: Gate Check",
      image_url: "https://cdn.example.com/step2-gate-lock.jpg",
    },
    card_data: {
      title: "Step 3: Unlocked Payload",
      image_url: "https://cdn.example.com/step3-unlocked-resource.jpg",
    },
  }

  // 1. Resolve Step 1: Initial Card
  const initialImg = resolveInitialCardImg(content)
  const initialCard = buildInitialLinkRequestCard({
    ruleId: "rule_abc",
    imageUrl: initialImg,
  })

  // 2. Resolve Step 2: Follow Gate Card
  const gateCard = buildFollowGateCard({
    ruleId: "rule_abc",
    imageUrl: content.follow_gate.image_url,
    creatorUsername: "testcreator",
  })

  // 3. Resolve Step 3: Payload Card
  const payload = resolvePayloadMedia(content)

  // Verify all 3 cards receive strictly their own independent images
  assert.equal(initialCard.image_url, "https://cdn.example.com/step1-greeting.jpg")
  assert.equal(gateCard.image_url, "https://cdn.example.com/step2-gate-lock.jpg")
  assert.equal(payload.imageUrl, "https://cdn.example.com/step3-unlocked-resource.jpg")

  // Verify no two images are identical
  assert.notEqual(initialCard.image_url, gateCard.image_url)
  assert.notEqual(initialCard.image_url, payload.imageUrl)
  assert.notEqual(gateCard.image_url, payload.imageUrl)
})

test("QA Stress: 3. Path sanitization and relative URL resolution", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://myproductionapp.com"

  const cardWithRelative = buildInitialLinkRequestCard({
    ruleId: "rule_rel",
    imageUrl: "/uploads/cover-art.png",
  })
  assert.equal(cardWithRelative.image_url, "https://myproductionapp.com/uploads/cover-art.png")

  // Relative with trailing slash normalization
  process.env.NEXT_PUBLIC_APP_URL = "https://myproductionapp.com/"
  const cardWithRelative2 = buildInitialLinkRequestCard({
    ruleId: "rule_rel2",
    imageUrl: "/uploads/cover-art.png",
  })
  assert.equal(cardWithRelative2.image_url, "https://myproductionapp.com/uploads/cover-art.png")
})

test("QA Stress: 4. Malformed, adversarial, and boundary input resilience", () => {
  // Empty, null, spaces, or corrupt types must never crash
  assert.equal(resolveInitialCardImg(null), undefined)
  assert.equal(resolveInitialCardImg(undefined), undefined)
  assert.equal(resolveInitialCardImg("string-instead-of-object"), undefined)
  assert.equal(resolveInitialCardImg({ initial_image_url: "   " }), undefined)
  assert.equal(resolveInitialCardImg({ initial_image_url: "" }), undefined)

  // XSS and SQL injection strings in titles/buttons
  const cardWithXSS = buildInitialLinkRequestCard({
    ruleId: "xss_test",
    title: "<script>alert('xss')</script> " + "A".repeat(120),
    subtitle: "'; DROP TABLE users; -- " + "B".repeat(120),
    buttonText: "<b>CLICK</b> " + "C".repeat(50),
    imageUrl: "https://evil.com/xss.jpg",
  })

  // Must truncate within Instagram Graph API length constraints
  assert.ok(cardWithXSS.title.length <= 80, "Title must be capped at 80 chars")
  assert.ok(cardWithXSS.subtitle.length <= 80, "Subtitle must be capped at 80 chars")
  assert.ok(cardWithXSS.buttons[0].title.length <= 20, "Button title must be capped at 20 chars")
  assert.equal(cardWithXSS.buttons[0].payload, "SEND_LINK_xss_test")
})
