import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversationId = request.nextUrl.searchParams.get("conversationId")
    if (!conversationId) {
      return NextResponse.json({ error: "Missing conversationId" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // Enforce ownership: verify conversation strictly belongs to session user
    const { data: conv, error: convError } = await admin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", session.userId)
      .maybeSingle()

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 })
    }

    // Fetch messages for this verified conversation
    const { data: messages, error } = await admin
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("user_id", session.userId)
      .order("created_at", { ascending: true })

    if (error) throw error

    return NextResponse.json(messages || [])
  } catch (error) {
    return safeErrorResponse(error, "Failed to fetch messages")
  }
}
