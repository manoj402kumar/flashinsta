import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest, clearSessionCookie } from "@/lib/session"
import { parseSafeJson, safeErrorResponse } from "@/lib/security"

/**
 * Right to Correction and Erasure of Personal Data
 * Purges the stored personal data upon verified request.
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: body, errorResponse } = await parseSafeJson<{ confirmation?: string; deleteAccount?: boolean }>(request)
    if (errorResponse) return errorResponse

    const { confirmation, deleteAccount } = body || {}

    if (confirmation !== "DELETE MY DATA") {
      return NextResponse.json(
        { error: 'Please type "DELETE MY DATA" exactly to confirm data erasure.' },
        { status: 400 }
      )
    }

    const userId = session.userId
    const admin = getSupabaseAdmin()

    // 1. Purge messages
    await admin.from("messages").delete().eq("user_id", userId)

    // 2. Purge conversations
    await admin.from("conversations").delete().eq("user_id", userId)

    // 3. Purge automations
    await admin.from("automations").delete().eq("user_id", userId)

    // 4. Either delete user entirely or strip all personal data & credentials
    const response = NextResponse.json({
      success: true,
      ok: true,
      message: "All personal data, tokens, and automation records have been permanently erased per DPDP guidelines.",
    })

    if (deleteAccount) {
      await admin.from("users").delete().eq("id", userId)
      clearSessionCookie(response)
    } else {
      // Retain basic account but wipe all external personal data and tokens
      await admin
        .from("users")
        .update({
          access_token: "",
          business_account_id: null,
          page_id: null,
          ai_context: JSON.stringify({
            dpdp_erased_at: new Date().toISOString(),
            notice: "Personal data purged upon Data Principal request.",
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
    }

    return response
  } catch (error) {
    return safeErrorResponse(error, "Failed to erase personal data")
  }
}
