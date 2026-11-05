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
    const status = searchParams.get("status") // pending, sent, failed, all

    let dbQuery = admin
      .from("dm_queue")
      .select("id, user_id, recipient_id, message, send_at, status, attempts, created_at")
      .order("created_at", { ascending: false })
      .limit(100)

    if (status && status !== "all") {
      dbQuery = dbQuery.eq("status", status)
    }

    const { data: queue, error } = await dbQuery

    if (error) throw error

    return NextResponse.json({
      success: true,
      queue: queue || [],
      total: queue?.length || 0,
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load DM queue")
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, id } = body

    const admin = getSupabaseAdmin()

    if (action === "retry" && id) {
      const { data, error } = await admin
        .from("dm_queue")
        .update({ status: "pending", attempts: 0, send_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ success: true, item: data })
    }

    if (action === "purge_sent") {
      const { error } = await admin.from("dm_queue").delete().eq("status", "sent")
      if (error) throw error
      return NextResponse.json({ success: true, message: "Purged all sent DMs from queue" })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    return safeErrorResponse(error, "Failed to perform DM queue action")
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
      return NextResponse.json({ error: "Queue ID is required" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { error } = await admin.from("dm_queue").delete().eq("id", id)
    if (error) throw error

    return NextResponse.json({ success: true, message: `Queue item ${id} deleted` })
  } catch (error) {
    return safeErrorResponse(error, "Failed to delete queue item")
  }
}
