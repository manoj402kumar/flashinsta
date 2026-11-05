import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

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

    const targetUserId = session.userId
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from("users")
      .select("ai_context")
      .eq("id", targetUserId)
      .maybeSingle()

    if (error) throw error

    let rawContext: Record<string, any> = {}
    try {
      rawContext = data?.ai_context ? JSON.parse(data.ai_context) : {}
    } catch {
      rawContext = { business_description: data?.ai_context ?? "" }
    }

    // Parse FAQs if stored as array or string
    let parsedFaqs: Array<{ question: string; answer: string }> = []
    if (Array.isArray(rawContext.faqs)) {
      parsedFaqs = rawContext.faqs
    } else if (typeof rawContext.faq === "string" && rawContext.faq.trim()) {
      // Split legacy faq text if any
      parsedFaqs = [{ question: "Frequently Asked Question", answer: rawContext.faq }]
    }

    const profileData = {
      // 1. Business Identity
      business_name: rawContext.business_name || "",
      industry: rawContext.industry || "E-Commerce & Digital Creator",
      business_description: rawContext.business_description || "",
      support_email: rawContext.support_email || "",
      support_phone: rawContext.support_phone || "",
      location_service_area: rawContext.location_service_area || rawContext.hours_location || "",
      operating_hours: rawContext.operating_hours || "",
      grievance_officer_name: rawContext.grievance_officer_name || "Customer Support",
      grievance_officer_email: rawContext.grievance_officer_email || rawContext.support_email || "",

      // 2. Catalog & Offerings
      services_and_pricing: rawContext.services_and_pricing || rawContext.services || "",
      refund_and_cancellation_policy: rawContext.refund_and_cancellation_policy || rawContext.policies || "",
      faqs: parsedFaqs,

      // 3. AI Persona & Safety Guardrails
      ai_tone: rawContext.ai_tone || "friendly",
      guardrail_block_sensitive_data: rawContext.guardrail_block_sensitive_data !== false, // default true
      guardrail_transparency_disclosure: rawContext.guardrail_transparency_disclosure !== false,
      guardrail_respect_opt_out: rawContext.guardrail_respect_opt_out !== false,
      custom_instructions: rawContext.custom_instructions || "",

      // 4. Consent Flags
      dpdp_ai_consent: rawContext.dpdp_ai_consent !== false,
      dpdp_dm_consent: rawContext.dpdp_dm_consent !== false,
      dpdp_analytics_consent: rawContext.dpdp_analytics_consent !== false,

      // Legacy fallback mirrors
      services: rawContext.services || rawContext.services_and_pricing || "",
      hours_location: rawContext.hours_location || rawContext.location_service_area || "",
      policies: rawContext.policies || rawContext.refund_and_cancellation_policy || "",
      faq: rawContext.faq || (parsedFaqs.map(f => `${f.question}: ${f.answer}`).join("\n")),
    }

    return NextResponse.json({ success: true, ok: true, knowledge: profileData })
  } catch (error) {
    return safeErrorResponse(error, "Failed to load business profile")
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{ userId?: string; knowledge?: Record<string, any> }>(request)
    if (errorResponse) return errorResponse

    const { userId, knowledge } = body || {}
    if (userId && String(userId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!knowledge || typeof knowledge !== "object" || Array.isArray(knowledge)) {
      return NextResponse.json({ error: "Invalid knowledge payload" }, { status: 400 })
    }

    const targetUserId = session.userId
    const admin = getSupabaseAdmin()

    // Fetch existing ai_context to preserve internal metadata (_instagram, google auth data, etc.)
    const { data: existingUser, error: fetchError } = await admin
      .from("users")
      .select("ai_context")
      .eq("id", targetUserId)
      .maybeSingle()

    if (fetchError) throw fetchError

    let existingContext: Record<string, any> = {}
    try {
      if (existingUser?.ai_context) {
        existingContext = JSON.parse(existingUser.ai_context)
      }
    } catch {}

    // Allowed fields for business knowledge & preferences
    const allowedKeys = [
      "business_name",
      "industry",
      "business_description",
      "support_email",
      "support_phone",
      "location_service_area",
      "operating_hours",
      "grievance_officer_name",
      "grievance_officer_email",
      "services_and_pricing",
      "refund_and_cancellation_policy",
      "faqs",
      "ai_tone",
      "guardrail_block_sensitive_data",
      "guardrail_transparency_disclosure",
      "guardrail_respect_opt_out",
      "custom_instructions",
      "dpdp_ai_consent",
      "dpdp_dm_consent",
      "dpdp_analytics_consent",
      // Legacy mirrors
      "services",
      "hours_location",
      "policies",
      "faq",
    ]

    const updatedFields: Record<string, any> = {}
    for (const key of allowedKeys) {
      if (key in knowledge) {
        updatedFields[key] = knowledge[key]
      }
    }

    // Mirror legacy keys automatically for backward compatibility
    if (updatedFields.services_and_pricing && !updatedFields.services) {
      updatedFields.services = updatedFields.services_and_pricing
    }
    if (updatedFields.location_service_area && !updatedFields.hours_location) {
      updatedFields.hours_location = updatedFields.location_service_area
    }
    if (updatedFields.refund_and_cancellation_policy && !updatedFields.policies) {
      updatedFields.policies = updatedFields.refund_and_cancellation_policy
    }
    if (Array.isArray(updatedFields.faqs)) {
      updatedFields.faq = updatedFields.faqs.map((f: any) => `${f.question}: ${f.answer}`).join("\n")
    }

    // Merge onto existingContext, preserving internal metadata like _instagram and google auth
    const merged: Record<string, any> = {
      ...existingContext,
      ...updatedFields,
      dpdp_last_verified_at: new Date().toISOString(),
    }

    // Explicitly guarantee _instagram is preserved
    if (existingContext._instagram) {
      merged._instagram = existingContext._instagram
    }

    const { error: updateError } = await admin
      .from("users")
      .update({ ai_context: JSON.stringify(merged), updated_at: new Date().toISOString() })
      .eq("id", targetUserId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, ok: true, knowledge: updatedFields })
  } catch (error) {
    return safeErrorResponse(error, "Failed to update business profile")
  }
}
