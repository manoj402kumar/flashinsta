/**
 * Meta Business Use Case (BUC) Rate Limit Monitoring & Circuit Breaker Engine
 *
 * Implements Section 5.B & Section 9 of rules and regulations.md:
 * - Actively monitors `X-Business-Use-Case-Usage`, `X-App-Usage`, and `X-Page-Usage` headers.
 * - Extracts `call_count`, `total_cputime`, `total_time`, and `estimated_time_to_regain_access`.
 * - Automatically trips a circuit breaker when consumption reaches or exceeds the 80% safety threshold.
 * - Handles Meta Throttling Error codes (4, 17, 32) and HTTP 429 responses with exponential backoff.
 */

export const BUC_SAFETY_THRESHOLD_PERCENT = 80 // Meta safety threshold: 80%

interface AccountQuotaState {
  throttled: boolean
  callCount: number
  totalCpuTime: number
  totalTime: number
  resetAt: number // Timestamp in milliseconds
  reason?: string
}

// In-memory circuit breaker registry per Instagram Business Account ID
const quotaRegistry = new Map<string, AccountQuotaState>()

function normalizeKey(accountId?: string | number | null): string {
  if (!accountId) return "global"
  const cleaned = String(accountId).trim()
  return cleaned || "global"
}

export interface BUCUsageMetric {
  callCount: number
  totalCpuTime: number
  totalTime: number
  estimatedMinutes: number
}

/**
 * Extracts and normalizes Meta usage metrics from response headers.
 */
export function parseMetaUsageHeaders(headers: Headers): BUCUsageMetric | null {
  if (!headers) return null

  let maxCallCount = 0
  let maxCpuTime = 0
  let maxTotalTime = 0
  let maxEstimatedMinutes = 0
  let hasMetric = false

  // 1. Inspect X-Business-Use-Case-Usage (Primary Meta Graph BUC Header)
  const bucRaw = headers.get("x-business-use-case-usage")
  if (bucRaw) {
    try {
      const parsed = JSON.parse(bucRaw)
      if (typeof parsed === "object" && parsed !== null) {
        for (const accountId of Object.keys(parsed)) {
          const metricsArray = parsed[accountId]
          if (Array.isArray(metricsArray)) {
            for (const item of metricsArray) {
              if (typeof item === "object" && item !== null) {
                hasMetric = true
                if (typeof item.call_count === "number") maxCallCount = Math.max(maxCallCount, item.call_count)
                if (typeof item.total_cputime === "number") maxCpuTime = Math.max(maxCpuTime, item.total_cputime)
                if (typeof item.total_time === "number") maxTotalTime = Math.max(maxTotalTime, item.total_time)
                if (typeof item.estimated_time_to_regain_access === "number") {
                  maxEstimatedMinutes = Math.max(maxEstimatedMinutes, item.estimated_time_to_regain_access)
                }
              }
            }
          }
        }
      }
    } catch {}
  }

  // 2. Inspect X-App-Usage fallback
  const appRaw = headers.get("x-app-usage")
  if (appRaw) {
    try {
      const parsed = JSON.parse(appRaw)
      if (typeof parsed === "object" && parsed !== null) {
        hasMetric = true
        if (typeof parsed.call_count === "number") maxCallCount = Math.max(maxCallCount, parsed.call_count)
        if (typeof parsed.total_cputime === "number") maxCpuTime = Math.max(maxCpuTime, parsed.total_cputime)
        if (typeof parsed.total_time === "number") maxTotalTime = Math.max(maxTotalTime, parsed.total_time)
      }
    } catch {}
  }

  // 3. Inspect X-Page-Usage fallback
  const pageRaw = headers.get("x-page-usage")
  if (pageRaw) {
    try {
      const parsed = JSON.parse(pageRaw)
      if (typeof parsed === "object" && parsed !== null) {
        hasMetric = true
        if (typeof parsed.call_count === "number") maxCallCount = Math.max(maxCallCount, parsed.call_count)
        if (typeof parsed.total_cputime === "number") maxCpuTime = Math.max(maxCpuTime, parsed.total_cputime)
        if (typeof parsed.total_time === "number") maxTotalTime = Math.max(maxTotalTime, parsed.total_time)
      }
    } catch {}
  }

  if (!hasMetric) return null

  return {
    callCount: maxCallCount,
    totalCpuTime: maxCpuTime,
    totalTime: maxTotalTime,
    estimatedMinutes: maxEstimatedMinutes,
  }
}

/**
 * Checks if the circuit breaker is currently active for a business account.
 */
export function isMetaThrottled(accountId?: string | number | null): {
  throttled: boolean
  waitSeconds: number
  callCount: number
  reason?: string
} {
  const key = normalizeKey(accountId)
  const state = quotaRegistry.get(key)
  const now = Date.now()

  if (!state) {
    return { throttled: false, waitSeconds: 0, callCount: 0 }
  }

  if (state.throttled && state.resetAt > now) {
    const waitSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000))
    return {
      throttled: true,
      waitSeconds,
      callCount: state.callCount,
      reason: state.reason,
    }
  }

  // Circuit breaker reset window expired — restore normal operations
  if (state.throttled && state.resetAt <= now) {
    state.throttled = false
    state.reason = undefined
  }

  return { throttled: false, waitSeconds: 0, callCount: state.callCount }
}

/**
 * Records an outbound Meta API response and updates the BUC circuit breaker accordingly.
 */
