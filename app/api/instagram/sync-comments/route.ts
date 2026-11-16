import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"
import { resolveCandidateUserIds } from "@/lib/user-candidates"
import { isCommentAlreadyProcessed } from "@/lib/dedup"
import { isRecipientOptedOut } from "@/lib/opt-out"
import {
  isCommentWithin7Days,
  isNonRetryableMetaError,
  isMetaThrottled,
  recordMetaApiResponse,
  sanitizePublicCommentReply,
} from "@/lib/instagram-api"
import { getSpintaxPublicReply, expandTemplate } from "@/lib/spintax"
import { checkAndIncrementWarmupQuota } from "@/lib/warmup"
import { applyHumanizedJitter } from "@/lib/jitter"
import { getAutomationMediaIds } from "@/lib/automation-media"

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

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const userId = session.userId

    const body = await request.json().catch(() => ({}))
    const searchParams = request.nextUrl.searchParams
    const requestedUserId = body.userId || searchParams.get("userId")

    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 1. Get user with access token strictly for session.userId
    let { data: user } = await admin
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    let token = user?.access_token || ""
    let backupToken: string | null = null
    try {
      if (user?.ai_context) {
        const parsed = JSON.parse(user.ai_context)
        const candidates = [
          parsed._instagram?.accessToken,
          parsed._instagram?.pageAccessToken,
          parsed._instagram?.userAccessToken,
        ].filter(Boolean)
        if ((!token || token.length < 20 || token.startsWith("ya29.") || token === "GOOGLE_AUTH") && candidates[0]) {
          token = candidates[0]
        }
        for (const c of candidates) {
          if (c && c !== token && c.length > 20) {
            backupToken = c
            break
          }
        }
      }
    } catch {}

    if (!user || !token || token.startsWith("ya29.") || token === "GOOGLE_AUTH" || token.length < 20) {
      return NextResponse.json({ success: true, message: "No active Instagram credentials configured", processed: 0 })
    }

    let resolvedIgUsername: string | null = null
    try {
      if (user?.ai_context) {
        const p = JSON.parse(user.ai_context)
        resolvedIgUsername = p._instagram?.username || null
      }
    } catch {}

    const baseGraph = token.startsWith("EAA")
      ? "https://graph.facebook.com/v24.0"
      : "https://graph.instagram.com/v24.0"

    // Check Meta BUC Rate Limit Circuit Breaker (Section 5.B: pause when quota >= 80%)
    const throttleCheck = isMetaThrottled(user.business_account_id)
    if (throttleCheck.throttled) {
      console.warn(`[sync-comments] 🛑 Polling paused: Meta API circuit breaker active (${throttleCheck.waitSeconds}s remaining).`)
      return NextResponse.json({
        success: true,
        message: `Paused: Meta rate limit circuit breaker active (${throttleCheck.waitSeconds}s remaining). Waiting for quota window to reset.`,
        processed: 0,
      })
    }

    // 2. Get active comment automations for this user ONLY
    const { data: automations } = await admin
      .from("automations")
      .select("*")
      .eq("user_id", userId)
      .eq("trigger_source", "comment")
      .eq("is_active", true)

    if (!automations?.length) {
      return NextResponse.json({ success: true, message: "No active comment automations found", processed: 0 })
    }

    // Check if account is halted due to Meta Error 368 or rate limit circuit breaker
    const throttleStatus = isMetaThrottled(user.business_account_id)
    if (throttleStatus.throttled) {
      return NextResponse.json(
        {
          error: `Account automations halted (${throttleStatus.waitSeconds}s remaining): ${throttleStatus.reason}`,
        },
        { status: 429, headers: { "Retry-After": String(throttleStatus.waitSeconds) } },
      )
    }

    // 3. Get list of already processed comment IDs for this user
    const { data: processedRecords } = await admin
      .from("webhook_events")
      .select("data")
      .eq("event_type", "comment_reply")
      .eq("user_id", userId)

    const processedCommentIds = new Set<string>()
    if (processedRecords) {
      for (const rec of processedRecords) {
        if (rec.data?.comment_id) processedCommentIds.add(String(rec.data.comment_id))
      }
    }

    const results: Array<{ commentId: string; commenter: string; text: string; dmSent: boolean; commentReplied: boolean }> = []

    for (const auto of automations) {
      const mediaIds: string[] = []
      const targetMediaIds = getAutomationMediaIds(auto)
      if (targetMediaIds.length > 0) {
        mediaIds.push(...targetMediaIds)
      } else {
        // Global rule: fetch recent media IDs
        try {
          // If token starts with EAA, ensure business_account_id is a valid Instagram account (starts with 1784)
          const isMeta = token.startsWith("EAA")
          const targetId = user.business_account_id ? String(user.business_account_id) : null
          if (!isMeta || (targetId && targetId.startsWith("1784"))) {
            const mediaUrl = `${baseGraph}/${targetId || "me"}/media?fields=id&limit=10&access_token=${token}`
            const mRes = await fetch(mediaUrl)
            recordMetaApiResponse(mRes.headers, mRes.status, user.business_account_id)
            const mData = await mRes.json()
            if (mData.data && Array.isArray(mData.data)) {
              mData.data.forEach((m: any) => mediaIds.push(m.id))
            }
          }
        } catch (e) {
          console.warn("[sync-comments] Failed to fetch media list:", e)
        }
      }

      const uniqueMediaIds = Array.from(new Set(mediaIds))
      for (const mediaId of uniqueMediaIds) {
        try {
          const commentsUrl = `${baseGraph}/${mediaId}/comments?fields=id,text,from,timestamp,replies{id,username,from}&access_token=${token}&limit=30`
          const cRes = await fetch(commentsUrl)
          recordMetaApiResponse(cRes.headers, cRes.status, user.business_account_id)
          const cData = await cRes.json()

          if (!cData.data || !Array.isArray(cData.data)) continue

          for (const comment of cData.data) {
            const commentId = String(comment.id)
            if (processedCommentIds.has(commentId)) continue

            // Skip hidden comments (Section 4 of Meta Rules)
            if (comment.is_hidden === true || comment.hidden === true) continue

            // Don't reply to our own comments
            const isOurComment =
              Boolean(user.business_account_id && comment.from?.id === String(user.business_account_id)) ||
              Boolean(resolvedIgUsername && (comment.from?.username === resolvedIgUsername || comment.username === resolvedIgUsername))
            if (isOurComment) continue

            // Check if comment already has a reply from this account
            const existingReplies = comment.replies?.data || []
            const alreadyRepliedByUs = existingReplies.some(
              (r: any) =>
                (resolvedIgUsername && (r.username === resolvedIgUsername || r.from?.username === resolvedIgUsername)) ||
                (user.business_account_id && r.from?.id === String(user.business_account_id))
            )
            if (alreadyRepliedByUs) {
              processedCommentIds.add(commentId)
              continue
            }

            const commentText = comment.text || ""
            const triggerValUpper = (auto.trigger_value || "").toUpperCase().trim()
            const matches =
              auto.trigger_type === "reply_all" ||
              triggerValUpper === "ALL" ||
              triggerValUpper === "ALL_COMMENTS" ||
              keywordMatches(auto.trigger_value, commentText)

            if (!matches) continue

            const commenterUsername = comment.from?.username || comment.username || ""

            // Deduplication: Claim this comment atomically across Webhook and Sync-Comments
            if (await isCommentAlreadyProcessed(commentId, userId, auto.id, mediaId, commenterUsername, commentText)) {
              processedCommentIds.add(commentId)
              continue
            }
            processedCommentIds.add(commentId)

            // Enforce 14-day progressive warm-up quota (Section 6.4 & 9 of Meta Rules)
            const warmupCheck = await checkAndIncrementWarmupQuota(userId, user.created_at)
            if (!warmupCheck.allowed) {
              console.log(`[sync-comments] 🛑 Account warm-up limit reached for user ${userId} (${warmupCheck.reason}). Skipping automated action to preserve account standing.`)
              continue
            }

            const content = typeof auto.response_content === "string"
              ? JSON.parse(auto.response_content)
              : auto.response_content || {}

            const replyMode = content.reply_mode || "both"
            const rawDmText = content.message || auto.name
            // Spintax & personalization expansion for private reply
            const dmText = expandTemplate(rawDmText, { username: commenterUsername })

            // Spintax & rotation engine for public comment reply (Meta anti-spam)
            const userReplies = Array.isArray(content.public_replies) && content.public_replies.length > 0
              ? content.public_replies
              : (content.public_reply ? [content.public_reply] : [])
            const publicReplyText = getSpintaxPublicReply(commenterUsername, userReplies)

            let commentReplied = false
            let dmSent = false
            let dmError: string | null = null

            const commenterId = comment.from?.id ? String(comment.from.id) : null
            const isOptedOut = commenterId ? await isRecipientOptedOut(userId, commenterId) : false
            if (isOptedOut) {
              console.log(`[sync-comments] 🛑 Commenter @${commenterUsername} (${commenterId}) is opted out. Suppressing private DM.`)
            }

            // Verify comment is within Meta's mandatory 7-day private reply window
            const isFresh = isCommentWithin7Days(comment.timestamp)
            if (!isFresh) {
              dmError = "Ineligible: Comment published over 7 days ago (Meta Private Reply limit)"
              console.log(`[sync-comments] ⏭️ Comment ${commentId} published over 7 days ago (${comment.timestamp}). Ineligible for private reply.`)
            }

            // Step 1: Try sending DM if mode allows private replies (both or dm_only)
            if (replyMode !== "public_only" && !isOptedOut && isFresh) {
              // Enforce Meta humanized pacing jitter (Section 6.2: 3s to 15s randomized delay)
              await applyHumanizedJitter("dm", Number(content.delay_seconds) || 0)

              const igUsername = resolvedIgUsername || user.username || "creator"

              // 2-Step Opt-in: Always send the initial "Send me the link" card as private reply to comment
              const gate = content.follow_gate || {}
              const initialCardTitle = (gate.initial_title || content.initial_title || "Hey there! I'm so happy you're here, thanks so much for your interest 😊").slice(0, 80)
              const initialCardSubtitle = (gate.initial_subtitle || content.initial_subtitle || "Click below and I'll send you the link in just a sec ✨").slice(0, 80)
              const initialBtnText = (gate.initial_button_text || content.initial_button_text || "Send me the link").slice(0, 20)
              const initialCardImg = (content.initial_image_url?.trim() || gate.initial_image_url?.trim()) || undefined

              const gateElement: any = {
                title: initialCardTitle,
                subtitle: initialCardSubtitle,
                buttons: [
                  { type: "postback", title: initialBtnText, payload: `SEND_LINK_${auto.id}` },
                ],
              }
              if (initialCardImg && initialCardImg.startsWith("http")) {
                gateElement.image_url = initialCardImg
              }

              const dmPayload = {
                recipient: { comment_id: comment.id },
                message: {
                  attachment: {
                    type: "template",
                    payload: {
                      template_type: "generic",
                      elements: [gateElement],
                    },
                  },
                },
              }

              const endpoints = [
                `https://graph.facebook.com/v24.0/${user.page_id || "me"}/messages`,
                `https://graph.facebook.com/v24.0/me/messages`,
              ]
              const tokenCandidates = [token, backupToken].filter(Boolean) as string[]

              for (const tok of tokenCandidates) {
                if (dmSent) break
                for (const ep of endpoints) {
                  if (dmSent) break
                  try {
                    const dmRes = await fetch(`${ep}?access_token=${tok}`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(dmPayload),
                    })
                    const dmData = await dmRes.json().catch(() => ({}))
                    recordMetaApiResponse(dmRes.headers, dmRes.status, user.business_account_id, dmData?.error)
                    if (dmRes.ok && (dmData.message_id || dmData.id)) {
                      dmSent = true
                      dmError = null
                      console.log(`[sync-comments] ✅ DM successfully sent to commenter via ${ep}:`, dmData)
                    } else {
                      dmError = dmData?.error?.message || JSON.stringify(dmData)
                      // If the error is permanent (expired > 7 days, already replied, recipient unavailable), halt retries
                      if (isNonRetryableMetaError(dmData?.error)) {
                        console.warn(`[sync-comments] Non-retryable Meta error on comment ${commentId} (dropping retries):`, dmError)
                        break
                      }
                      // If card template failed with retryable error, fallback to plain text message
                      if (content.check_follow === true) {
                        const fallbackRes = await fetch(`${ep}?access_token=${tok}`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            recipient: { comment_id: comment.id },
                            message: { text: dmText },
                          }),
                        })
                        const fbData = await fallbackRes.json().catch(() => ({}))
                        recordMetaApiResponse(fallbackRes.headers, fallbackRes.status, user.business_account_id, fbData?.error)
                        if (fallbackRes.ok && (fbData.message_id || fbData.id)) {
                          dmSent = true
                          dmError = null
                          break
                        }
                        if (isNonRetryableMetaError(fbData?.error)) {
                          dmError = fbData?.error?.message || JSON.stringify(fbData)
                          console.warn(`[sync-comments] Non-retryable Meta error on fallback for comment ${commentId}:`, dmError)
                          break
                        }
                      }
                    }
                  } catch (dmErr: any) {
                    dmError = dmErr.message
                  }
                }
              }
            }

            // Step 2: Public comment reply
            // Post public reply from public_replies rotation with dual-token fallback
            if (replyMode !== "dm_only") {
              // Enforce Meta humanized pacing jitter (Section 6.2: 5s to 45s randomized delay)
              await applyHumanizedJitter("comment")

              const tokenCandidates = [token, backupToken].filter(Boolean) as string[]
              for (const tok of tokenCandidates) {
                if (commentReplied) break
                try {
                  const replyUrl = `${baseGraph}/${commentId}/replies?access_token=${tok}`
                  const sanitizedReply = sanitizePublicCommentReply(publicReplyText)
                  const rRes = await fetch(replyUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: sanitizedReply }),
                  })
                  const rData = await rRes.json().catch(() => ({}))
                  recordMetaApiResponse(rRes.headers, rRes.status, user.business_account_id, rData?.error)
                  if (rRes.ok && rData.id) {
                    commentReplied = true
                    console.log(`[sync-comments] ✅ Public comment reply posted: ${rData.id}`)
                  } else {
                    console.warn("[sync-comments] Comment reply notice:", rData)
                  }
                } catch (rErr: any) {
                  console.warn("[sync-comments] Failed to reply to comment:", rErr.message)
                }
              }
            }

            // Mark as processed in database
            await admin.from("webhook_events").insert({
              event_type: "comment_reply",
              user_id: user.id,
              data: {
                comment_id: commentId,
                media_id: mediaId,
                commenter: comment.from?.username || "unknown",
                text: commentText,
                dmSent,
                dmError,
                commentReplied,
                rule_id: auto.id,
                processed_at: new Date().toISOString(),
              },
            })

            processedCommentIds.add(commentId)
            results.push({
              commentId,
              commenter: comment.from?.username || "unknown",
              text: commentText,
              dmSent,
              commentReplied,
            })
          }
        } catch (e) {
          console.error(`[sync-comments] Error checking comments for media ${mediaId}:`, e)
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      replies: results,
      message: results.length > 0
        ? `Successfully processed and replied to ${results.length} new comments!`
        : "All comments are up-to-date. No new matching comments found.",
    })
  } catch (err: any) {
    console.error("[sync-comments] Unexpected error:", err)
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
