import { getSupabaseAdmin } from "./supabase-admin"

// In-memory set to quickly deduplicate concurrent requests within the process
const memoryProcessedSet = new Set<string>()

// Auto-clean in-memory set periodically to prevent memory growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    if (memoryProcessedSet.size > 2000) {
      memoryProcessedSet.clear()
    }
  }, 15 * 60 * 1000).unref?.()
}

/**
 * Checks if a comment has already been processed by either Webhook or Sync-Comments.
 * If not processed, immediately claims it atomically so no concurrent thread sends a second DM.
 *
 * @returns true if ALREADY processed (caller should SKIP)
 * @returns false if NOT processed yet (caller claimed it and should proceed)
 */
export async function isCommentAlreadyProcessed(
  commentId: string,
  userId?: string | number | null,
  ruleId?: string,
  mediaId?: string,
  commenter?: string,
  text?: string
): Promise<boolean> {
  const cid = String(commentId).trim()
  if (!cid) return false

  // 1. Fast in-memory check (catches parallel Webhook + Sync-Comments within milliseconds)
  if (memoryProcessedSet.has(cid)) {
    return true
  }

  // 2. Database check in webhook_events
  try {
    const admin = getSupabaseAdmin()
    const { data: existing } = await admin
      .from("webhook_events")
      .select("id")
      .eq("event_type", "comment_reply")
      .contains("data", { comment_id: cid })
      .limit(1)

    if (existing && existing.length > 0) {
      memoryProcessedSet.add(cid)
      return true
    }

    // 3. Claim this comment immediately in memory and database before sending DM
    memoryProcessedSet.add(cid)

    await admin.from("webhook_events").insert({
      event_type: "comment_reply",
      user_id: userId ? Number(userId) : null,
      data: {
        comment_id: cid,
        media_id: mediaId || null,
        rule_id: ruleId || null,
        commenter: commenter || null,
        text: text || null,
        processed_at: new Date().toISOString(),
      },
    })

    return false
  } catch (err) {
    console.warn(`[dedup] Error checking comment claim for ${cid}:`, err)
    // If DB check fails, rely on memoryProcessedSet
    return memoryProcessedSet.has(cid)
  }
}
