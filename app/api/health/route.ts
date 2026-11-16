import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Short in-memory cache to prevent thundering herd from external monitors (UptimeRobot, BetterStack, etc.)
let lastDbCheckTime = 0
let cachedDbHealthy = false
let cachedLatencyMs = 0
const DB_CACHE_TTL_MS = 5000 // 5 seconds

async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const now = Date.now()
  if (now - lastDbCheckTime < DB_CACHE_TTL_MS && lastDbCheckTime > 0) {
    return { healthy: cachedDbHealthy, latencyMs: cachedLatencyMs }
  }

  const start = Date.now()
  try {
    const admin = getSupabaseAdmin()
    // Perform lightweight HEAD query with bounded 3s timeout
    const { error } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000))

    const latency = Date.now() - start
    const isHealthy = !error

    lastDbCheckTime = now
    cachedDbHealthy = isHealthy
    cachedLatencyMs = latency

    return {
      healthy: isHealthy,
      latencyMs: latency,
      error: error ? "Database query failed" : undefined,
    }
  } catch {
    const latency = Date.now() - start
    lastDbCheckTime = now
    cachedDbHealthy = false
    cachedLatencyMs = latency
    return {
      healthy: false,
      latencyMs: latency,
      error: "Database connectivity timeout or unreachable",
    }
  }
}

export async function GET(request: NextRequest) {
  const dbResult = await checkDatabaseHealth()

  const payload = {
    status: dbResult.healthy ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      app: "healthy",
      database: dbResult.healthy ? "connected" : "unreachable",
    },
    latencyMs: dbResult.latencyMs,
  }

  const statusCode = dbResult.healthy ? 200 : 503

  return NextResponse.json(payload, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health-Status": payload.status,
    },
  })
}

export async function HEAD(request: NextRequest) {
  const dbResult = await checkDatabaseHealth()
  const statusCode = dbResult.healthy ? 200 : 503

  return new NextResponse(null, {
    status: statusCode,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Health-Status": dbResult.healthy ? "ok" : "degraded",
    },
  })
}
