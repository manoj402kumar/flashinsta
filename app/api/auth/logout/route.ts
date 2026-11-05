import { type NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getSessionFromRequest, revokeSessionIdLocally } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

async function handleLogout(request: NextRequest) {
  const response = NextResponse.json(
    { success: true, message: "Logged out successfully" },
    { status: 200 }
  )

  try {
    const session = getSessionFromRequest(request)
    const revokeAll = request.nextUrl.searchParams.get("all") === "true"

    if (session) {
      // 1. In-process memory revocation for instant rejection across concurrent requests
      if (session.sid) {
        revokeSessionIdLocally(session.sid, session.exp)
      }

      // 2. Persistent server-side revocation in database
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

        if (revokeAll) {
          // Invalidate ALL sessions across all devices for this user
          ctx.session_revoked_at = Date.now()
        } else {
          // Single-session logout: append sid to revoked list (retaining 25 most recent)
          if (session.sid) {
            const currentList = Array.isArray(ctx.revoked_sids) ? ctx.revoked_sids : []
            ctx.revoked_sids = [...currentList.filter((s: string) => s !== session.sid), session.sid].slice(-25)
          }
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

  // Clear HTTP-only session cookies with matching attributes
  clearSessionCookie(response)

  return response
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}

export async function GET(request: NextRequest) {
  return handleLogout(request)
}
