import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, setSessionCookie } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{ userId?: string; username?: string }>(request)
    if (errorResponse) return errorResponse

    const { userId, username } = body || {}
    const cleanUsername = (username || "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "")

    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 30) {
      return NextResponse.json(
        { error: "Username must be between 3 and 30 alphanumeric characters" },
        { status: 400 }
      )
    }

    // Enforce authorization: only allow modifying own username
    const targetUserId = session.userId
    if (userId && userId !== targetUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const admin = getSupabaseAdmin()

    // Check if another user already has this username
    const { data: existingUser } = await admin
      .from("users")
      .select("id")
      .eq("username", cleanUsername)
      .neq("id", targetUserId)
      .maybeSingle()

    if (existingUser) {
      return NextResponse.json(
        { error: `@${cleanUsername} is already taken. Please choose another one.` },
        { status: 409 }
      )
    }

    // Update username in Supabase
    const { error: updateError } = await admin
      .from("users")
      .update({ username: cleanUsername, updated_at: new Date().toISOString() })
      .eq("id", targetUserId)

    if (updateError) {
      return safeErrorResponse(updateError, "Failed to update username")
    }

    const response = NextResponse.json({
      success: true,
      username: cleanUsername,
      userId: targetUserId,
    })

    setSessionCookie(response, {
      ...session,
      username: cleanUsername,
      userId: targetUserId,
    })

    return response
  } catch (error) {
    return safeErrorResponse(error, "Failed to update username")
  }
}
