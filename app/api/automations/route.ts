import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"
import {
  MAX_RULE_MEDIA_IDS,
  buildMediaSelection,
  formatSeparatedWorkflowName,
  normalizeMediaIds,
} from "@/lib/automation-media"

function parseRuleMediaIds(body: any): { mediaIds: string[] } | { error: string } {
  const hasList = body?.specific_media_ids !== undefined && body?.specific_media_ids !== null

  if (hasList && !Array.isArray(body.specific_media_ids)) {
    return { error: "specific_media_ids must be an array" }
  }

  const raw: unknown[] = hasList
    ? body.specific_media_ids
    : body?.specific_media_id !== undefined && body?.specific_media_id !== null
      ? [body.specific_media_id]
      : []

  if (raw.length > MAX_RULE_MEDIA_IDS) {
    return { error: `A rule can target at most ${MAX_RULE_MEDIA_IDS} media items` }
  }

  const hasInvalidEntry = raw.some(
    (value) =>
      value !== null &&
      value !== undefined &&
      typeof value !== "string" &&
      typeof value !== "number",
  )
  if (hasInvalidEntry) {
    return { error: "specific_media_ids must contain only media ID strings" }
  }

  return { mediaIds: normalizeMediaIds(raw) }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
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
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { name, trigger_source, trigger_type, trigger_value, content, separate_workflows, media_items } = body || {}

    if (!name || !trigger_value || !content || !trigger_source) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["comment", "dm", "story"].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const mediaTarget = parseRuleMediaIds(body)
    if ("error" in mediaTarget) {
      return NextResponse.json({ error: mediaTarget.error }, { status: 400 })
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

    // When targeting multiple media items, automatically create an individual
    // workflow for each selected item so the creator can edit/tune each post's automation independently.
    if (separate_workflows !== false && mediaTarget.mediaIds.length > 1) {
      const captionMap = new Map<string, string>()
      const customTriggerMap = new Map<string, { trigger_value: string; trigger_type: string }>()
      const customContentMap = new Map<string, any>()

      if (Array.isArray(media_items)) {
        for (const item of media_items) {
          if (item?.id) {
            const id = String(item.id)
            if (item.caption) {
              captionMap.set(id, String(item.caption))
            }
            if (typeof item.trigger_value === "string" && item.trigger_value.trim()) {
              const val = String(item.trigger_value).slice(0, 200).trim()
              const isCustomAll = val.toUpperCase() === "ALL" || val.toUpperCase() === "ALL_COMMENTS"
              customTriggerMap.set(id, {
                trigger_value: isCustomAll ? "ALL_COMMENTS" : val,
                trigger_type:
                  typeof item.trigger_type === "string" && item.trigger_type.trim()
                    ? item.trigger_type.trim()
                    : isCustomAll
                      ? "reply_all"
                      : "keyword",
              })
            }
            if (item.custom_content && typeof item.custom_content === "object") {
              customContentMap.set(id, item.custom_content)
            }
          }
        }
      }

      const rows = mediaTarget.mediaIds.map((mediaId, index) => {
        const custom = customTriggerMap.get(mediaId)
        const rowTriggerValue = custom ? custom.trigger_value : sanitizedTriggerValue
        const rowTriggerType = custom ? custom.trigger_type : trigger_type || "keyword"
        const rowContent = customContentMap.get(mediaId) || content

        return {
          user_id: session.userId,
          name: formatSeparatedWorkflowName(
            sanitizedName,
            index,
            mediaTarget.mediaIds.length,
            captionMap.get(mediaId),
            custom ? custom.trigger_value : null,
          ),
          trigger_source,
          trigger_type: rowTriggerType,
          trigger_value: rowTriggerValue,
          response_type: "pro",
          response_content: rowContent,
          is_active: true,
          specific_media_id: mediaId,
          media_selection: buildMediaSelection([mediaId]),
        }
      })

      const { data, error } = await admin
        .from("automations")
        .insert(rows)
        .select()

      if (error) throw error
      return NextResponse.json(data)
    }

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
        specific_media_id: mediaTarget.mediaIds[0] || null,
        media_selection: buildMediaSelection(mediaTarget.mediaIds),
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
    const session = await getSessionFromRequest(request)
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
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const { id, name, trigger_source, trigger_type, trigger_value, content } = body || {}

    if (!id || !name || !trigger_value || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (trigger_source && !["comment", "dm", "story"].includes(trigger_source)) {
      return NextResponse.json({ error: "Invalid trigger source" }, { status: 400 })
    }

    const mediaTarget = parseRuleMediaIds(body)
    if ("error" in mediaTarget) {
      return NextResponse.json({ error: mediaTarget.error }, { status: 400 })
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
      specific_media_id: mediaTarget.mediaIds[0] || null,
      media_selection: buildMediaSelection(mediaTarget.mediaIds),
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
    const session = await getSessionFromRequest(request)
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