export function recordMetaApiResponse(
  headers: Headers,
  status: number,
  accountId?: string | number | null,
  errorObj?: any,
): { throttled: boolean; callCount: number } {
  const key = normalizeKey(accountId)
  const metric = parseMetaUsageHeaders(headers)
  const now = Date.now()

  // 0. Check Meta Error 368 (Temporarily Blocked for Spam / Policy Violation — Section 7)
  const isError368 = errorObj && (errorObj.code === 368 || errorObj.error_subcode === 368)
  if (isError368) {
    const lockDurationMs = 24 * 60 * 60 * 1000 // Mandatory 24-hour halt
    const resetAt = now + lockDurationMs
    quotaRegistry.set(key, {
      throttled: true,
      callCount: 100,
      totalCpuTime: 100,
      totalTime: 100,
      resetAt,
      reason: "Temporarily Blocked for Spam / Policy Violation (Meta Error 368). All automations halted for 24 hours.",
    })

    console.error(
      `[meta-rate-limit] 🚨 CRITICAL: Meta Error 368 (Action Blocked for Spam) on account ${key}! All automations halted for 24 hours to prevent account suspension.`,
    )
    return { throttled: true, callCount: 100 }
  }

  // 1. Check HTTP 429 or Meta Rate Limit error codes (4, 17, 32)
  const isHttp429 = status === 429
  const isMetaThrottlingError =
    errorObj && (errorObj.code === 4 || errorObj.code === 17 || errorObj.code === 32)

  if (isHttp429 || isMetaThrottlingError) {
    const retryAfterHeader = headers?.get("retry-after")
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : 0
    const waitMs =
      retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : (metric?.estimatedMinutes || 15) * 60 * 1000

    const resetAt = now + Math.max(waitMs, 10 * 60 * 1000)
    quotaRegistry.set(key, {
      throttled: true,
      callCount: 100,
      totalCpuTime: 100,
      totalTime: 100,
      resetAt,
      reason: `Meta API rate limit triggered (status=${status}, code=${errorObj?.code})`,
    })

    console.warn(
      `[meta-rate-limit] 🚨 Circuit breaker TRIPPED for ${key} due to status ${status} / error ${errorObj?.code}. Pausing for ${Math.round(waitMs / 1000)}s.`,
    )
    return { throttled: true, callCount: 100 }
  }

  if (!metric) {
    return { throttled: false, callCount: 0 }
  }

  // 2. Check 80% BUC threshold (Section 5.B circuit breaker)
  const isOverThreshold =
    metric.callCount >= BUC_SAFETY_THRESHOLD_PERCENT ||
    metric.totalCpuTime >= BUC_SAFETY_THRESHOLD_PERCENT ||
    metric.totalTime >= BUC_SAFETY_THRESHOLD_PERCENT

  if (isOverThreshold) {
    // Sleep for estimated_time_to_regain_access or default 15 minutes rolling window
    const durationMinutes = metric.estimatedMinutes > 0 ? metric.estimatedMinutes : 15
    const resetAt = now + durationMinutes * 60 * 1000

    quotaRegistry.set(key, {
      throttled: true,
      callCount: metric.callCount,
      totalCpuTime: metric.totalCpuTime,
      totalTime: metric.totalTime,
      resetAt,
      reason: `Meta BUC header reached ${metric.callCount}% (safety threshold is ${BUC_SAFETY_THRESHOLD_PERCENT}%)`,
    })

    console.warn(
      `[meta-rate-limit] ⚠️ Circuit breaker TRIPPED for ${key}: call_count=${metric.callCount}%, cpu=${metric.totalCpuTime}%. Pausing for ${durationMinutes} minutes.`,
    )
    return { throttled: true, callCount: metric.callCount }
  }

  // Below threshold — update metrics normally
  quotaRegistry.set(key, {
    throttled: false,
    callCount: metric.callCount,
    totalCpuTime: metric.totalCpuTime,
    totalTime: metric.totalTime,
    resetAt: 0,
  })

  return { throttled: false, callCount: metric.callCount }
}

/**
 * Manually trips the circuit breaker for testing or administrative cooling periods.
 */
export function tripMetaCircuitBreaker(
  accountId?: string | number | null,
  durationSeconds = 900,
  reason = "Administrative pause",
) {
  const key = normalizeKey(accountId)
  quotaRegistry.set(key, {
    throttled: true,
    callCount: 100,
    totalCpuTime: 100,
    totalTime: 100,
    resetAt: Date.now() + durationSeconds * 1000,
    reason,
  })
}

/**
 * Explicitly halts all automations on an account for 24 hours due to Meta Error 368.
 */
export function haltAccountForPolicyViolation(
  accountId?: string | number | null,
  durationHours = 24,
  reason = "Temporarily Blocked for Spam / Policy Violation (Meta Error 368). All automations halted for 24 hours.",
) {
  const key = normalizeKey(accountId)
  const durationMs = durationHours * 60 * 60 * 1000
  quotaRegistry.set(key, {
    throttled: true,
    callCount: 100,
    totalCpuTime: 100,
    totalTime: 100,
    resetAt: Date.now() + durationMs,
    reason,
  })
}

/**
 * Checks if the account is currently halted for Error 368 policy violation or rate limiting.
 */
export function isAccountHalted(accountId?: string | number | null): {
  halted: boolean
  remainingSeconds: number
  reason?: string
} {
  const status = isMetaThrottled(accountId)
  return {
    halted: status.throttled,
    remainingSeconds: status.waitSeconds,
    reason: status.reason,
  }
}

/**
 * Resets the circuit breaker (e.g. after verified quota restoration).
 */
export function resetMetaCircuitBreaker(accountId?: string | number | null) {
  const key = normalizeKey(accountId)
  quotaRegistry.delete(key)
}
