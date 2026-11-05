import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const requestedUserId = request.nextUrl.searchParams.get("userId")
    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const supabase = await getSupabaseServerClient()

    // Strictly fetch ice breakers belonging to this user
    const { data, error } = await supabase
      .from("ice_breakers")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: true })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    return safeErrorResponse(error, "Failed to load ice breakers")
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{
      userId?: string
      iceBreakers?: Array<{ question: string; response: string }>
    }>(request)
    if (errorResponse) return errorResponse

    const { userId: bodyUserId, iceBreakers } = body || {}
    if (bodyUserId && String(bodyUserId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!Array.isArray(iceBreakers) || iceBreakers.length > 4) {
      return NextResponse.json({ error: "Invalid ice breakers (maximum 4 allowed)" }, { status: 400 })
    }

    const supabase = await getSupabaseServerClient()
    const targetUserId = session.userId

    // 1. Delete existing ice breakers for this user ONLY
    const { error: deleteError } = await supabase
      .from("ice_breakers")
      .delete()
      .eq("user_id", targetUserId)

    if (deleteError) throw deleteError

    let inserted: any[] = []

    // 2. Insert new ice breakers for this user ONLY
    if (iceBreakers.length > 0) {
      const sanitized = iceBreakers
        .filter((ib) => ib && typeof ib.question === "string" && ib.question.trim().length > 0)
        .map((ib) => ({
          question: String(ib.question || "").slice(0, 80).trim(),
          response: String(ib.response || "").slice(1000).trim(),
          is_active: true,
          user_id: targetUserId,
        }))

      if (sanitized.length > 0) {
        const { data, error: insertError } = await supabase
          .from("ice_breakers")
          .insert(sanitized)
          .select()

        if (insertError) throw insertError
        inserted = data || []
      }
    }

    // 3. Sync to Instagram /me/messenger_profile using this user's token
    try {
      const { data: user } = await supabase
        .from("users")
        .select("access_token, page_id, business_account_id, ai_context")
        .eq("id", targetUserId)
        .maybeSingle()

      if (user) {
        let token = user.access_token
        if (!isValidInstagramToken(token) && user.ai_context) {
          try {
            const parsed = typeof user.ai_context === "string" ? JSON.parse(user.ai_context) : user.ai_context
            const ctxToken = parsed._instagram?.accessToken || parsed._instagram?.userAccessToken
            if (isValidInstagramToken(ctxToken)) token = ctxToken
          } catch {}
        }

        if (token && isValidInstagramToken(token)) {
          const baseGraph = token.startsWith("EAA")
            ? "https://graph.facebook.com/v21.0"
            : "https://graph.instagram.com/v21.0"

          if (inserted.length > 0) {
            const igPayload = inserted.map((ib: any) => ({
              question: ib.question,
              payload: `ICE_BREAKER_${ib.id}`,
            }))

            await fetch(`${baseGraph}/me/messenger_profile?access_token=${encodeURIComponent(token)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: "instagram",
                ice_breakers: igPayload,
              }),
            }).catch(() => {})
          } else {
            await fetch(`${baseGraph}/me/messenger_profile?access_token=${encodeURIComponent(token)}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                platform: "instagram",
                fields: ["ice_breakers"],
              }),
            }).catch(() => {})
          }
        }
      }
    } catch (e) {
      console.warn("[ice-breakers] IG sync failed:", e)
    }

    return NextResponse.json({ success: true, data: inserted })
  } catch (error) {
    return safeErrorResponse(error, "Failed to update ice breakers")
  }
}
