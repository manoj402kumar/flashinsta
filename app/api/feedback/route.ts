import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { isAuthorizedAdmin } from "@/lib/admin-auth"
import { getSessionFromRequestSync } from "@/lib/session"
import { safeErrorResponse, parseSafeJson } from "@/lib/security"
import { checkRateLimit } from "@/lib/rate-limit"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const ALLOWED_CATEGORIES = new Set(["feature_request", "bug", "improvement", "praise"])
const ALLOWED_STATUSES = new Set(["new", "in_review", "resolved"])

export async function POST(request: NextRequest) {
  try {
    // 1. Rate limit submissions (10 submissions per 10 minutes per IP)
    const rate = checkRateLimit(request, {
      limit: 10,
      windowMs: 10 * 60 * 1000,
      identifierPrefix: "feedback-post",
    })
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many feedback submissions. Please slow down." },
        { status: 429, headers: { "Retry-After": String(rate.reset) } }
      )
    }

    // 2. Safe JSON Parsing
    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const rating = Number(body?.rating)
    const category = typeof body?.category === "string" ? body.category.trim() : "improvement"
    const message = typeof body?.message === "string" ? body.message.trim() : ""
    const customIgHandle = typeof body?.ig_username === "string" ? body.ig_username.trim().replace(/^@/, "") : ""

    // 3. Validation
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5." },
        { status: 400 }
      )
    }

    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${Array.from(ALLOWED_CATEGORIES).join(", ")}` },
        { status: 400 }
      )
    }

    if (!message || message.length < 5) {
      return NextResponse.json(
        { error: "Feedback message must be at least 5 characters long." },
        { status: 400 }
      )
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { error: "Feedback message cannot exceed 2000 characters." },
        { status: 400 }
      )
    }

    // 4. Authenticate submitting creator (if logged in)
    const session = getSessionFromRequestSync(request)
    const admin = getSupabaseAdmin()

    let resolvedUserId: number | null = null
    let resolvedIgUsername: string = customIgHandle ? `@${customIgHandle}` : "Anonymous Creator"
    let creatorEmail: string | null = null
    let creatorProfilePic: string | null = null
    let businessAccountId: string | null = null

    if (session?.userId) {
      resolvedUserId = Number(session.userId) || null
      if (resolvedUserId) {
        const { data: user } = await admin
          .from("users")
          .select("id, username, email, profile_pic, business_account_id")
          .eq("id", resolvedUserId)
          .single()

        if (user) {
          creatorEmail = user.email || null
          creatorProfilePic = user.profile_pic || null
          businessAccountId = user.business_account_id || null
          if (!customIgHandle) {
            resolvedIgUsername = user.username ? (user.username.startsWith("@") ? user.username : `@${user.username}`) : (user.email || "Creator")
          }
        }
      }
    }

    // 5. Secure storage in webhook_events telemetry table
    const feedbackPayload = {
      category,
      rating,
      message,
      status: "new",
      ig_username: resolvedIgUsername,
      creator_email: creatorEmail,
      profile_pic: creatorProfilePic,
      business_account_id: businessAccountId,
      user_agent: request.headers.get("user-agent") || "unknown",
      submitted_at: new Date().toISOString(),
    }

    const { data: insertedEvent, error: insertError } = await admin
      .from("webhook_events")
      .insert({
        event_type: "feedback",
        user_id: resolvedUserId,
        data: feedbackPayload,
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (insertError) {
      logger.error("Failed to persist feedback to database", insertError, { subsystem: "feedback" })
      throw insertError
    }

    logger.info("New feedback received successfully", {
      subsystem: "feedback",
      category,
      rating,
      creator: resolvedIgUsername,
    })

    return NextResponse.json(
      {
        success: true,
        message: "Thank you for your feedback! Our team reviews every submission.",
        id: insertedEvent?.id,
      },
      { status: 201 }
    )
  } catch (err: any) {
    return safeErrorResponse(err, "Failed to submit feedback", 500)
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Strictly Admin Only
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = getSupabaseAdmin()
    const { searchParams } = request.nextUrl
    const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 300)
    const offset = parseInt(searchParams.get("offset") || "0", 10)

    // 2. Fetch feedback entries
    const { data: events, error } = await admin
      .from("webhook_events")
      .select("id, user_id, data, processed_at")
      .eq("event_type", "feedback")
      .order("processed_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // 3. User Enrichment
    const userIds = Array.from(new Set((events || []).map((e) => e.user_id).filter(Boolean)))
    let userMap: Record<string, { username: string; profile_pic?: string | null }> = {}
    if (userIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, username, profile_pic")
        .in("id", userIds)

      users?.forEach((u) => {
        userMap[String(u.id)] = {
          username: u.username ? (u.username.startsWith("@") ? u.username : `@${u.username}`) : `User #${u.id}`,
          profile_pic: u.profile_pic,
        }
      })
    }

    // 4. Map to Admin FeedbackItem Contract
    const feedback = (events || []).map((ev) => {
      const d = ev.data || {}
      const fallbackUser = ev.user_id ? userMap[String(ev.user_id)] : null
      const displayIgHandle = d.ig_username || fallbackUser?.username || "Anonymous Creator"
      const displayAvatar = d.profile_pic || fallbackUser?.profile_pic || null

      return {
        id: ev.id,
        userId: ev.user_id ? String(ev.user_id) : null,
        username: displayIgHandle,
        igUsername: displayIgHandle,
        profilePic: displayAvatar,
        category: d.category || "improvement",
        rating: typeof d.rating === "number" ? d.rating : 5,
        message: d.message || "",
        status: d.status || "new",
        createdAt: ev.processed_at,
      }
    })

    return NextResponse.json({ feedback })
  } catch (err: any) {
    return safeErrorResponse(err, "Failed to fetch feedback", 500)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<any>(request)
    if (errorResponse) return errorResponse

    const id = body?.id
    const status = body?.status

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing feedback id" }, { status: 400 })
    }

    if (!status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}` },
        { status: 400 }
      )
    }

    const admin = getSupabaseAdmin()

    // Read current data
    const { data: currentEvent, error: fetchError } = await admin
      .from("webhook_events")
      .select("id, data")
      .eq("id", id)
      .eq("event_type", "feedback")
      .single()

    if (fetchError || !currentEvent) {
      return NextResponse.json({ error: "Feedback entry not found" }, { status: 404 })
    }

    const updatedData = {
      ...(currentEvent.data || {}),
      status,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await admin
      .from("webhook_events")
      .update({ data: updatedData })
      .eq("id", id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, id, status })
  } catch (err: any) {
    return safeErrorResponse(err, "Failed to update feedback status", 500)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isAuthorizedAdmin(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Missing id query parameter" }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from("webhook_events")
      .delete()
      .eq("id", id)
      .eq("event_type", "feedback")

    if (error) throw error

    return NextResponse.json({ success: true, id })
  } catch (err: any) {
    return safeErrorResponse(err, "Failed to delete feedback", 500)
  }
}
