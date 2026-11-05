import { type NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/session"
import { getLinkedAccounts } from "@/lib/account-links"
import { safeErrorResponse } from "@/lib/security"

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accounts = await getLinkedAccounts(session.userId)

    return NextResponse.json({
      accounts,
      activeUserId: String(session.userId),
    })
  } catch (error) {
    return safeErrorResponse(error, "Failed to retrieve linked accounts")
  }
}
