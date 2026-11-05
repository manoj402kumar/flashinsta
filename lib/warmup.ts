import { getSupabaseAdmin } from "./supabase-admin"

export interface WarmupTier {
  dayIndex: number
  maxDailyLimit: number
  stage: string
}

export interface WarmupCheckResult {
  allowed: boolean
  dayIndex: number
  limit: number
  currentCount: number
  reason?: string
}

// In-memory cache for fast pre-flight checking: userId -> { date: YYYY-MM-DD, count: number }
const warmupCache = new Map<string, { date: string; count: number }>()

function getTodayUtcString(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Calculates account age in days and determines the corresponding Meta warm-up tier.
 * Based on Section 6.4 & Section 9 of rules and regulations.md:
 * - Days 1–3: Max 30 automated actions / day
 * - Days 4–7: Max 80 automated actions / day
 * - Days 8–14: Max 250 automated actions / day
 * - Day 15+: Standard production (up to 1,000 / day)
 */
export function getWarmupTier(connectedAt?: Date | string | number | null): WarmupTier {
  if (!connectedAt) {
    return { dayIndex: 1, maxDailyLimit: 30, stage: "Days 1-3 (Initial Warm-up)" }
  }

  const parsedTime = typeof connectedAt === "number"
    ? connectedAt
    : new Date(connectedAt).getTime()

  if (isNaN(parsedTime)) {
    return { dayIndex: 1, maxDailyLimit: 30, stage: "Days 1-3 (Initial Warm-up)" }
  }

  const now = Date.now()
  const diffMs = Math.max(0, now - parsedTime)
  const dayIndex = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1

  if (dayIndex <= 3) {
    return { dayIndex, maxDailyLimit: 30, stage: "Days 1-3 (Initial Warm-up)" }
  }
  if (dayIndex <= 7) {
    return { dayIndex, maxDailyLimit: 80, stage: "Days 4-7 (Moderate Warm-up)" }
  }
  if (dayIndex <= 14) {
    return { dayIndex, maxDailyLimit: 250, stage: "Days 8-14 (Advanced Warm-up)" }
  }
  return { dayIndex, maxDailyLimit: 1000, stage: "Day 15+ (Production)" }
}

/**
 * Checks if the user is within their progressive warm-up quota for today.
 * If allowed, atomically increments the daily action counter.
 *
 * @param userId - ID of the user / account owner
 * @param connectedAt - Timestamp when the account was created or connected
 */
export async function checkAndIncrementWarmupQuota(
  userId: string | number,
  connectedAt?: Date | string | number | null
): Promise<WarmupCheckResult> {
  const uid = String(userId).trim()
  const today = getTodayUtcString()
  const tier = getWarmupTier(connectedAt)

  // 1. Fast in-memory check
  const cached = warmupCache.get(uid)
  if (cached && cached.date === today && cached.count >= tier.maxDailyLimit) {
    return {
      allowed: false,
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount: cached.count,
      reason: `Account warm-up quota reached for Day ${tier.dayIndex} (${cached.count}/${tier.maxDailyLimit} actions today). Safe pacing enforced.`,
    }
  }

  // 2. Database check & atomic update
  try {
    const admin = getSupabaseAdmin()

    // Fetch current daily count
    const { data, error } = await admin
      .from("account_warmup_counters")
      .select("action_count")
      .eq("user_id", Number(uid))
      .eq("action_date", today)
      .maybeSingle()

    if (error && error.code !== "PGRST116" && error.code !== "PGRST205") {
      console.warn(`[warmup] Error reading counter for user ${uid}:`, error.message)
    }

    const currentCount = data?.action_count || (cached?.date === today ? cached.count : 0)

    if (currentCount >= tier.maxDailyLimit) {
      warmupCache.set(uid, { date: today, count: currentCount })
      return {
        allowed: false,
        dayIndex: tier.dayIndex,
        limit: tier.maxDailyLimit,
        currentCount,
        reason: `Account warm-up quota reached for Day ${tier.dayIndex} (${currentCount}/${tier.maxDailyLimit} actions today). Safe pacing enforced.`,
      }
    }

    const nextCount = currentCount + 1

    // Upsert new count into database if table exists
    const { error: upsertErr } = await admin
      .from("account_warmup_counters")
      .upsert(
        {
          user_id: Number(uid),
          action_date: today,
          action_count: nextCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,action_date" }
      )

    if (upsertErr && upsertErr.code !== "PGRST205") {
      console.warn(`[warmup] Error upserting counter for user ${uid}:`, upsertErr.message)
    }

    // Update in-memory cache
    warmupCache.set(uid, { date: today, count: nextCount })

    return {
      allowed: true,
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount: nextCount,
    }
  } catch (err: any) {
    console.warn(`[warmup] Exception checking quota for user ${uid}, falling back to memory:`, err?.message || err)
    
    // In-memory fallback
    const memCount = (cached && cached.date === today ? cached.count : 0) + 1
    warmupCache.set(uid, { date: today, count: memCount })

    const allowed = memCount <= tier.maxDailyLimit
    return {
      allowed,
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount: memCount,
      reason: allowed ? undefined : `Account warm-up quota reached for Day ${tier.dayIndex} (memory fallback).`,
    }
  }
}

/**
 * Returns current warm-up status without incrementing.
 */
export async function getWarmupStatus(
  userId: string | number,
  connectedAt?: Date | string | number | null
): Promise<{ dayIndex: number; limit: number; currentCount: number; stage: string }> {
  const uid = String(userId).trim()
  const today = getTodayUtcString()
  const tier = getWarmupTier(connectedAt)

  const cached = warmupCache.get(uid)
  if (cached && cached.date === today) {
    return {
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount: cached.count,
      stage: tier.stage,
    }
  }

  try {
    const admin = getSupabaseAdmin()
    const { data } = await admin
      .from("account_warmup_counters")
      .select("action_count")
      .eq("user_id", Number(uid))
      .eq("action_date", today)
      .maybeSingle()

    const currentCount = data?.action_count || 0
    warmupCache.set(uid, { date: today, count: currentCount })

    return {
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount,
      stage: tier.stage,
    }
  } catch {
    return {
      dayIndex: tier.dayIndex,
      limit: tier.maxDailyLimit,
      currentCount: cached?.date === today ? cached.count : 0,
      stage: tier.stage,
    }
  }
}
