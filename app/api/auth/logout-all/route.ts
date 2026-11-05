import { type NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getSessionFromRequest } from "@/lib/session"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export async function POST(request: NextRequest) {
  const response = NextResponse.json(
    { success: true, message: "Logged out of all devices successfully" },
    { status: 200 }
  )

  try {
    const session = getSessionFromRequest(request)
    if (session?.userId) {
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

      // Global revocation timestamp invalidates all sessions issued at or prior to now
      ctx.session_revoked_at = Date.now()
      ctx.revoked_sids = []

      await admin
        .from("users")
        .update({
          ai_context: JSON.stringify(ctx),
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.userId)
    }
  } catch (error) {
    console.error("[Logout-All] Error revoking all sessions:", error)
  }

  clearSessionCookie(response)
  return response
}
