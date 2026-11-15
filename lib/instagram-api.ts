import { isMetaThrottled, recordMetaApiResponse } from "./meta-rate-limit"

const GRAPH = "https://graph.instagram.com/v24.0"
const FB_GRAPH = "https://graph.facebook.com/v24.0"

function getGraphBase(token: string) {
  return token.startsWith("EAA") ? FB_GRAPH : GRAPH
}

export interface IGButton {
  type: "web_url" | "postback"
  title: string
  url?: string
  payload?: string
}

export interface IGCard {
  title: string
  subtitle?: string
  image_url?: string
  buttons: IGButton[]
}

export interface QuickReply {
  title: string
  payload: string
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: any
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Validates whether an Instagram comment was published within Meta's mandatory
 * 7-day private reply window. Comments older than 7 days cannot receive private DMs.
 * Includes a 5-minute safety buffer to account for clock skew with Meta servers.
 */
export function isCommentWithin7Days(timestamp: string | number | Date | null | undefined): boolean {
  if (!timestamp) return true
  // Handle Unix timestamp in seconds (Meta webhooks sometimes send numeric seconds)
  const numeric = typeof timestamp === "number" ? timestamp : Number(timestamp)
  let commentTime: number
  if (!isNaN(numeric) && numeric > 0 && numeric < 10000000000) {
    commentTime = numeric * 1000
  } else {
    commentTime = new Date(timestamp).getTime()
  }
  if (isNaN(commentTime)) return true
  const ageMs = Date.now() - commentTime
  // Up to 7 days minus 5-minute safety cushion
  return ageMs >= 0 && ageMs < SEVEN_DAYS_MS - 5 * 60 * 1000
}

/**
 * Identifies official Meta Graph API errors that are permanent and non-retryable
 * (e.g. comment older than 7 days, comment already replied to, user blocked bot).
 * Halts redundant retries to protect account rate limits and avoid abuse flags.
 */
export function isNonRetryableMetaError(error: any): boolean {
  if (!error) return false
  const code = error.code
  const subcode = error.error_subcode

  // Error 100: Invalid parameter / Comment ID expired (> 7 days) / Comment already replied to
  if (code === 100 && (subcode === 2018001 || subcode === 2534040)) return true

  // Error 551: Recipient unavailable (user blocked account, deactivated profile, or privacy settings)
  if (code === 551) return true

  // Error 368: Temporarily Blocked for Spam / Policy Violation (Section 7)
  if (code === 368 || subcode === 368) return true

  // Error 190: Access Token Expired or Revoked (subcodes 460, 463, 467)
  if (code === 190) return true

  // Error 10: Permission denied / message outside 24h window
  if (code === 10 && subcode === 2018001) return true

  const msg = String(error.message || "").toLowerCase()
  if (msg.includes("7 days") || msg.includes("already replied") || msg.includes("cannot message this user")) {
    return true
  }

  return false
}

async function post(path: string, token: string, body: any, businessAccountId?: string): Promise<SendResult> {
  try {
    // 1. Check Meta BUC Rate Limit Circuit Breaker (Section 5.B: 80% quota breaker)
    const throttleStatus = isMetaThrottled(businessAccountId)
    if (throttleStatus.throttled) {
      console.warn(
        `[ig-api] 🛑 Outbound request to ${path} blocked: Meta rate limit circuit breaker active (${throttleStatus.waitSeconds}s remaining). Reason: ${throttleStatus.reason}`,
      )
      return {
        ok: false,
        error: {
          code: 429,
          message: `Meta API circuit breaker active (${throttleStatus.waitSeconds}s remaining)`,
          retry_after: throttleStatus.waitSeconds,
        },
      }
    }

    const base = getGraphBase(token)
    // Dynamic endpoint resolution:
    // - User Access Tokens MUST call /{businessAccountId}/messages (they cannot call /me/messages).
    // - Page Access Tokens work with both /{businessAccountId}/messages and /me/messages.
    const targets = path === "me/messages" && businessAccountId
      ? [`${businessAccountId}/messages`, "me/messages"]
      : [path]

    let lastError: any = null
    for (const target of targets) {
      try {
        const res = await fetch(`${base}/${target}?access_token=${encodeURIComponent(token)}`, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const json = await res.json().catch(() => ({}))

        // Actively monitor Meta BUC headers (x-business-use-case-usage) on every response
        recordMetaApiResponse(res.headers, res.status, businessAccountId, json.error)

        if (res.ok && !json.error) {
          console.log(`[ig-api] ${target} success:`, JSON.stringify(json))
          return { ok: true, id: json.id || json.message_id }
        }
        lastError = json.error || `HTTP ${res.status}`
        if (isNonRetryableMetaError(json.error)) {
          console.warn(`[ig-api] ${target} non-retryable Meta error (dropping retry):`, JSON.stringify(lastError))
          return { ok: false, error: lastError }
        }
        if (res.status === 429 || json.error?.code === 4 || json.error?.code === 17 || json.error?.code === 32) {
          console.warn(`[ig-api] ${target} throttled by Meta (dropping target retry):`, JSON.stringify(lastError))
          return { ok: false, error: lastError }
        }
        console.warn(`[ig-api] ${target} failed, attempting next target:`, JSON.stringify(lastError))
      } catch (e) {
        lastError = e
      }
    }
    return { ok: false, error: lastError }
  } catch (e) {
    console.error(`[ig-api] ${path} network error:`, e)
    return { ok: false, error: e }
  }
}

export function buildCardAttachment(card: IGCard) {
  const buttons = (card.buttons || [])
    .filter((b) => b.title)
    .map((b) => ({
      type: b.type,
      title: b.title,
      url: b.type === "web_url" ? b.url : undefined,
      payload: b.type === "postback" ? b.payload : undefined,
    }))
  const element: any = { title: card.title, buttons }
  if (card.subtitle) element.subtitle = card.subtitle
  if (card.image_url?.startsWith("http")) element.image_url = card.image_url
  return {
    attachment: {
      type: "template",
      payload: { template_type: "generic", elements: [element] },
    },
  }
}

/**
 * Build the initial opt-in card sent as the private reply to a comment.
 * Prompts the commenter to click "Send me the link", which both verifies
 * follow status and opens the 24-hour messaging window.
 */
export function buildInitialLinkRequestCard(params: {
  ruleId: string
  title?: string
  subtitle?: string
  buttonText?: string
  imageUrl?: string
}): IGCard {
  const title = (params.title || "Hey there! I'm so happy you're here, thanks so much for your interest 😊").slice(0, 80)
  const subtitle = (params.subtitle || "Click below and I'll send you the link in just a sec ✨").slice(0, 80)
  const buttonTitle = (params.buttonText || "Send me the link").slice(0, 20)

  const card: IGCard = {
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

/**
 * Build the follower-gate card shown when a user clicks "Send me the link"
 * but is not yet following the creator.
 */
export function buildFollowGateCard(params: {
  username: string
  ruleId: string
  title?: string
  subtitle?: string
  imageUrl?: string
  buttonFollowText?: string
  buttonUnlockText?: string
  profileUrl?: string
}): IGCard {
  const title = (params.title || "Oh no! It seems you're not following me 👀").slice(0, 80)
  const defaultSub = "Follow @{username} first, then tap 'I'm following' below to get your link! ✨"
  const rawSub = params.subtitle || defaultSub
  const subtitle = rawSub.replace(/{username}/g, params.username).slice(0, 80)
  const followTitle = (params.buttonFollowText || "Visit Profile").slice(0, 20)
  const unlockTitle = (params.buttonUnlockText || "I'm following ✅").slice(0, 20)
  const profileUrl = params.profileUrl || `https://instagram.com/${params.username}`

  const card: IGCard = {
    title,
    subtitle,
    buttons: [
      { type: "web_url", url: profileUrl, title: followTitle },
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

/**
 * Build the card shown when the user taps "I'm following ✅" but is still not following.
 */
export function buildStillNotFollowingCard(params: {
  username: string
  ruleId: string
  profileUrl?: string
}): IGCard {
  const title = "Oh no! Still not following 👀"
  const subtitle = `Please visit @${params.username}'s profile, tap Follow, and then click 'I'm following ✅' below!`
  const profileUrl = params.profileUrl || `https://instagram.com/${params.username}`

  return {
    title,
    subtitle,
    buttons: [
      { type: "web_url", url: profileUrl, title: "Visit Profile" },
      { type: "postback", title: "I'm following ✅", payload: `UNLOCK_CONTENT_${params.ruleId}` },
    ],
  }
}

export async function sendTextDM(
  token: string,
  recipient: { id?: string; comment_id?: string },
  text: string,
  quickReplies?: QuickReply[],
  businessAccountId?: string,
): Promise<SendResult> {
  const message: any = { text }
  if (quickReplies?.length) {
    message.quick_replies = quickReplies.slice(0, 13).map((q) => ({
      content_type: "text",
      title: q.title.slice(0, 20),
      payload: q.payload,
    }))
  }
  return post("me/messages", token, { recipient, message }, businessAccountId)
}

export async function sendCardDM(
  token: string,
  recipient: { id?: string; comment_id?: string },
  card: IGCard,
  businessAccountId?: string,
): Promise<SendResult> {
  return post("me/messages", token, { recipient, message: buildCardAttachment(card) }, businessAccountId)
}

export async function sendMediaDM(
  token: string,
  recipient: { id?: string; comment_id?: string },
  mediaType: "image" | "video" | "audio",
  url: string,
  businessAccountId?: string,
): Promise<SendResult> {
  return post("me/messages", token, {
    recipient,
    message: { attachment: { type: mediaType, payload: { url } } },
  }, businessAccountId)
}

export async function sendSenderAction(
  token: string,
  recipientId: string,
  action: "typing_on" | "typing_off" | "mark_seen",
  businessAccountId?: string,
): Promise<SendResult> {
  return post("me/messages", token, { recipient: { id: recipientId }, sender_action: action }, businessAccountId)
}

export async function sendMessageReaction(
  token: string,
  recipientId: string,
  messageId: string,
  reaction = "love",
  businessAccountId?: string,
): Promise<SendResult> {
  return post("me/messages", token, {
    recipient: { id: recipientId },
    sender_action: "react",
    payload: { message_id: messageId, reaction },
  }, businessAccountId)
}

/**
 * Sanitizes and enforces Meta's technical limits for public comment replies
 * (Section 4 of rules and regulations.md):
 * - Max length: 2,200 characters (clamped to 2,190 with safety margin).
 * - Max mentions: Meta permits up to 5; safely clamped to <= 3 to avoid spam triggers.
 * - Max hashtags: Meta permits up to 30; safely clamped to <= 3 in automated replies.
 */
export function sanitizePublicCommentReply(text: string): string {
  if (!text) return ""
  let sanitized = String(text).trim()

  // 1. Clamp length to 2,190 characters (safe ceiling under 2,200)
  if (sanitized.length > 2190) {
    sanitized = sanitized.slice(0, 2190).trim()
  }

  // 2. Clamp @mentions to at most 3
  let mentionCount = 0
  sanitized = sanitized.replace(/@([a-zA-Z0-9._]+)/g, (match, username) => {
    mentionCount++
    if (mentionCount > 3) {
      return username // strip leading @ so it's not parsed as an active mention
    }
    return match
  })

  // 3. Clamp #hashtags to at most 3
  let hashtagCount = 0
  sanitized = sanitized.replace(/#([a-zA-Z0-9_\u0590-\u05ff]+)/g, (match, tag) => {
    hashtagCount++
    if (hashtagCount > 3) {
      return tag // strip leading # so it doesn't count as a hashtag
    }
    return match
  })

  return sanitized
}

export async function replyToComment(token: string, commentId: string, message: string): Promise<SendResult> {
  const sanitized = sanitizePublicCommentReply(message)
  return post(`${commentId}/replies`, token, { message: sanitized })
}

export async function fetchProfile(token: string, igUserId: string): Promise<{ username?: string; name?: string } | null> {
  try {
    const base = getGraphBase(token)
    const res = await fetch(`${base}/${igUserId}?fields=username,name&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) })
    const json = await res.json()
    if (!res.ok || json.error) return null
    return json
  } catch {
    return null
  }
}

export async function verifyIdOwnership(token: string, id: string): Promise<boolean> {
  try {
    const base = getGraphBase(token)
    const res = await fetch(`${base}/${id}?fields=id&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(5000) })
    return res.ok
  } catch {
    return false
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, Math.min(ms, 8000)))
}

export { isMetaThrottled, recordMetaApiResponse } from "./meta-rate-limit"
