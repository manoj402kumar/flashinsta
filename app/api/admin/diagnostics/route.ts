import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAuthorizedAdmin } from "@/lib/admin-auth"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const startTime = Date.now()
    const admin = getSupabaseAdmin()

    // 1. Ping DB and count tables
    const tables = [
      "users",
      "conversations",
      "messages",
      "webhook_events",
      "automations",
      "media_cache",
      "ice_breakers",
      "content_pool",
      "scheduler_config",
      "reels_posts",
      "dm_queue",
      "unlock_attempts",
    ]

    const tableCounts: Record<string, { count: number | null; status: "ok" | "error"; error?: string }> = {}

    await Promise.all(
      tables.map(async (table) => {
        try {
          const { count, error } = await admin.from(table).select("*", { count: "exact", head: true })
          if (error) {
            tableCounts[table] = { count: null, status: "error", error: error.message }
          } else {
            tableCounts[table] = { count: count ?? 0, status: "ok" }
          }
        } catch (e: any) {
          tableCounts[table] = { count: null, status: "error", error: e?.message || "Unknown error" }
        }
      })
    )

    const dbLatencyMs = Date.now() - startTime

    // 2. Check storage bucket
    let bucketStatus = "unknown"
    try {
      const { data: buckets, error: bucketError } = await admin.storage.listBuckets()
      if (bucketError) {
        bucketStatus = `Error: ${bucketError.message}`
      } else {
        const reelsBucket = buckets?.find((b) => b.id === "reels")
        bucketStatus = reelsBucket ? "ready (public)" : "reels bucket missing"
      }
    } catch (e: any) {
      bucketStatus = `Exception: ${e?.message}`
    }

    // 3. Environment configuration checklist
    const envCheck = {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      instagramAppId: Boolean(process.env.INSTAGRAM_APP_ID || process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID),
      instagramAppSecret: Boolean(process.env.INSTAGRAM_APP_SECRET),
      instagramWebhookToken: Boolean(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN),
      redirectUri: process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI || "http://localhost:3000/api/instagram/callback",
      groqApiKey: Boolean(process.env.GROQ_API_KEY),
      googleAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      nodeEnv: process.env.NODE_ENV || "development",
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      database: {
        status: "connected",
        latencyMs: dbLatencyMs,
        tables: tableCounts,
      },
      storage: {
        reelsBucket: bucketStatus,
      },
      environment: envCheck,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to run diagnostics")
  }
}
