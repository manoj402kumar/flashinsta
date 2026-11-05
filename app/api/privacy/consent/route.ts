import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

/**
 * DPDP Act 2023 - Section 6: Consent and Right to Withdraw Consent
 * Records explicit consent preferences for automated AI processing and data handling.
 */
export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.userId
    const admin = getSupabaseAdmin()

    const { data: user, error } = await admin
      .from("users")
      .select("ai_context, groq_auto_reply_enabled, updated_at")
      .eq("id", userId)
      .maybeSingle()

    if (error) throw error

    let parsed: any = {}
    try {
      if (user?.ai_context) parsed = JSON.parse(user.ai_context)
    } catch {}

    const consent = {
      ai_processing_consent: parsed.dpdp_ai_consent !== false, // default true on active account
      dm_automation_consent: parsed.dpdp_dm_consent !== false,
      analytics_consent: parsed.dpdp_analytics_consent !== false,
      last_updated: parsed.dpdp_consent_updated_at || user?.updated_at || new Date().toISOString(),
      statutory_framework: "Data Protection & Privacy Notice",
    }

    return NextResponse.json({ success: true, ok: true, consent })
  } catch (error) {
    return safeErrorResponse(error, "Failed to fetch privacy consent status")
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{
      ai_processing_consent?: boolean
      dm_automation_consent?: boolean
      analytics_consent?: boolean
    }>(request)
    if (errorResponse) return errorResponse

    const { ai_processing_consent, dm_automation_consent, analytics_consent } = body || {}

    const userId = session.userId
    const admin = getSupabaseAdmin()

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("ai_context")
      .eq("id", userId)
      .maybeSingle()

    if (fetchError) throw fetchError

    let context: any = {}
    try {
      if (user?.ai_context) context = JSON.parse(user.ai_context)
    } catch {}

    context.dpdp_ai_consent = Boolean(ai_processing_consent)
    context.dpdp_dm_consent = Boolean(dm_automation_consent)
    context.dpdp_analytics_consent = Boolean(analytics_consent)
    context.dpdp_consent_updated_at = new Date().toISOString()

    const updatePayload: Record<string, any> = {
      ai_context: JSON.stringify(context),
      updated_at: new Date().toISOString(),
    }

    // If user revokes AI processing consent, automatically disable groq auto reply
    if (ai_processing_consent === false) {
      updatePayload.groq_auto_reply_enabled = false
    }

    const { error: updateError } = await admin
      .from("users")
      .update(updatePayload)
      .eq("id", userId)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      ok: true,
      message: "Consent preferences successfully updated.",
      consent: {
        ai_processing_consent: context.dpdp_ai_consent,
        dm_automation_consent: context.dpdp_dm_consent,
        analytics_consent: context.dpdp_analytics_consent,
        last_updated: context.dpdp_consent_updated_at,
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to update consent preferences")
  }
}
