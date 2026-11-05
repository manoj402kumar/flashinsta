import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()

    // 1. Fetch conversations strictly for this user
    let { data: conversations, error } = await admin
      .from("conversations")
      .select("*")
      .eq("user_id", session.userId)
      .order("last_message_at", { ascending: false })

    if (error) throw error

    // 2. If inbox is empty, only sync from Graph API if this user has their OWN Instagram connection
    if (!conversations || conversations.length === 0) {
      try {
        const { data: user } = await admin
          .from("users")
          .select("id, access_token, business_account_id, ai_context")
          .eq("id", session.userId)
          .maybeSingle()

        let token = user?.access_token
        if (!isValidInstagramToken(token) && user?.ai_context) {
          try {
            const parsed = JSON.parse(user.ai_context)
            const ctxToken = parsed._instagram?.accessToken || parsed._instagram?.userAccessToken
            if (isValidInstagramToken(ctxToken)) token = ctxToken
          } catch {}
        }

        const bizId = user?.business_account_id
        if (token && isValidInstagramToken(token) && bizId && token.startsWith("EAA")) {
          const res = await fetch(
            `https://graph.facebook.com/v24.0/${bizId}/conversations?platform=instagram&fields=id,updated_time,participants,messages{id,message,created_time,from,to}&access_token=${token}&limit=15`,
            { signal: AbortSignal.timeout(8000) }
          )
          const data = await res.json()

          if (data.data && Array.isArray(data.data)) {
            for (const c of data.data) {
              const other = c.participants?.data?.find(
                (p: any) => String(p.id) !== String(bizId)
              )
              if (!other) continue

              const { data: newConv } = await admin
                .from("conversations")
                .upsert(
                  {
                    user_id: session.userId,
                    recipient_id: other.id,
                    recipient_username: other.username,
                    last_message_at: c.updated_time || new Date().toISOString(),
                  },
                  { onConflict: "user_id,recipient_id" }
                )
                .select("*")
                .single()

              if (newConv && c.messages?.data) {
                for (const m of c.messages.data.reverse()) {
                  await admin.from("messages").upsert(
                    {
                      user_id: session.userId,
                      conversation_id: newConv.id,
                      content: m.message || "",
                      is_from_instagram: String(m.from?.id) !== String(bizId),
                      sender_username: m.from?.username || other.username,
                      created_at: m.created_time || new Date().toISOString(),
                    },
                    { onConflict: "id" }
                  )
                }
              }
            }

            const { data: freshList } = await admin
              .from("conversations")
              .select("*")
              .eq("user_id", session.userId)
              .order("last_message_at", { ascending: false })

            conversations = freshList || []
          }
        }
      } catch (e) {
        console.warn("[inbox/conversations] Failed to sync Instagram conversations:", e)
      }
    }

    return NextResponse.json(conversations || [])
  } catch (error) {
    return safeErrorResponse(error, "Failed to fetch conversations")
  }
}
