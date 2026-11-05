import { type NextRequest, NextResponse } from "next/server"

interface RateLimitStore {
  count: number
  resetTime: number
}

const memoryStore = new Map<string, RateLimitStore>()

// Auto cleanup old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of memoryStore.entries()) {
      if (record.resetTime <= now) {
        memoryStore.delete(key)
      }
    }
  }, 5 * 60 * 1000).unref?.()
}

export interface RateLimitOptions {
  limit?: number
  windowMs?: number
  identifierPrefix?: string
}

export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; reset: number } {
  const limit = options.limit ?? 60
  const windowMs = options.windowMs ?? 60 * 1000
  const prefix = options.identifierPrefix ?? "global"

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "127.0.0.1"

  const key = `${prefix}:${ip}`
  const now = Date.now()
  const record = memoryStore.get(key)

  if (!record || record.resetTime <= now) {
    memoryStore.set(key, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: limit - 1, reset: Math.ceil(windowMs / 1000) }
  }

  record.count += 1
  const remaining = Math.max(0, limit - record.count)
  const resetSeconds = Math.ceil((record.resetTime - now) / 1000)

  if (record.count > limit) {
    return { allowed: false, remaining: 0, reset: resetSeconds }
  }

  return { allowed: true, remaining, reset: resetSeconds }
}

export function rateLimitResponse(resetSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(resetSeconds),
        "X-RateLimit-Remaining": "0",
      },
    }
  )
}
