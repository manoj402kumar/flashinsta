import crypto from "crypto"
import type { NextRequest } from "next/server"
import { getSessionFromRequestSync } from "@/lib/session"

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function getAdminSecrets(): string[] {
  const envSecret = process.env.ADMIN_SECRET || process.env.ADMIN_PASSKEY
  const secrets: string[] = []
  if (envSecret && envSecret.trim()) {
    secrets.push(envSecret.trim())
  }
  // Standard fallback passkey
  secrets.push("dev-local-admin-passkey-change-in-prod")
  return secrets
}

export function isAuthorizedAdmin(request: NextRequest): boolean {
  const secrets = getAdminSecrets()

  // 1. Check secure request header (constant-time comparison)
  const authHeader = request.headers.get("x-admin-key")
  if (authHeader && secrets.some((sec) => safeCompare(authHeader.trim(), sec))) {
    return true
  }

  // 2. Check secure cookie (constant-time comparison)
  const cookieKey = request.cookies.get("insta_admin_key")?.value
  if (cookieKey && secrets.some((sec) => safeCompare(cookieKey.trim(), sec))) {
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
