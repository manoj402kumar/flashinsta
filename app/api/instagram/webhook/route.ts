/* @ts-nocheck */

import crypto from "crypto"
import { type NextRequest, NextResponse, after } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { ensureSchema } from "@/lib/supabase-migrate"
import {
  sendTextDM,
  sendCardDM,
  sendMediaDM,
  sendSenderAction,
  replyToComment,
  fetchProfile,
  verifyIdOwnership,
  sleep,
  buildFollowGateCard,
  buildInitialLinkRequestCard,
  buildStillNotFollowingCard,
  isCommentWithin7Days,
} from "@/lib/instagram-api"
import { generateAIReply } from "@/lib/ai-reply"
import { bumpUnlockAttempt, clearUnlockAttempts, unlockKey } from "@/lib/unlock-tracking"
import { isCommentAlreadyProcessed } from "@/lib/dedup"
import {
  detectOptAction,
  isRecipientOptedOut,
  optOutRecipient,
  optInRecipient,
  OPT_OUT_CONFIRMATION_TEXT,
  OPT_IN_CONFIRMATION_TEXT,
} from "@/lib/opt-out"
import { getSpintaxPublicReply, expandTemplate } from "@/lib/spintax"
import { checkAndIncrementWarmupQuota } from "@/lib/warmup"
import { applyHumanizedJitter } from "@/lib/jitter"
import { isMetaThrottled } from "@/lib/meta-rate-limit"
import {
  automationTargetsMediaId,
  getAutomationMediaIds,
  hasAutomationMediaTarget,
} from "@/lib/automation-media"

const WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
// Meta signs every webhook POST with HMAC-SHA256 of the raw body. Depending on app setup the
// signing key is the Instagram app secret or the parent Meta app secret, so accept either.
const APP_SECRETS = [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET].filter(
  (s): s is string => Boolean(s),
)

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (APP_SECRETS.length === 0 || !signatureHeader?.startsWith("sha256=")) return false
  const received = signatureHeader.slice("sha256=".length)
  return APP_SECRETS.some((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
    return (
      received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received, "utf8"), Buffer.from(expected, "utf8"))
    )
  })
}

const DEFAULT_PUBLIC_REPLIES = ["Check your DMs! 📥", "Sent! 🔥", "Check inbox! ✨"]

function getInstagramUsername(user: any): string {
  try {
    if (user.ai_context) {
      const parsed = typeof user.ai_context === "string" ? JSON.parse(user.ai_context) : user.ai_context
      if (parsed._instagram?.username) return parsed._instagram.username
    }
  } catch {}
  if (user.username && !user.username.includes("@")) return user.username
  return user.username || "creator"
}

// Max times we'll send the gate card for an unverifiable follow status on a single unlock event.
// After this, we send a single "couldn't verify your follow" message and stop spamming the user.
const UNLOCK_GATE_MAX_ATTEMPTS = 3

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && WEBHOOK_VERIFY_TOKEN && token === WEBHOOK_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: "Invalid token" }, { status: 403 })
}

// ============================================================
// Content parsing — response_content may be object or JSON string
// ============================================================
function parseContent(raw: any) {
  if (!raw) return {}
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw)
    } catch {
      return { message: raw }
    }
  }
  return raw
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function keywordMatches(triggerValue: string, text: string): boolean {
  if (!triggerValue || !text) return false
  const normText = text.toLowerCase().trim()
  return triggerValue
    .split(",")
    .map((k: string) => k.trim())
    .filter(Boolean)
    .some((k: string) => {
      const normK = k.toLowerCase()
      if (normText.includes(normK)) return true
      const cleanK = normK.replace(/[^a-z0-9]/g, "")
      const cleanText = normText.replace(/[^a-z0-9]/g, "")
      if (cleanK && cleanText.includes(cleanK)) return true
      try {
        return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
      } catch {
        return false
      }
    })
}

function isWildcardTrigger(triggerValue?: string | null): boolean {
  if (!triggerValue) return true
  const trimmed = triggerValue.trim().toLowerCase()
  return (
    trimmed === "" ||
    trimmed === "all" ||
    trimmed === "all_replies" ||
    trimmed === "all_reactions" ||
    trimmed === "all_mentions" ||
    trimmed === "all_comments" ||
    trimmed === "*"
  )
}

function isEmoji(str: string): boolean {
  if (!str) return false
  return /\p{Extended_Pictographic}/u.test(str)
}

// ============================================================
// Unified response sender — handles text, card, media, quick
// replies, typing indicators, and human-like delays.
// ============================================================
async function sendAutomationResponse(
  token: string,
  recipient: { id?: string; comment_id?: string },
  content: any,
  opts: { skipTyping?: boolean; businessAccountId?: string; variables?: { username?: string; name?: string } } = {},
) {
  const delaySeconds = Number(content.delay_seconds) || 0
  const useTyping = content.typing_indicator === true && recipient.id && !opts.skipTyping

  if (useTyping) await sendSenderAction(token, recipient.id!, "typing_on", opts.businessAccountId)
  // Enforce Meta humanized pacing delay (Section 6.2: 3s to 15s randomized jitter)
  await applyHumanizedJitter("dm", delaySeconds)

  const quickReplies = Array.isArray(content.quick_replies)
    ? content.quick_replies
        .filter((q: any) => q?.title)
        .map((q: any) => ({ title: q.title, payload: q.payload || `QR_${q.title.toUpperCase().replace(/\s+/g, "_")}` }))
    : undefined

  // Dynamically expand spintax notation and template variables (anti-spam protection)
  const messageText = content.message ? expandTemplate(content.message, opts.variables) : ""
  let cardPayload = content.card
  if (cardPayload) {
    cardPayload = {
      ...cardPayload,
      title: cardPayload.title ? expandTemplate(cardPayload.title, opts.variables) : "",
      subtitle: cardPayload.subtitle ? expandTemplate(cardPayload.subtitle, opts.variables) : undefined,
    }
  }

  let result
  if (content.media?.url) {
    result = await sendMediaDM(token, recipient, content.media.type || "image", content.media.url, opts.businessAccountId)
    if (result.ok && messageText) {
      result = await sendTextDM(token, recipient, messageText, quickReplies, opts.businessAccountId)
    }
  } else if (cardPayload) {
    result = await sendCardDM(token, recipient, cardPayload, opts.businessAccountId)
  } else if (messageText) {
    result = await sendTextDM(token, recipient, messageText, quickReplies, opts.businessAccountId)
  } else {
    result = { ok: false, error: "empty content" }
  }

  if (useTyping) await sendSenderAction(token, recipient.id!, "typing_off", opts.businessAccountId)
  return result
}

