/**
 * Humanized Jitter & Pacing Engine
 *
 * Implements Section 6.2 & Section 6.3 of Meta's Rules and Regulations:
 * - Never fire automated responses in sub-second clusters.
 * - Private DMs: randomized delay between 3 and 15 seconds (default 3–8s).
 * - Public Comment Replies: randomized delay between 5 and 45 seconds (default 5–12s).
 * - User-specified delays: preserved with natural human variation (+/- 10%).
 */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculates a humanized randomized delay in milliseconds.
 *
 * @param type - "dm" for direct messages, "comment" for public comment replies
 * @param userDelaySeconds - Optional delay explicitly configured in automation rule
 */
export function getHumanizedDelayMs(type: "dm" | "comment", userDelaySeconds?: number): number {
  // If test environment is explicitly configured to skip delays, return 0
  if (process.env.NODE_ENV === "test" && process.env.SKIP_JITTER_IN_TEST === "true") {
    return 0
  }

  const explicitSec = Number(userDelaySeconds) || 0

  if (explicitSec > 0) {
    // Add natural human variation: +/- 10%
    const jitterFactor = 0.9 + Math.random() * 0.2 // between 0.9 and 1.1
    return Math.max(1000, Math.floor(explicitSec * 1000 * jitterFactor))
  }

  if (type === "dm") {
    // Meta Rule: 3 to 15 seconds. Default safe randomized baseline: 3,000 to 7,500 ms
    const minMs = 3000
    const maxMs = 7500
    return Math.floor(minMs + Math.random() * (maxMs - minMs))
  }

  // type === "comment": Meta Rule: 5 to 45 seconds. Default safe randomized baseline: 5,000 to 12,000 ms
  const minMs = 5000
  const maxMs = 12000
  return Math.floor(minMs + Math.random() * (maxMs - minMs))
}

/**
 * Applies a humanized randomized delay before executing an outbound Meta API call.
 *
 * @param type - "dm" | "comment"
 * @param userDelaySeconds - Optional configured delay seconds
 * @returns Milliseconds slept
 */
export async function applyHumanizedJitter(type: "dm" | "comment", userDelaySeconds?: number): Promise<number> {
  const delayMs = getHumanizedDelayMs(type, userDelaySeconds)
  if (delayMs > 0) {
    await sleep(delayMs)
  }
  return delayMs
}
