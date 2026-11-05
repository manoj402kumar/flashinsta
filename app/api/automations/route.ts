import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

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

    const admin = getSupabaseAdmin()

    // Strictly fetch automations for the authenticated user ONLY
    const { data, error } = await admin
      .from("automations")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    return safeErrorResponse(error, "Failed to fetch automations")
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { name, trigger_source, trigger_type, trigger_value, content, specific_media_id } = body || {}

    if (!name || !trigger_value || !content || !trigger_source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["comment", "dm", "story"].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const sanitizedName = String(name).slice(0, 100).trim()
    const isAllComments = trigger_type === "reply_all" || String(trigger_value).toUpperCase().trim() === "ALL_COMMENTS"
    const sanitizedTriggerValue =
      trigger_type === "postback"
        ? `PAYLOAD_${Date.now()}_${Math.random().toString(36).substring(7)}`
        : isAllComments
          ? "ALL_COMMENTS"
          : String(trigger_value).slice(0, 200).trim()

    const admin = getSupabaseAdmin()

    const { data, error } = await admin
      .from("automations")
      .insert({
        user_id: session.userId,
        name: sanitizedName,
        trigger_source,
        trigger_type: trigger_type || "keyword",
        trigger_value: sanitizedTriggerValue,
        response_type: "pro",
        response_content: content,
        is_active: true,
        specific_media_id: specific_media_id ? String(specific_media_id) : null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return safeErrorResponse(error, "Failed to create automation")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Missing automation id" }, { status: 400 })

    const admin = getSupabaseAdmin()

    // Enforce ownership: only allow deleting own automation
    const { error } = await admin
      .from("automations")
      .delete()
      .eq("id", id)
      .eq("user_id", session.userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return safeErrorResponse(error, "Failed to delete automation")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { id, name, trigger_source, trigger_type, trigger_value, content, specific_media_id } = body || {}

    if (!id || !name || !trigger_value || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (trigger_source && !["comment", "dm", "story"].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    const isAllComments = trigger_type === "reply_all" || String(trigger_value).toUpperCase().trim() === "ALL_COMMENTS"
    const sanitizedTriggerValue =
      isAllComments
        ? "ALL_COMMENTS"
        : String(trigger_value).slice(0, 200).trim()

    const updateData: any = {
      name: String(name).slice(0, 100).trim(),
      trigger_type: trigger_type || "keyword",
      trigger_value: sanitizedTriggerValue,
      response_content: content,
      specific_media_id: specific_media_id ? String(specific_media_id) : null,
    }

    if (trigger_source) {
      updateData.trigger_source = trigger_source
    }

    // Enforce ownership: only allow updating own automation
    const { data, error } = await admin
      .from("automations")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", session.userId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return safeErrorResponse(error, "Failed to update automation")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { id, is_active, action } = body || {}
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

    const admin = getSupabaseAdmin()

    if (action === "duplicate") {
      const { data: original, error: fetchError } = await admin
        .from("automations")
        .select("*")
        .eq("id", id)
        .eq("user_id", session.userId)
        .single()

      if (fetchError || !original) {
        return NextResponse.json({ error: "Automation not found" }, { status: 404 })
      }

      const { id: _id, created_at, updated_at, ...rest } = original
      const { data, error } = await admin
        .from("automations")
        .insert({ ...rest, user_id: session.userId, name: `${original.name} (copy)`, is_active: false })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json(data)
    }

    if (typeof is_active !== "boolean") {
      return NextResponse.json({ error: "Missing or invalid is_active" }, { status: 400 })
    }

    const { data, error } = await admin
      .from("automations")
      .update({ is_active })
      .eq("id", id)
      .eq("user_id", session.userId)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    return safeErrorResponse(error, "Failed to update automation status")
  }
}
