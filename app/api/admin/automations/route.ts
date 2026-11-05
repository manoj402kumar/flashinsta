import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAuthorizedAdmin } from "@/lib/admin-auth"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const { searchParams } = request.nextUrl
    const source = searchParams.get("source") // comment, dm, story, all
    const status = searchParams.get("status") // active, paused, all
    const query = searchParams.get("q")?.toLowerCase() || ""

    const { data: automations, error: autoError } = await admin
      .from("automations")
      .select("*")
      .order("created_at", { ascending: false })

    if (autoError) throw autoError

    // Fetch user map
    const userIds = Array.from(new Set((automations || []).map((a) => a.user_id).filter(Boolean)))
    let userMap: Record<string, { username: string; igUsername?: string }> = {}
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, username, ai_context")
        .in("id", userIds)

      users?.forEach((u) => {
        let ig: string | undefined = undefined
        if (u.ai_context) {
          try {
            const parsed = JSON.parse(u.ai_context)
            if (parsed._instagram?.username) ig = parsed._instagram.username
          } catch {}
        }
        userMap[String(u.id)] = { username: u.username, igUsername: ig }
      })
    }

    let items = (automations || []).map((a) => {
      const uid = String(a.user_id)
      const uInfo = userMap[uid]
      return {
        id: a.id,
        userId: uid,
        ownerUsername: uInfo?.username || `User #${uid}`,
        ownerIgUsername: uInfo?.igUsername || null,
        name: a.name,
        triggerSource: a.trigger_source || "comment",
        triggerType: a.trigger_type,
        triggerValue: a.trigger_value,
        responseType: a.response_type,
        responseContent: a.response_content,
        isActive: Boolean(a.is_active),
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      }
    })

    if (source && source !== "all") {
      items = items.filter((it) => it.triggerSource === source)
    }

    if (status === "active") {
      items = items.filter((it) => it.isActive)
    } else if (status === "paused") {
      items = items.filter((it) => !it.isActive)
    }

    if (query) {
      items = items.filter(
        (it) =>
          it.name.toLowerCase().includes(query) ||
          it.triggerValue.toLowerCase().includes(query) ||
          it.ownerUsername.toLowerCase().includes(query) ||
          (it.ownerIgUsername && it.ownerIgUsername.toLowerCase().includes(query))
      )
    }

    return NextResponse.json({
      success: true,
      automations: items,
      totalCount: items.length,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load automations")
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { id, isActive } = body

    if (!id || typeof isActive !== "boolean") {
      return NextResponse.json({ error: "id and isActive boolean are required" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("automations")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, name, is_active")
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, automation: data })
  } catch (error) {
    return safeErrorResponse(error, "Failed to toggle automation")
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Automation id is required" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { error } = await admin.from("automations").delete().eq("id", id)
    if (error) throw error

    return NextResponse.json({ success: true, message: `Automation ${id} removed` })
  } catch (error) {
    return safeErrorResponse(error, "Failed to delete automation")
  }
}
