const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

// Disallowed hostnames and IP patterns for SSRF prevention
const BLOCKED_HOST_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|169\.254\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\]|.*\.internal|.*\.local)$/i

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    // Enforce HTTPS
    if (parsed.protocol !== "https:") return false
    // Block loopback, link-local, and private cloud metadata IPs
    if (BLOCKED_HOST_REGEX.test(parsed.hostname)) return false
    return true
  } catch {
    return false
  }
}

function resolveEndpoint(userBaseUrl?: string | null): { url: string; isCustom: boolean } {
  if (userBaseUrl && userBaseUrl.trim()) {
    const trimmed = userBaseUrl.trim()
    if (isSafeExternalUrl(trimmed)) {
      const base = trimmed.replace(/\/+$/, "")
      return {
        url: base.endsWith("/chat/completions") ? base : `${base}/chat/completions`,
        isCustom: true,
      }
    } else {
      console.warn(`[ai-reply] Blocked unsafe or non-HTTPS base URL: ${trimmed}`)
    }
  }

  // Fallback to official trusted endpoints
  const defaultUrl = process.env.AI_BASE_URL || (process.env.GROQ_API_KEY ? GROQ_URL : OPENAI_URL)
  return {
    url: isSafeExternalUrl(defaultUrl) ? defaultUrl : GROQ_URL,
    isCustom: false,
  }
}

export async function generateAIReply(
  userMessage: string,
  aiContext: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [],
  userApiKey?: string | null,
  userBaseUrl?: string | null,
  userModel?: string | null,
): Promise<string | null> {
  const { url: endpoint, isCustom } = resolveEndpoint(userBaseUrl)

  // CRITICAL: If target endpoint is a custom user-defined URL, NEVER send the server's master key.
  // Custom endpoints MUST supply their own userApiKey to prevent master key leakage via SSRF.
  let apiKey: string | null = null
  if (isCustom) {
    if (!userApiKey) {
      console.warn("[ai-reply] Refusing to send server API key to custom external endpoint")
      return null
    }
    apiKey = userApiKey
  } else {
    apiKey = userApiKey || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || null
  }

  if (!apiKey) {
    console.warn("[ai-reply] No API key available for LLM completion")
    return null
  }

  const model = userModel || process.env.AI_MODEL || (process.env.GROQ_API_KEY ? "llama-3.1-8b-instant" : "gpt-4o-mini")

  let knowledgeSummary = aiContext?.trim() || ""
  let toneGuidance = "Casual Instagram tone. No hashtags. Never reveal you are AI."
  let safetyRules: string[] = []

  try {
    const parsed = JSON.parse(knowledgeSummary)
    if (parsed && typeof parsed === "object") {
      const parts: string[] = []
      if (parsed.business_name) parts.push(`Business: ${parsed.business_name}`)
      if (parsed.industry) parts.push(`Industry: ${parsed.industry}`)
      if (parsed.business_description) parts.push(`About: ${parsed.business_description}`)
      if (parsed.services_and_pricing || parsed.services) parts.push(`Services & Pricing: ${parsed.services_and_pricing || parsed.services}`)
      if (parsed.operating_hours || parsed.hours_location) parts.push(`Hours: ${parsed.operating_hours || parsed.hours_location}`)
      if (parsed.location_service_area) parts.push(`Service Area: ${parsed.location_service_area}`)
      if (parsed.refund_and_cancellation_policy || parsed.policies) parts.push(`Policies: ${parsed.refund_and_cancellation_policy || parsed.policies}`)
      if (parsed.support_email || parsed.support_phone) {
        parts.push(`Contact: ${[parsed.support_email, parsed.support_phone].filter(Boolean).join(", ")}`)
      }

      // FAQs array
      if (Array.isArray(parsed.faqs) && parsed.faqs.length > 0) {
        const faqText = parsed.faqs
          .filter((f: any) => f?.question && f?.answer)
          .map((f: any) => `Q: ${f.question} -> A: ${f.answer}`)
          .join("; ")
        if (faqText) parts.push(`Approved FAQs: [${faqText}]`)
      } else if (parsed.faq) {
        parts.push(`FAQ: ${parsed.faq}`)
      }

      if (parsed.custom_instructions) {
        parts.push(`Custom Instructions: ${parsed.custom_instructions}`)
      }

      // Tone selection
      if (parsed.ai_tone === "hinglish") {
        toneGuidance = "Natural, modern conversational style (casual English with natural phrasing where fitting, friendly and polite)."
      } else if (parsed.ai_tone === "professional") {
        toneGuidance = "Polite, concise, authoritative professional business tone."
      } else if (parsed.ai_tone === "creator") {
        toneGuidance = "High-energy, authentic creator vibe. Short, punchy, engaging."
      } else {
        toneGuidance = "Warm, welcoming, friendly customer support tone."
      }

      // Customer Privacy & Safety Guardrails
      if (parsed.guardrail_block_sensitive_data !== false) {
        safetyRules.push("SAFETY RULE: NEVER ask for or collect sensitive personal data in DMs (passwords, OTP, Bank account, UPI PIN, cards, Aadhaar, PAN). If a customer offers payment details, direct them to official secure checkout.")
      }
      if (parsed.guardrail_respect_opt_out !== false) {
        safetyRules.push("If the user says 'stop', 'unsubscribe', or asks to delete their data, confirm immediately and politely.")
      }

      if (parts.length > 0) {
        knowledgeSummary = parts.join(". ")
      }
    }
  } catch {}

  const safetyText = safetyRules.length > 0 ? `\nMandatory Safety Guardrails: ${safetyRules.join(" ")}` : ""

  const systemPrompt = knowledgeSummary
    ? `You are replying to Instagram DMs on behalf of this business:\n${knowledgeSummary}\n\nRules: max 1 short sentence, ${toneGuidance}, no hashtags, no emojis unless natural.${safetyText}`
    : `You are replying to Instagram DMs. Keep replies to 1 short sentence. ${toneGuidance}. No hashtags. Never reveal you are AI.${safetyText}`

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory.slice(-10),
          { role: "user", content: userMessage },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })
    if (!res.ok) {
      const errText = await res.text()
      console.error("[ai-reply] API error", res.status, errText.slice(0, 200))
      return null
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (e) {
    console.error("[ai-reply] fetch error", e)
    return null
  }
}