function responsePreviewText(content: any): string {
  if (content.message) return content.message
  if (content.card) return `[Card] ${content.card.title}`
  if (content.media?.url) return `[${content.media.type || "media"}]`
  return "[automation]"
}

// ============================================================
// Instagram API Helper: Verifies actual follow status
// API: GET https://graph.instagram.com/v21.0/{recipientId}?fields=is_user_follow_business
// Returns:
//   { follows: true, error: undefined }  → confirmed following
//   { follows: false, error: undefined } → confirmed NOT following
//   { follows: null, error: 'auth' } → auth/permission failure (401, 403) — fail CLOSED
//   { follows: null, error: 'transient' } → transient failure (5xx, timeout) — fail OPEN
// ============================================================
async function verifyFollowStatus(igScopedId: string, pageAccessToken: string): Promise<{ follows: boolean | null; error?: 'auth' | 'transient' }> {
  try {
    const baseGraph = pageAccessToken.startsWith("EAA")
      ? "https://graph.facebook.com/v21.0"
      : "https://graph.instagram.com/v21.0"
    const url = `${baseGraph}/${igScopedId}?fields=is_user_follow_business&access_token=${pageAccessToken}`
    // 5s timeout -- Graph API is fast, anything longer means trouble
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[webhook] Follow status check failed: ${response.status} ${errorText}`)
      // Distinguish auth failures (fail closed) from transient (fail open)
      if (response.status === 401 || response.status === 403) {
        return { follows: null, error: 'auth' }
      }
      // 5xx, 429, network timeout, etc. → transient, fail open
      return { follows: null, error: 'transient' }
    }
    const data = await response.json()
    const follows = data.is_user_follow_business === true
    console.log(`[webhook] Follow check for ${igScopedId}: is_user_follow_business=${data.is_user_follow_business} => ${follows ? "FOLLOWS" : "NOT FOLLOWING"}`)
    return { follows, error: undefined }
  } catch (error: any) {
    console.error("[webhook] Error checking follow status:", error)
    // AbortSignal.timeout throws AbortError/TimeoutError -- both are transient
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      return { follows: null, error: 'transient' }
    }
    // Network error → transient, fail open
    return { follows: null, error: 'transient' }
  }
}

// Unlock-attempt counter is in lib/unlock-tracking.ts -- uses Supabase
// unlock_attempts table so the 3-attempt cap works across Vercel instances.

// ============================================================
// Asynchronous Webhook Processor
// Runs in background via after() to ensure Meta receives 200 OK in < 50ms
// ============================================================
async function processWebhookEntries(entries: any[]) {
  // Ensure schema is up-to-date on cold start
  ensureSchema().catch((e) => console.warn("[webhook] ensureSchema failed:", e?.message))
  const supabase = getSupabaseAdmin()

  for (const entry of entries) {
      // Skip pure system events (echo / read / delivery)
      if (entry.messaging) {
        const isSystemEvent = entry.messaging.every(
          (event: any) => event.read || event.delivery || (event.message && event.message.is_echo),
        )
        if (isSystemEvent) continue
      }

      const webhookId = entry.id

      // ---------- User resolution: direct, payload fallback, token verify ----------
      // Use .limit(1) instead of .single() to avoid PGRST116 when multiple rows match
      let user = null
      const { data: matchedUsers } = await supabase
        .from("users")
        .select("*")
        .or(`business_account_id.eq.${webhookId},page_id.eq.${webhookId}`)
        .order("updated_at", { ascending: false })
        .limit(1)

      if (matchedUsers?.length) {
        user = matchedUsers[0]
      }

      if (!user) {
        const candidateIds = new Set<string>()
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value?.media?.owner?.id) candidateIds.add(String(change.value.media.owner.id))
          }
        }
        if (entry.messaging) {
          for (const event of entry.messaging) {
            if (event.recipient?.id) candidateIds.add(String(event.recipient.id))
          }
        }
        for (const candidateId of candidateIds) {
          if (candidateId === webhookId) continue
          const { data: fallbackUsers } = await supabase
            .from("users")
            .select("*")
            .or(`business_account_id.eq.${candidateId},page_id.eq.${candidateId}`)
            .order("updated_at", { ascending: false })
            .limit(1)
          if (fallbackUsers?.length) {
            user = fallbackUsers[0]
            await supabase.from("users").update({ page_id: webhookId }).eq("id", user.id)
            break
          }
        }
      }

      if (!user) {
        console.warn(`[webhook] Could not resolve registered tenant for webhook ID: ${webhookId}. Skipping unmapped event.`)
        continue
      }

      // Query automations for the resolved user account
      const { data: automations } = await supabase
        .from("automations")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)

      if (!automations?.length && !user.groq_auto_reply_enabled) continue

      // Candidate tokens for resilient execution (Page Token & fallback User Token)
      const candidateTokens = [user.access_token].filter(Boolean) as string[]
      try {
        if (user.ai_context) {
          const parsed = typeof user.ai_context === "string" ? JSON.parse(user.ai_context) : user.ai_context
          if (parsed._instagram?.accessToken && !candidateTokens.includes(parsed._instagram.accessToken)) {
            candidateTokens.push(parsed._instagram.accessToken)
          }
          if (parsed._instagram?.pageAccessToken && !candidateTokens.includes(parsed._instagram.pageAccessToken)) {
            candidateTokens.push(parsed._instagram.pageAccessToken)
          }
          if (parsed._instagram?.userAccessToken && !candidateTokens.includes(parsed._instagram.userAccessToken)) {
            candidateTokens.push(parsed._instagram.userAccessToken)
          }
        }
      } catch {}

      const businessAccountId = user.business_account_id || webhookId

      // Check if account is halted due to Meta Error 368 or rate limit circuit breaker
      const haltStatus = isMetaThrottled(businessAccountId)
      if (haltStatus.throttled) {
        console.warn(
          `[webhook] 🛑 Account ${businessAccountId} automations halted (${haltStatus.waitSeconds}s remaining): ${haltStatus.reason}. Skipping webhook entry.`,
        )
        continue
      }

      const safeSendAutomationResponse = async (recipient: any, respContent: any, opts: any = {}) => {
        for (const t of candidateTokens) {
          const res = await sendAutomationResponse(t, recipient, respContent, { ...opts, businessAccountId })
          if (res.ok) return res
        }
        return { ok: false, error: "Failed to send automation response with all tokens" }
      }

      const safeSendCardDM = async (recipient: any, card: any) => {
        for (const t of candidateTokens) {
          const res = await sendCardDM(t, recipient, card, businessAccountId)
          if (res.ok) return res
        }
        return { ok: false, error: "Failed to send card DM with all tokens" }
      }

      const safeSendTextDM = async (recipient: any, text: string, quickReplies?: any) => {
        for (const t of candidateTokens) {
          const res = await sendTextDM(t, recipient, text, quickReplies, businessAccountId)
          if (res.ok) return res
        }
        return { ok: false, error: "Failed to send text DM with all tokens" }
      }

      const safeVerifyFollowStatus = async (igScopedId: string) => {
        for (const t of candidateTokens) {
          const res = await verifyFollowStatus(igScopedId, t)
          if (res.follows !== null) return res
        }
        return { follows: null, error: 'auth' as const }
      }

      const safeReplyToComment = async (cId: string, msg: string) => {
        // Enforce Meta humanized pacing delay (Section 6.2: 5s to 45s randomized jitter)
        await applyHumanizedJitter("comment")
        for (const t of candidateTokens) {
          const res = await replyToComment(t, cId, msg)
          if (res.ok) {
            console.log(`[webhook] ✅ Comment reply successfully posted with token:`, res.id)
            return res
          }
        }
        return { ok: false, error: "Failed to post comment reply with all tokens" }
      }

      // Track handled events within this entry to avoid duplicate replies across passes
      const handledMessageIds = new Set<string>()

      // ============================================================
      //  PART A: COMMENTS
      // ============================================================
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field !== "comments" || !change.value?.text) continue

          // Skip hidden or flagged offensive comments (Section 4 of Meta Rules)
          if (change.value.is_hidden === true) {
            console.log(`[webhook] ⏭️ Comment ${change.value.id} is hidden or flagged offensive. Skipping.`)
            continue
          }

          const commentId = change.value.id
          const commentText = change.value.text.toLowerCase().trim()
          const senderId = change.value.from.id
          const mediaId = String(change.value.media.id)
          const parentId = change.value.parent_id || null

          if (senderId === webhookId || senderId === user.business_account_id || senderId === user.page_id) continue

          const commenterUsername = change.value.from?.username || change.value.username || ""

          const commentAutomations = (automations || []).filter((a: any) => a.trigger_source === "comment")

          const isReplyAllRule = (a: any) =>
            a.trigger_type === "reply_all" ||
            (a.trigger_value || "").toUpperCase().trim() === "ALL" ||
            (a.trigger_value || "").toUpperCase().trim() === "ALL_COMMENTS"

          const targetsThisMedia = (a: any) => automationTargetsMediaId(a, mediaId)
          const isGlobalRule = (a: any) => !hasAutomationMediaTarget(a)

          // Priority: specific post keyword → specific post reply-all → global keyword → global reply-all
          let match = commentAutomations.find(
            (a: any) =>
              targetsThisMedia(a) &&
              a.trigger_type === "keyword" &&
              keywordMatches(a.trigger_value, commentText),
          )
          if (!match) {
            match = commentAutomations.find(
              (a: any) => targetsThisMedia(a) && isReplyAllRule(a),
            )
          }
          if (!match) {
            match = commentAutomations.find(
              (a: any) =>
                isGlobalRule(a) &&
                a.trigger_type === "keyword" &&
                keywordMatches(a.trigger_value, commentText),
            )
          }
          if (!match) {
            match = commentAutomations.find(
              (a: any) => isGlobalRule(a) && isReplyAllRule(a),
            )
          }
          if (!match) continue

          // Deduplication: ensure each comment receives at most 1 DM / reply across Webhook & Sync-Comments
          if (await isCommentAlreadyProcessed(commentId, user.id, match.id, mediaId, commenterUsername, commentText)) {
            console.log(`[webhook] ⏭️ Comment ${commentId} already processed, skipping duplicate.`)
            continue
          }

          // Enforce 14-day progressive warm-up quota (Section 6.4 & 9 of Meta Rules)
          const warmupCheck = await checkAndIncrementWarmupQuota(user.id, user.created_at)
          if (!warmupCheck.allowed) {
            console.log(`[webhook] 🛑 Account warm-up limit reached for user ${user.id} (${warmupCheck.reason}). Skipping automated action to preserve account standing.`)
            continue
          }

          const content = parseContent(match.response_content)

          // Skip nested replies unless user opted in
          if (parentId && content.include_replies !== true) continue

          console.log(`[webhook] ✅ Comment match: "${match.name}"`)

          // reply_mode: 'both' (default) | 'dm_only' | 'public_only'
          const replyMode = content.reply_mode || "both"

          // Helper: pick a public reply with Spintax variation & commenter @tag (Meta anti-ban protection)
          const userReplies = Array.isArray(content.public_replies) && content.public_replies.length > 0
            ? content.public_replies
            : (content.public_reply ? [content.public_reply] : [])
          const getPublicReply = (): string =>
            getSpintaxPublicReply(commenterUsername, userReplies)

          // Check if commenter has opted out of automated DMs (Meta Platform Terms compliance)
          const isSenderOptedOut = await isRecipientOptedOut(user.id, senderId)
          if (isSenderOptedOut) {
            console.log(`[webhook] 🛑 Commenter @${senderId} has opted out of automated DMs. Skipping private outreach.`)
          }

          // Check if comment is within Meta's mandatory 7-day private reply window
          const commentCreatedTime = change.value.created_time || change.value.timestamp
          const isFresh = isCommentWithin7Days(commentCreatedTime)
          if (!isFresh) {
            console.log(`[webhook] ⏭️ Comment ${commentId} published over 7 days ago (${commentCreatedTime}). Ineligible for private reply.`)
          }

          // ===== 2-STEP OPT-IN FOR COMMENTS =====
          // In Instagram Graph API, the private reply to a comment always sends the initial "Send me the link"
          // opt-in card. Tapping "Send me the link" opens the 24h messaging window and triggers:
          //   - Follower Gate verification (if check_follow is true) before delivering payload
          //   - Direct payload delivery (if check_follow is false)
          if (replyMode !== "dm_only") {
            await safeReplyToComment(commentId, getPublicReply())
          }
          if (replyMode !== "public_only" && !isSenderOptedOut && isFresh) {
            const gate = content.follow_gate || {}
            const initialCardImg = (content.initial_image_url?.trim() || gate.initial_image_url?.trim()) || undefined
            console.log(`[webhook] 📩 Sending initial "Send me the link" card to @${senderId} on rule "${match.name}" (follow gate: ${content.check_follow ? "ON" : "OFF"})`)
            await safeSendCardDM(
              { comment_id: commentId },
              buildInitialLinkRequestCard({
                ruleId: match.id,
                title: gate.initial_title || content.initial_title || "Hey there! I'm so happy you're here, thanks so much for your interest 😊",
                subtitle: gate.initial_subtitle || content.initial_subtitle || "Click below and I'll send you the link in just a sec ✨",
                buttonText: gate.initial_button_text || content.initial_button_text || "Send me the link",
                imageUrl: initialCardImg,
              }),
            )
          }
        }
      }

      // ============================================================
      //  PART A.5: STORY AUTOMATIONS (mention / reaction / reply)
      // ============================================================
      if (entry.messaging) {
        for (const event of entry.messaging) {
          const senderId = event.sender?.id
          const recipientId = event.recipient?.id
          if (!senderId || event.read || event.delivery || event.message?.is_echo || senderId === recipientId) continue

          const storyObj = event.message?.reply_to?.story
          const isStoryMention = event.message?.attachments?.[0]?.type === "story_mention"
          const isStoryReply = Boolean(storyObj)
          const isReaction = Boolean(event.reaction)

          // Only process story-specific interactions in this pass
          if (!isStoryMention && !isStoryReply && !isReaction) continue

          const storyAutomations = (automations || []).filter((a: any) => a.trigger_source === "story")
          let match = null
          const storyMediaId = storyObj?.id || event.reaction?.mid || null
          const storyUrl = storyObj?.url || ""

          const isExactMediaMatch = (rule: any) => {
            const ruleMediaIds = getAutomationMediaIds(rule).filter((id) => id !== "ALL")
            if (ruleMediaIds.length === 0) return false
            return ruleMediaIds.some((ruleMediaId) => {
              if (storyMediaId && (storyMediaId === ruleMediaId || ruleMediaId.includes(storyMediaId) || storyMediaId.includes(ruleMediaId))) return true
              if (storyUrl && storyUrl.includes(ruleMediaId)) return true
              return false
            })
          }

          const matchesMedia = (rule: any) => {
            const ruleMediaIds = getAutomationMediaIds(rule).filter((id) => id !== "ALL")
            if (ruleMediaIds.length === 0) return true
            if (isExactMediaMatch(rule)) return true
            // If the user replied to an active story with the trigger keyword, allow match
            return true
          }

          const messageText = event.message?.text || ""
          const reactionEmoji = event.reaction?.emoji || event.reaction?.reaction || (isReaction ? "" : messageText)

          // 1. Story Mention
          if (isStoryMention) {
            match = storyAutomations.find(
              (a: any) =>
                a.trigger_type === "mention" &&
                matchesMedia(a),
            )
          }

          // 2. Specific Keyword Story Reply (NEVER match wildcards in this pass)
          if (!match && isStoryReply && messageText) {
            // First check if there is an exact media-specific keyword rule
            match = storyAutomations.find((a: any) => {
              if (a.trigger_type !== "reply" && a.trigger_type !== "reaction") return false
              if (isWildcardTrigger(a.trigger_value)) return false
              if (!isExactMediaMatch(a)) return false
              return keywordMatches(a.trigger_value, messageText)
            })

            // Then check any-media / general story keyword rule
            if (!match) {
              match = storyAutomations.find((a: any) => {
                if (a.trigger_type !== "reply" && a.trigger_type !== "reaction") return false
                if (isWildcardTrigger(a.trigger_value)) return false
                if (!matchesMedia(a)) return false
                return keywordMatches(a.trigger_value, messageText)
              })
            }
          }

          // 3. Specific Reaction / Emoji match (NEVER match wildcards in this pass)
          if (!match && (isReaction || (isStoryReply && reactionEmoji && isEmoji(reactionEmoji)))) {
            // First check exact media-specific reaction rule
            match = storyAutomations.find((a: any) => {
              if (a.trigger_type !== "reaction" && a.trigger_type !== "reply") return false
              if (isWildcardTrigger(a.trigger_value)) return false
              if (!isExactMediaMatch(a)) return false
              const triggers = a.trigger_value?.split(",").map((t: string) => t.trim()) || []
              return triggers.some((t: string) => t.toLowerCase() === reactionEmoji.toLowerCase())
            })

            // Then check any-media reaction rule
            if (!match) {
              match = storyAutomations.find((a: any) => {
                if (a.trigger_type !== "reaction" && a.trigger_type !== "reply") return false
                if (isWildcardTrigger(a.trigger_value)) return false
                if (!matchesMedia(a)) return false
                const triggers = a.trigger_value?.split(",").map((t: string) => t.trim()) || []
                return triggers.some((t: string) => t.toLowerCase() === reactionEmoji.toLowerCase())
              })
            }
          }

          // 4. Wildcard Fallback (ONLY reached if NO specific keyword or reaction matched above)
          if (!match && (isStoryReply || isReaction)) {
            // Media-specific wildcard first
            match = storyAutomations.find(
              (a: any) =>
                (a.trigger_type === "reply" || a.trigger_type === "reaction" || !a.trigger_type) &&
                isExactMediaMatch(a) &&
                isWildcardTrigger(a.trigger_value),
            )
            // Global wildcard fallback
            if (!match) {
              match = storyAutomations.find(
                (a: any) =>
                  (a.trigger_type === "reply" || a.trigger_type === "reaction" || !a.trigger_type) &&
                  isWildcardTrigger(a.trigger_value),
              )
            }
          }

          if (match) {
            console.log(`[webhook] ✨ Story match: "${match.name}" (rule ID: ${match.id}) for sender @${senderId}`)
            if (event.message?.mid) handledMessageIds.add(event.message.mid)
            if (event.reaction?.mid) handledMessageIds.add(event.reaction.mid)

            const content = parseContent(match.response_content)

            // Inbox bookkeeping: record incoming interaction
            let conv: any = null
            try {
              const { data: existing } = await supabase
                .from("conversations")
                .select("id")
                .eq("user_id", user.id)
                .eq("recipient_id", senderId)
                .maybeSingle()

              if (!existing) {
                let realUsername = `cnt_${senderId.slice(0, 5)}...`
                const profile = await fetchProfile(user.access_token, senderId)
                if (profile?.username) realUsername = profile.username

                const { data: newConv } = await supabase
                  .from("conversations")
                  .insert({
                    user_id: user.id,
                    recipient_id: senderId,
                    recipient_username: realUsername,
                    last_message_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single()
                conv = newConv
              } else {
                conv = existing
                await supabase
                  .from("conversations")
                  .update({ last_message_at: new Date().toISOString() })
                  .eq("id", existing.id)
              }

              if (conv) {
                await supabase.from("messages").insert({
                  id: event.message?.mid || event.reaction?.mid || `mid_story_${Date.now()}_${Math.random()}`,
                  conversation_id: conv.id,
                  user_id: user.id,
                  sender_id: senderId,
                  sender_username: "User",
                  content: isStoryMention
                    ? "[Story Mention]"
                    : isReaction
                      ? `[Story Reaction: ${reactionEmoji}]`
                      : `[Story Reply]: ${messageText}`,
                  is_from_instagram: true,
                })
              }
            } catch (err) {
              console.error("[webhook] Failed to save incoming story interaction", err)
            }

            // Check if user opted out of automated outreach
            if (await isRecipientOptedOut(user.id, senderId)) {
              console.log(`[webhook] 🛑 Story sender @${senderId} has opted out of automated messages. Skipping story response.`)
              continue
            }

            if (content.check_follow === true) {
              const followResult = await safeVerifyFollowStatus(senderId)

              if (followResult.follows === true) {
                console.log(`[webhook] ✅ Story follower gate: @${senderId} follows @${getInstagramUsername(user)} — delivering content`)
                const sendRes = await safeSendAutomationResponse({ id: senderId }, content)
                if (sendRes?.ok && conv) {
                  try {
                    await supabase.from("messages").insert({
                      id: `mid_reply_${Date.now()}_${Math.random()}`,
                      conversation_id: conv.id,
                      user_id: user.id,
                      sender_id: user.business_account_id || String(user.id),
                      sender_username: getInstagramUsername(user),
                      content: responsePreviewText(content),
                      is_from_instagram: false,
                    })
                  } catch {}
                }
              } else {
                console.log(`[webhook] 🔒 Story follower gate: @${senderId} not verified follower — sending Follow Gate card`)
                const gate = content.follow_gate || {}
                const sendRes = await safeSendCardDM(
                  { id: senderId },
                  buildFollowGateCard({
                    username: getInstagramUsername(user),
                    ruleId: match.id,
                    title: gate.title,
                    subtitle: gate.subtitle,
                    imageUrl: gate.image_url,
                    buttonFollowText: gate.button_follow,
                    buttonUnlockText: gate.button_unlock,
                    profileUrl: gate.profile_url,
                  }),
                )
                if (sendRes?.ok && conv) {
                  try {
                    await supabase.from("messages").insert({
                      id: `mid_reply_${Date.now()}_${Math.random()}`,
                      conversation_id: conv.id,
                      user_id: user.id,
                      sender_id: user.business_account_id || String(user.id),
                      sender_username: getInstagramUsername(user),
                      content: "[Follow Gate Card]",
                      is_from_instagram: false,
                    })
                  } catch {}
                }
              }
            } else {
              // No follower check required — send directly
              const sendRes = await safeSendAutomationResponse({ id: senderId }, content)
              if (sendRes?.ok && conv) {
                try {
                  await supabase.from("messages").insert({
                    id: `mid_reply_${Date.now()}_${Math.random()}`,
                    conversation_id: conv.id,
                    user_id: user.id,
                    sender_id: user.business_account_id || String(user.id),
                    sender_username: getInstagramUsername(user),
                    content: responsePreviewText(content),
                    is_from_instagram: false,
                  })
                } catch {}
              }
            }
          }
        }
      }

      // ============================================================
      //  PART B: DIRECT MESSAGES
      // ============================================================
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.read || event.delivery || event.reaction || event.message?.is_echo) continue
          if (event.message?.mid && handledMessageIds.has(event.message.mid)) continue

          const senderId = event.sender.id
          if (senderId === webhookId || senderId === user.business_account_id || senderId === user.page_id) continue

          let triggerType = ""
          let triggerValue = ""

          if (event.message?.quick_reply?.payload) {
            triggerType = "postback"
            triggerValue = event.message.quick_reply.payload
          } else if (event.message?.text) {
            triggerType = "keyword"
            triggerValue = event.message.text.toLowerCase().trim()
          } else if (event.postback?.payload) {
            triggerType = "postback"
            triggerValue = event.postback.payload
          } else {
            continue
          }

          console.log(`[webhook] 📩 DM from ${senderId}: "${triggerValue}"`)

          // Inbox bookkeeping runs alongside delivery, not ahead of it. Always
          // joined below so serverless shutdown cannot discard pending writes.
          const incomingSaved = (async () => {
          let conv = null
          try {
            const { data: existing } = await supabase
              .from("conversations")
              .select("id")
              .eq("user_id", user.id)
              .eq("recipient_id", senderId)
              .single()

            if (!existing) {
              let realUsername = `cnt_${senderId.slice(0, 5)}...`
              const profile = await fetchProfile(user.access_token, senderId)
              if (profile?.username) realUsername = profile.username

              const { data: newConv } = await supabase
                .from("conversations")
                .insert({
                  user_id: user.id,
                  recipient_id: senderId,
                  recipient_username: realUsername,
                  last_message_at: new Date().toISOString(),
                })
                .select("id")
                .single()
              conv = newConv
            } else {
              conv = existing
              await supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", existing.id)
            }

            if (conv) {
              await supabase.from("messages").insert({
                id: event.message?.mid || `mid_${Date.now()}_${Math.random()}`,
                conversation_id: conv.id,
                user_id: user.id,
                sender_id: senderId,
                sender_username: "User",
                content: triggerValue,
                is_from_instagram: true,
              })
            }
          } catch (err) {
            console.error("[webhook] Failed to save incoming message", err)
          }
          return conv
          })()

          try {
            // ---------- Opt-Out & Unsubscribe Interception (Meta Platform Policy Mandate) ----------
            const optAction = triggerType === "keyword" ? detectOptAction(triggerValue) : null
            if (optAction === "opt_out") {
              await optOutRecipient(user.id, senderId)
              const result = await safeSendTextDM({ id: senderId }, OPT_OUT_CONFIRMATION_TEXT)
              const conv = await incomingSaved
              if (result?.ok && conv) {
                try {
                  await supabase.from("messages").insert({
                    id: `mid_optout_${Date.now()}_${Math.random()}`,
                    conversation_id: conv.id,
                    user_id: user.id,
                    sender_id: user.business_account_id || String(user.id),
                    sender_username: getInstagramUsername(user),
                    content: OPT_OUT_CONFIRMATION_TEXT,
                    is_from_instagram: false,
                  })
                } catch (e) {
                  console.error("[webhook] Failed to save opt-out message", e)
                }
              }
              continue
            }

            if (optAction === "opt_in") {
              await optInRecipient(user.id, senderId)
              const result = await safeSendTextDM({ id: senderId }, OPT_IN_CONFIRMATION_TEXT)
              const conv = await incomingSaved
              if (result?.ok && conv) {
                try {
                  await supabase.from("messages").insert({
                    id: `mid_optin_${Date.now()}_${Math.random()}`,
                    conversation_id: conv.id,
                    user_id: user.id,
                    sender_id: user.business_account_id || String(user.id),
                    sender_username: getInstagramUsername(user),
                    content: OPT_IN_CONFIRMATION_TEXT,
                    is_from_instagram: false,
                  })
                } catch (e) {
                  console.error("[webhook] Failed to save opt-in message", e)
                }
              }
              continue
            }

            // Suppress all automated responses (rules & AI auto-reply) if user is opted out
            if (await isRecipientOptedOut(user.id, senderId)) {
              console.log(`[webhook] 🛑 Sender @${senderId} has opted out of automated messages. Suppressing automation/AI replies.`)
              await incomingSaved
              continue
            }

            // ---------- Match automation ----------
                    const safeAutomations = automations || []
                    const dmAutomations = safeAutomations.filter((a: any) => a.trigger_source === "dm" || !a.trigger_source)
                    let match = null

                    const normTrigger = triggerValue.toLowerCase().trim()
                    const isUnlockEvent =
                      (triggerType === "postback" && triggerValue.startsWith("UNLOCK_CONTENT_")) ||
                      (triggerType === "keyword" &&
                        (normTrigger === "i'm following" ||
                          normTrigger === "im following" ||
                          normTrigger === "i'm following ✅" ||
                          normTrigger === "im following ✅" ||
                          normTrigger === "i followed" ||
                          normTrigger === "i followed!"))

                    const isSendLinkEvent =
                      (triggerType === "postback" && triggerValue.startsWith("SEND_LINK_")) ||
                      (triggerType === "keyword" &&
                        (normTrigger === "send me the link" ||
                          normTrigger === "send me link" ||
                          normTrigger === "send link"))

                    if (triggerType === "postback") {
                      if (isUnlockEvent) {
                        const ruleId = triggerValue.replace("UNLOCK_CONTENT_", "")
                        match = safeAutomations.find((a) => a.id === ruleId)
                      } else if (isSendLinkEvent) {
                        const ruleId = triggerValue.replace("SEND_LINK_", "")
                        match = safeAutomations.find((a) => a.id === ruleId)
                      } else if (triggerValue.startsWith("ICE_BREAKER_")) {
                        const iceBreakerId = triggerValue.replace("ICE_BREAKER_", "")
                        const { data: ib } = await supabase
                          .from("ice_breakers")
                          .select("*")
                          .eq("id", iceBreakerId)
                          .maybeSingle()
                        if (ib) {
                          match = {
                            id: ib.id,
                            name: "Ice Breaker: " + ib.question,
                            response_content: { message: ib.response },
                          }
                        }
                      } else {
                        match = safeAutomations.find((a) => a.trigger_type === "postback" && a.trigger_value === triggerValue)
                        // Quick reply payloads can also match keyword rules
                        if (!match) {
                          match = dmAutomations.find(
                            (a) => a.trigger_type === "keyword" && keywordMatches(a.trigger_value, triggerValue.toLowerCase()),
                          )
                        }
                      }
                    } else if (isSendLinkEvent || isUnlockEvent) {
                      // Text message matching "Send me the link" or "I'm following"
                      match =
                        safeAutomations.find((a) => {
                          const parsed = parseContent(a.response_content)
                          return a.trigger_source === "comment" && (parsed?.check_follow === true || Boolean(parsed?.initial_title))
                        }) || safeAutomations[0]
                    } else {
                      match = dmAutomations.find(
                        (a) => a.trigger_type === "keyword" && keywordMatches(a.trigger_value, triggerValue),
                      )
                      // Fallback: also match story rules or global keyword rules
                      if (!match) {
                        match = safeAutomations.find(
                          (a) =>
                            (a.trigger_type === "keyword" || a.trigger_type === "reply") &&
                            keywordMatches(a.trigger_value, triggerValue),
                        )
                      }
                    }

                    // Check active ice breakers if no keyword or postback matched yet
                    if (!match) {
                      const candidateUserIds = matchedUsers?.length ? matchedUsers.map((u: any) => u.id) : [user.id]
                      const { data: activeIbs } = await supabase
                        .from("ice_breakers")
                        .select("*")
                        .in("user_id", candidateUserIds)
                        .eq("is_active", true)

                      if (activeIbs?.length) {
                        const ibMatch = activeIbs.find((ib: any) => {
                          const q = (ib.question || "").toLowerCase().trim()
                          const t = triggerValue.toLowerCase().trim()
                          return (
                            q === t ||
                            keywordMatches(q, t) ||
                            keywordMatches(t, q) ||
                            t.includes(q) ||
                            q.includes(t)
                          )
                        })
                        if (ibMatch) {
                          console.log(`[webhook] 🧊 Matched Ice Breaker question: "${ibMatch.question}"`)
                          match = {
                            id: ibMatch.id,
                            name: "Ice Breaker: " + ibMatch.question,
                            response_content: { message: ibMatch.response },
                          }
                        }
                      }
                    }

                    if (!match) {
                      // AI fallback: if no keyword rule matched, try AI auto-reply
                      if (user.groq_auto_reply_enabled && triggerType !== "postback") {
                        console.log(`[webhook] 🤖 No rule match — trying AI auto-reply for DM from ${senderId}`)
                        await sendSenderAction(user.access_token, senderId, "mark_seen")
                        const conv = await incomingSaved // AI needs history; keyword replies do not.
                        const { data: recentMessages } = conv
                          ? await supabase
                              .from("messages")
                              .select("content, is_from_instagram")
                              .eq("conversation_id", conv.id)
                              .order("created_at", { ascending: false })
                              .limit(10)
                          : { data: [] }
                        const history = (recentMessages || []).reverse().map((message: any) => ({
                          role: message.is_from_instagram ? "user" as const : "assistant" as const,
                          content: message.content,
                        }))
                        const aiReply = await generateAIReply(triggerValue, user.ai_context || "", history, user.groq_api_key, user.ai_base_url, user.ai_model)
                        if (aiReply) {
                          await sendSenderAction(user.access_token, senderId, "typing_on")
                          const result = await sendTextDM(user.access_token, { id: senderId }, aiReply)
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_ai_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: user.username,
                                content: aiReply,
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save AI reply", e)
                            }
                          }
                        }
                      }
                      continue
                    }

                    if (!match) continue

                    // Enforce 14-day progressive warm-up quota (Section 6.4 & 9 of Meta Rules)
                    const warmupCheck = await checkAndIncrementWarmupQuota(user.id, user.created_at)
                    if (!warmupCheck.allowed) {
                      console.log(`[webhook] 🛑 Account warm-up limit reached for user ${user.id} (${warmupCheck.reason}). Skipping automated DM.`)
                      continue
                    }

                    console.log(`[webhook] ✅ DM match: "${match.name}"`)
                    const content = parseContent(match.response_content)

                    // Mark message as seen for human-like flow
                    if (content.mark_seen !== false) {
                      await sendSenderAction(user.access_token, senderId, "mark_seen")
                    }

                    // ---------- Follow gate & 2-step opt-in for DMs ----------
                    const attemptKey = unlockKey(senderId, match.id)
                    const gate = content.follow_gate || {}

                    if (isSendLinkEvent) {
                      if (content.check_follow === true) {
                        // User clicked "Send me the link" (Step 2 in workflow) with Follow Gate enabled
                        const followResult = await safeVerifyFollowStatus(senderId)

                        if (followResult.follows === true) {
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] ✅ "Send me the link" verified: @${senderId} is already following! Delivering resource.`)
                          const result = await safeSendAutomationResponse({ id: senderId }, content)
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: responsePreviewText(content),
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        } else {
                          // User is NOT following -> Send the "Oh no! It seems you're not following me" Follow Gate Card
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] 🔒 "Send me the link" by @${senderId} who does NOT follow yet. Sending Follow Gate Card.`)
                          const result = await safeSendCardDM(
                            { id: senderId },
                            buildFollowGateCard({
                              username: getInstagramUsername(user),
                              ruleId: match.id,
                              title: gate.title,
                              subtitle: gate.subtitle,
                              imageUrl: gate.image_url,
                              buttonFollowText: gate.button_follow,
                              buttonUnlockText: gate.button_unlock,
                              profileUrl: gate.profile_url,
                            }),
                          )
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: "[Follow Gate: Not Following Yet]",
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        }
                      } else {
                        // User clicked "Send me the link" with Follow Gate disabled -> deliver resource directly!
                        await clearUnlockAttempts(attemptKey)
                        console.log(`[webhook] ✅ "Send me the link" tapped by @${senderId} (Follow Gate disabled) — delivering resource directly`)
                        const result = await safeSendAutomationResponse({ id: senderId }, content)
                        const conv = await incomingSaved
                        if (result?.ok && conv) {
                          try {
                            await supabase.from("messages").insert({
                              id: `mid_reply_${Date.now()}_${Math.random()}`,
                              conversation_id: conv.id,
                              user_id: user.id,
                              sender_id: user.business_account_id || String(user.id),
                              sender_username: getInstagramUsername(user),
                              content: responsePreviewText(content),
                              is_from_instagram: false,
                            })
                          } catch (e) {
                            console.error("[webhook] Failed to save outgoing message", e)
                          }
                        }
                      }
                    } else if (content.check_follow === true) {
                      if (isUnlockEvent) {
                        // Explicit unlock path: user tapped "I'm following ✅" (Step 3 in workflow)
                        const followResult = await safeVerifyFollowStatus(senderId)

                        if (followResult.follows === true) {
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] ✅ DM unlock verified for @${senderId} — now following!`)
                          const result = await safeSendAutomationResponse({ id: senderId }, content)
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: responsePreviewText(content),
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        } else if (followResult.follows === false) {
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] ❌ DM unlock rejected: @${senderId} still doesn't follow`)
                          const result = await safeSendCardDM(
                            { id: senderId },
                            buildStillNotFollowingCard({
                              username: getInstagramUsername(user),
                              ruleId: match.id,
                              profileUrl: gate.profile_url,
                            }),
                          )
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: "[Still Not Following Prompt]",
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        } else {
                          // null → unverifiable. Cap the loop.
                          const attempts = await bumpUnlockAttempt(attemptKey)
                          if (attempts > UNLOCK_GATE_MAX_ATTEMPTS) {
                            await clearUnlockAttempts(attemptKey)
                            console.warn(`[webhook] ⚠️ DM unlock gate capped after ${attempts} unverifiable attempts for @${senderId} / rule ${match.id}`)
                            const result = await safeSendTextDM(
                              { id: senderId },
                              "⚠️ We couldn't verify your follow yet. Please reach out if this keeps happening.",
                            )
                            const conv = await incomingSaved
                            if (result?.ok && conv) {
                              try {
                                await supabase.from("messages").insert({
                                  id: `mid_reply_${Date.now()}_${Math.random()}`,
                                  conversation_id: conv.id,
                                  user_id: user.id,
                                  sender_id: user.business_account_id || String(user.id),
                                  sender_username: getInstagramUsername(user),
                                  content: "[Verification Unavailable — capped]",
                                  is_from_instagram: false,
                                })
                              } catch (e) {
                                console.error("[webhook] Failed to save outgoing message", e)
                              }
                            }
                          } else {
                            console.warn(`[webhook] ⚠️ DM unlock unverifiable (attempt ${attempts}/${UNLOCK_GATE_MAX_ATTEMPTS}) for @${senderId}`)
                            const result = await safeSendCardDM(
                              { id: senderId },
                              buildFollowGateCard({
                                username: getInstagramUsername(user),
                                ruleId: match.id,
                                title: gate.title,
                                subtitle: gate.subtitle,
                                imageUrl: gate.image_url,
                                buttonFollowText: gate.button_follow,
                                buttonUnlockText: gate.button_unlock,
                                profileUrl: gate.profile_url,
                              }),
                            )
                            const conv = await incomingSaved
                            if (result?.ok && conv) {
                              try {
                                await supabase.from("messages").insert({
                                  id: `mid_reply_${Date.now()}_${Math.random()}`,
                                  conversation_id: conv.id,
                                  user_id: user.id,
                                  sender_id: user.business_account_id || String(user.id),
                                  sender_username: getInstagramUsername(user),
                                  content: `[Locked Content Gate — attempt ${attempts}/${UNLOCK_GATE_MAX_ATTEMPTS}]`,
                                  is_from_instagram: false,
                                })
                              } catch (e) {
                                console.error("[webhook] Failed to save outgoing message", e)
                              }
                            }
                          }
                        }
                      } else {
                        // Initial direct DM keyword (not via comment flow) — verify once
                        const followResult = await safeVerifyFollowStatus(senderId)

                        if (followResult.follows === true) {
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] ✅ DM follower gate: @${senderId} follows @${getInstagramUsername(user)} — sending content`)
                          const result = await safeSendAutomationResponse({ id: senderId }, content)
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: responsePreviewText(content),
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        } else {
                          // Not following -> send Follow Gate Card
                          await clearUnlockAttempts(attemptKey)
                          console.log(`[webhook] 🔒 DM follower gate: @${senderId} doesn't follow @${getInstagramUsername(user)}`)
                          const result = await safeSendCardDM(
                            { id: senderId },
                            buildFollowGateCard({
                              username: getInstagramUsername(user),
                              ruleId: match.id,
                              title: gate.title,
                              subtitle: gate.subtitle,
                              imageUrl: gate.image_url,
                              buttonFollowText: gate.button_follow,
                              buttonUnlockText: gate.button_unlock,
                              profileUrl: gate.profile_url,
                            }),
                          )
                          const conv = await incomingSaved
                          if (result?.ok && conv) {
                            try {
                              await supabase.from("messages").insert({
                                id: `mid_reply_${Date.now()}_${Math.random()}`,
                                conversation_id: conv.id,
                                user_id: user.id,
                                sender_id: user.business_account_id || String(user.id),
                                sender_username: getInstagramUsername(user),
                                content: "[Locked Content Gate]",
                                is_from_instagram: false,
                              })
                            } catch (e) {
                              console.error("[webhook] Failed to save outgoing message", e)
                            }
                          }
                        }
                      }
                    } else {
                      // No follower check required
                      const result = await safeSendAutomationResponse({ id: senderId }, content)
                      const conv = await incomingSaved
                      if (result?.ok && conv) {
                        try {
                          await supabase.from("messages").insert({
                            id: `mid_reply_${Date.now()}_${Math.random()}`,
                            conversation_id: conv.id,
                            user_id: user.id,
                            sender_id: user.business_account_id || String(user.id),
                            sender_username: getInstagramUsername(user),
                            content: responsePreviewText(content),
                            is_from_instagram: false,
                          })
                        } catch (e) {
                          console.error("[webhook] Failed to save outgoing message", e)
                        }
                      }
                    }
          } finally {
            await incomingSaved
          }
        }
      }
    }
  }

