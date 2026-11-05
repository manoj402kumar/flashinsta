import crypto from "crypto"
import { type NextRequest } from "next/server"
import { getSessionFromRequestSync } from "@/lib/session"

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function getAdminSecret(): string {
  const secret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSKEY
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[admin-auth] Fatal: ADMIN_SECRET or ADMIN_PASSKEY must be set in production")
    }
    return "dev-local-admin-passkey-change-in-prod"
  }
  return secret
}

export function isAuthorizedAdmin(request: NextRequest): boolean {
  const adminSecret = getAdminSecret()

  // 1. Check secure request header (constant-time comparison)
  const authHeader = request.headers.get("x-admin-key")
  if (authHeader && safeCompare(authHeader, adminSecret)) {
    return true
  }

  // 2. Check secure cookie (constant-time comparison)
  const cookieKey = request.cookies.get("insta_admin_key")?.value
  if (cookieKey && safeCompare(cookieKey, adminSecret)) {
    return true
  }

  // 3. Optional: Whitelist specific user IDs explicitly configured as administrators
  const adminUserIdsEnv = process.env.ADMIN_USER_IDS
  if (adminUserIdsEnv) {
    const adminUserIds = adminUserIdsEnv.split(",").map((id) => id.trim()).filter(Boolean)
    const session = getSessionFromRequestSync(request)
    if (session?.userId && adminUserIds.includes(String(session.userId))) {
      return true
    }
  }

  return false
}
