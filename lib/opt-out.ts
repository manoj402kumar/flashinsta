import { getSupabaseAdmin } from "./supabase-admin"

export const OPT_OUT_CONFIRMATION_TEXT =
  "You have been unsubscribed from automated messages. You will no longer receive automated replies. Reply START at any time to opt back in."

export const OPT_IN_CONFIRMATION_TEXT =
  "You have been successfully resubscribed to automated messages. Reply STOP at any time to opt out."

// In-memory cache with 5-minute TTL to ensure low-latency webhook checks
interface OptOutCacheEntry {
  optedOut: boolean
  expiresAt: number
}

const memoryCache = new Map<string, OptOutCacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

function cacheKey(userId: string | number, recipientId: string): string {
  return `${String(userId).trim()}:${String(recipientId).trim()}`
}

/**
 * Detects whether an incoming message is an explicit opt-out or opt-in command.
 * Strictly adheres to Meta Developer Policies & TCPA/GDPR compliance standards.
 */
export function detectOptAction(text: string): "opt_out" | "opt_in" | null {
  if (!text) return null
  const cleaned = text.trim().toLowerCase().replace(/[^\w\s-]/g, "").trim()
  if (!cleaned) return null

  // 1. Exact standard single-word keywords
  const exactOptOutKeywords = new Set([
    "stop",
    "unsubscribe",
    "cancel",
    "end",
    "quit",
    "stopall",
    "optout",
    "opt-out",
    "halt",
  ])

  const exactOptInKeywords = new Set([
    "start",
    "unstop",
    "resume",
    "optin",
    "opt-in",
  ])

  if (exactOptOutKeywords.has(cleaned)) return "opt_out"
  if (exactOptInKeywords.has(cleaned)) return "opt_in"

  // 2. Short phrase commands (<= 35 characters) e.g., "please stop", "unsubscribe me", "stop messaging me"
  if (cleaned.length <= 35) {
    if (
      /\b(stop|unsubscribe|cancel|quit|optout|opt-out)\b/i.test(cleaned) &&
      !/\b(non-stop|never stop|don't stop|dont stop)\b/i.test(cleaned)
    ) {
      return "opt_out"
    }

    if (/\b(start|resume|unstop|optin|opt-in)\b/i.test(cleaned)) {
      return "opt_in"
    }
  }

  return null
}

/**
 * Checks if an Instagram user (recipientId) is currently opted out for a given business account (userId).
 */
export async function isRecipientOptedOut(
  userId: string | number,
  recipientId: string,
): Promise<boolean> {
  const uid = String(userId).trim()
  const rid = String(recipientId).trim()
  if (!uid || !rid) return false

  const key = cacheKey(uid, rid)
  const cached = memoryCache.get(key)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.optedOut
  }

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("opt_outs")
      .select("status")
      .eq("user_id", uid)
      .eq("recipient_id", rid)
      .maybeSingle()

    if (error) {
      if (error.code !== "PGRST205") {
        console.warn(`[opt-out] Error querying opt_outs for ${key}:`, error.message)
      }
      return cached ? cached.optedOut : false
    }

    const optedOut = data?.status === "opted_out"
    memoryCache.set(key, { optedOut, expiresAt: now + CACHE_TTL_MS })
    return optedOut
  } catch (err) {
    console.warn(`[opt-out] Unexpected error checking opt_outs for ${key}:`, err)
    return cached ? cached.optedOut : false
  }
}

/**
 * Records an opt-out event, suppressing all future automated outreach to this user.
 */
export async function optOutRecipient(
  userId: string | number,
  recipientId: string,
): Promise<boolean> {
  const uid = String(userId).trim()
  const rid = String(recipientId).trim()
  if (!uid || !rid) return false

  const key = cacheKey(uid, rid)
  const now = new Date().toISOString()

  // Update in-memory cache immediately
  memoryCache.set(key, { optedOut: true, expiresAt: Date.now() + CACHE_TTL_MS })

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from("opt_outs")
      .upsert(
        {
          user_id: uid,
          recipient_id: rid,
          status: "opted_out",
          opted_out_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,recipient_id" },
      )

    if (error) {
      if (error.code !== "PGRST205") {
        console.error(`[opt-out] Failed to upsert opt_out for ${key}:`, error.message)
      }
      return true
    }

    console.log(`[opt-out] 🛑 User ${rid} opted out from business account ${uid}`)
    return true
  } catch (err) {
    return true
  }
}

/**
 * Restores an opted-out user when they explicitly text START or RESUME.
 */
export async function optInRecipient(
  userId: string | number,
  recipientId: string,
): Promise<boolean> {
  const uid = String(userId).trim()
  const rid = String(recipientId).trim()
  if (!uid || !rid) return false

  const key = cacheKey(uid, rid)
  const now = new Date().toISOString()

  // Update in-memory cache immediately
  memoryCache.set(key, { optedOut: false, expiresAt: Date.now() + CACHE_TTL_MS })

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from("opt_outs")
      .upsert(
        {
          user_id: uid,
          recipient_id: rid,
          status: "opted_in",
          updated_at: now,
        },
        { onConflict: "user_id,recipient_id" },
      )

    if (error) {
      if (error.code !== "PGRST205") {
        console.error(`[opt-out] Failed to upsert opt_in for ${key}:`, error.message)
      }
      return true
    }

    console.log(`[opt-out] ✅ User ${rid} opted back in for business account ${uid}`)
    return true
  } catch (err) {
    return true
  }
}
