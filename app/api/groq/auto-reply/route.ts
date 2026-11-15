import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = request.nextUrl.searchParams.get("userId") || session.userId
    if (userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("users")
      .select("groq_auto_reply_enabled, ai_context, groq_api_key, ai_base_url, ai_model")
      .eq("id", session.userId)
      .single()

    if (error || !data) {
      return NextResponse.json({ enabled: false, ai_context: "", has_api_key: false, ai_base_url: "", ai_model: "" })
    }

    // Safely parse ai_context so internal metadata (_instagram tokens, credentials) is NEVER leaked to the client
    let userFacingContext = ""
    if (data.ai_context) {
      try {
        const parsed = JSON.parse(data.ai_context)
        if (parsed && typeof parsed === "object") {
          userFacingContext = parsed.custom_instructions || parsed.business_description || ""
        } else {
          userFacingContext = String(data.ai_context)
        }
      } catch {
        userFacingContext = String(data.ai_context)
      }
    }

    return NextResponse.json({
      enabled: data.groq_auto_reply_enabled ?? false,
      ai_context: userFacingContext,
      has_api_key: Boolean(data.groq_api_key),
      ai_base_url: data.ai_base_url ?? "",
      ai_model: data.ai_model ?? "",
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load auto-reply settings")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { userId, enabled, ai_context, groq_api_key, ai_base_url, ai_model } = body || {}
    if (userId && userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const supabase = await getSupabaseServerClient()
    const update: Record<string, unknown> = {}
    if (typeof enabled === "boolean") update.groq_auto_reply_enabled = enabled
    if (typeof groq_api_key === "string") update.groq_api_key = groq_api_key || null
    if (typeof ai_base_url === "string") update.ai_base_url = ai_base_url || null
    if (typeof ai_model === "string") update.ai_model = ai_model || null

    if (typeof ai_context === "string") {
      // Fetch existing ai_context to preserve internal metadata like _instagram tokens
      const { data: existingUser } = await supabase
        .from("users")
        .select("ai_context")
        .eq("id", session.userId)
        .maybeSingle()

      let existingContext: Record<string, any> = {}
      try {
        if (existingUser?.ai_context) {
          existingContext = JSON.parse(existingUser.ai_context)
        }
      } catch {}

      if (existingContext && typeof existingContext === "object" && Object.keys(existingContext).length > 0) {
        existingContext.custom_instructions = ai_context.trim()
        update.ai_context = JSON.stringify(existingContext)
      } else {
        update.ai_context = ai_context.trim()
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true })
    }

    const { error } = await supabase.from("users").update(update).eq("id", session.userId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    return safeErrorResponse(error, "Failed to update auto-reply configuration")
  }
}
