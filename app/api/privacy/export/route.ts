import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { safeErrorResponse } from "@/lib/security"

/**
 * DPDP Act 2023 - Section 11: Right to Access Information About Personal Data
 * Allows the Data Principal (user) to download a machine-readable summary of all personal data held.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.userId
    const admin = getSupabaseAdmin()

    // 1. Fetch user profile
    const { data: user, error: userError } = await admin
      .from("users")
      .select("id, username, business_account_id, page_id, groq_auto_reply_enabled, created_at, updated_at, ai_context")
      .eq("id", userId)
      .maybeSingle()

    if (userError) throw userError
    if (!user) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 })
    }

    // 2. Fetch automations
    const { data: automations } = await admin
      .from("automations")
      .select("id, keyword, match_type, reply_content, is_active, created_at, execution_count")
      .eq("user_id", userId)

    // 3. Fetch conversations count and recent messages
    const { data: conversations } = await admin
      .from("conversations")
      .select("id, instagram_thread_id, participant_username, last_message_at, message_count")
      .eq("user_id", userId)

    const { data: messages } = await admin
      .from("messages")
      .select("id, conversation_id, sender_username, content, is_from_instagram, created_at")
      .eq("user_id", userId)
      .limit(200)

    // Parse knowledge base while masking active authentication tokens
    let parsedContext: any = {}
    try {
      if (user.ai_context) parsedContext = JSON.parse(user.ai_context)
    } catch {
      parsedContext = { raw: user.ai_context }
    }

    if (parsedContext._instagram) {
      const ig = { ...parsedContext._instagram }
      delete ig.accessToken
      delete ig.userAccessToken
      parsedContext._instagram = ig
    }

    const exportPackage = {
      standard: "Data Protection & Privacy Export",
      export_timestamp: new Date().toISOString(),
      account_profile: {
        user_id: user.id,
        username: user.username,
        account_created_at: user.created_at,
        account_updated_at: user.updated_at,
      },
      business_profile_and_ai_knowledge: {
        business_name: parsedContext.business_name || null,
        business_description: parsedContext.business_description || null,
        services: parsedContext.services || null,
        hours_location: parsedContext.hours_location || null,
        policies: parsedContext.policies || null,
        faq: parsedContext.faq || null,
        google_account_linked: Boolean(parsedContext.google_email),
        google_email: parsedContext.google_email || null,
      },
      instagram_integration: {
        connected: Boolean(parsedContext._instagram),
        instagram_username: parsedContext._instagram?.username || null,
        business_account_id: user.business_account_id || null,
        page_id: user.page_id || null,
      },
      automations: automations || [],
      conversations: conversations || [],
      messages_summary: {
        sample_messages_count: messages?.length || 0,
        sample_records: messages || [],
      },
      contact_notice: {
        entity: "flash-insta / ayuuxh labs",
        contact_email: "y.manoj623246@gmail.com",
        purpose: "Automated Instagram DM, comment handling, and AI response orchestration.",
      },
    }

    return new NextResponse(JSON.stringify(exportPackage, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="flash-insta-data-export-${userId}-${Date.now()}.json"`,
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to export personal data")
  }
}
