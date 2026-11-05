import { type NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getSessionFromRequest, revokeSessionIdLocally } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

async function handleLogout(request: NextRequest) {
  const response = NextResponse.json(
    { success: true, message: "Logged out successfully" },
    { status: 200 }
  )

  try {
    const session = await getSessionFromRequest(request)
    const revokeAll = request.nextUrl.searchParams.get("all") === "true"

    if (session) {
      // 1. In-process memory revocation for instant rejection across concurrent requests
      if (session.sid) {
        revokeSessionIdLocally(session.sid, session.exp)
      }

      // 2. Persistent server-side revocation in Supabase database
      if (session.userId) {
        const admin = getSupabaseAdmin()
        const { data: user } = await admin
          .from("users")
          .select("ai_context")
          .eq("id", session.userId)
          .maybeSingle()

        let ctx: Record<string, any> = {}
        try {
          if (user?.ai_context) ctx = JSON.parse(user.ai_context)
        } catch {}

        const now = Date.now()
        // Always mark session_revoked_at and explicitly record the revoked sid
        ctx.session_revoked_at = now
        if (session.sid) {
          const currentList = Array.isArray(ctx.revoked_sids) ? ctx.revoked_sids : []
          ctx.revoked_sids = [...currentList.filter((s: string) => s !== session.sid), session.sid].slice(-100)
        }
        if (revokeAll) {
          ctx.revoked_sids = []
        }

        await admin
          .from("users")
          .update({
            ai_context: JSON.stringify(ctx),
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.userId)
      }
    }
  } catch (error) {
    console.error("[Logout] Server-side revocation error:", error)
  }

  // Clear HTTP-only session cookies with all matching attributes
  clearSessionCookie(response)

  // Enforce zero caching and instruct browsers to purge storage
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Clear-Site-Data", `"cookies", "storage"`)

  return response
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}

export async function GET(request: NextRequest) {
  return handleLogout(request)
}
