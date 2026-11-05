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

    // 1. Fetch reels posts
    const { data: posts, error: postsError } = await admin
      .from("reels_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)

    if (postsError) throw postsError

    // 2. Fetch content pool
    const { data: pool } = await admin
      .from("content_pool")
      .select("id, user_id, video_url, caption, sequence_index, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(50)

    // 3. Fetch scheduler configs
    const { data: schedulers } = await admin
      .from("scheduler_config")
      .select("*")

    return NextResponse.json({
      success: true,
      posts: posts || [],
      pool: pool || [],
      schedulers: schedulers || [],
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load reels scheduler data")
  }
}