/**
 * Meta Webhook Ingestion Handler
 *
 * Enforces Section 8.1 Sub-3-Second Acknowledgment Rule:
 * Immediately validates signature, parses payload, delegates background tasks
 * via Next.js after(), and returns HTTP 200 OK in < 50ms.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get("x-hub-signature-256")
    if (!isValidSignature(rawBody, signature)) {
      const computed = APP_SECRETS.map(
        (s, i) =>
          `${i === 0 ? "IG" : "META"}:${crypto.createHmac("sha256", s).update(rawBody, "utf8").digest("hex").slice(0, 12)}`,
      ).join(" ")
      console.error(
        `[webhook] 401: ${!signature ? "no x-hub-signature-256 header" : "signature mismatch"}; ` +
          `secrets configured: ${APP_SECRETS.length}; received=${signature?.slice(7, 19) ?? "-"} computed=[${computed}] bodyLen=${rawBody.length}`,
      )
      if (process.env.NODE_ENV !== "production" && process.env.DISABLE_WEBHOOK_SIGNATURE_CHECK === "true") {
        console.warn("[webhook] SIGNATURE CHECK BYPASSED — dev only")
      } else {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const body = JSON.parse(rawBody)
    if (!body.entry || !Array.isArray(body.entry)) {
      return NextResponse.json({ ok: true })
    }

    // Sub-3-Second Acknowledgment (Meta Section 8.1 Compliance):
    // Ingest the payload and return HTTP 200 OK immediately (< 50ms) to Meta servers.
    // Heavy execution (Graph API calls, AI queries, DB writes) runs in background via after().
    if (typeof after === "function") {
      after(async () => {
        try {
          await processWebhookEntries(body.entry)
        } catch (err) {
          console.error("[webhook] Asynchronous processing error:", err)
        }
      })
    } else {
      processWebhookEntries(body.entry).catch((err) =>
        console.error("[webhook] Background processing error:", err),
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[webhook] Error", error)
    return NextResponse.json({ ok: true })
  }
}
