// One account identity for every surface.
//
// Connected Instagram account -> Instagram handle and Instagram profile photo.
// No Instagram account       -> login email and the Google profile photo.
//
// A users row can outlive an Instagram connection and its username column may
// hold an Instagram handle, a page name, or the login email. Resolve identity
// from ai_context and token state instead of trusting that column.

export interface IdentitySource {
  username?: string | null
  ai_context?: string | null
  access_token?: string | null
  token_expires_at?: string | null
  business_account_id?: string | number | null
}

export interface ResolvedIdentity {
  email: string | null
  username: string
  profilePic: string | null
  googleProfilePic: string | null
  isIgConnected: boolean
  igUsername: string | null
  businessAccountId: string | null
}

export function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false // Google OAuth token
  return token.length > 20
}

export function isEmailAddress(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
}

export function normalizeIdentityName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().replace(/^@+/, "")
  return trimmed || null
}

export function isInstagramHandle(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false
  return /^[A-Za-z0-9._]{1,30}$/.test(value.trim())
}

export const INSTAGRAM_PROFILE_TTL_MS = 6 * 60 * 60 * 1000

export function instagramProfileNeedsRefresh(
  user: IdentitySource,
  now = Date.now(),
): boolean {
  if (!getInstagramToken(user)) return false
  if (user.token_expires_at && new Date(user.token_expires_at).getTime() < now) return false

  const insta = readContext(user.ai_context)._instagram
  if (!insta || typeof insta !== "object" || Array.isArray(insta)) return true
  if (readHttpUrl(insta.profilePic) === null) return true

  const updatedAt =
    typeof insta.profilePicUpdatedAt === "string"
      ? Date.parse(insta.profilePicUpdatedAt)
      : NaN
  return !Number.isFinite(updatedAt) || now - updatedAt > INSTAGRAM_PROFILE_TTL_MS
}

export function formatIdentityHandle(
  value: string | null | undefined,
  fallback = "Account",
): string {
  const name = normalizeIdentityName(value) || fallback
  if (isEmailAddress(name)) return name
  return isInstagramHandle(name) ? `@${name}` : name
}

function readContext(value: string | null | undefined): Record<string, any> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function parseAiContext(value: string | null | undefined): Record<string, any> {
  return readContext(value)
}

function readHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

export function isGoogleProfilePhoto(value: string | null | undefined): boolean {
  const url = readHttpUrl(value)
  if (!url) return false
  try {
    return new URL(url).hostname.endsWith("googleusercontent.com")
  } catch {
    return false
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.toLowerCase().trim()
  return isEmailAddress(trimmed) ? trimmed : null
}

export function getInstagramToken(user: IdentitySource | null | undefined): string | null {
  if (!user) return null

  const ctx = readContext(user.ai_context)
  const insta = ctx._instagram && typeof ctx._instagram === "object" ? ctx._instagram : {}
  const contextToken =
    insta.accessToken || insta.pageAccessToken || insta.userAccessToken || null

  if (isValidInstagramToken(user.access_token)) return user.access_token!
  return isValidInstagramToken(contextToken) ? contextToken : null
}

export function resolveIdentity(user: IdentitySource | null | undefined): ResolvedIdentity {
  if (!user) {
    return {
      email: null,
      username: "Account",
      profilePic: null,
      googleProfilePic: null,
      isIgConnected: false,
      igUsername: null,
      businessAccountId: null,
    }
  }

  const ctx = readContext(user.ai_context)
  const insta = ctx._instagram && typeof ctx._instagram === "object" ? ctx._instagram : {}

  const googleEmail =
    normalizeEmail(ctx.google_email) ||
    (isEmailAddress(user.username) ? normalizeEmail(user.username) : null)
  const googleProfilePic =
    readHttpUrl(ctx.google_picture) || readHttpUrl(ctx.google_profile_pic)

  const effectiveToken = getInstagramToken(user)
  const hasInstagramToken = Boolean(effectiveToken)

  const storedHandle = normalizeIdentityName(insta.username)
  const usernameColumn = normalizeIdentityName(user.username)
  const igUsername = hasInstagramToken
    ? (storedHandle || (isInstagramHandle(usernameColumn) ? usernameColumn : null))
    : null

  const businessAccountId = insta.businessAccountId
    ? String(insta.businessAccountId)
    : user.business_account_id
      ? String(user.business_account_id)
      : null

  const isFbToken = Boolean(effectiveToken && effectiveToken.startsWith("EAA"))
  const hasValidIgId = isFbToken
    ? [user.business_account_id, insta.businessAccountId].some(
        (id) => id && String(id).startsWith("1784"),
      )
    : true

  const isExpired = user.token_expires_at
    ? new Date(user.token_expires_at).getTime() < Date.now()
    : false
  const isIgConnected = Boolean(hasInstagramToken && igUsername && hasValidIgId && !isExpired)
  const username = isIgConnected
    ? igUsername!
    : googleEmail || (usernameColumn && !isEmailAddress(usernameColumn) ? usernameColumn : null) || "Account"

  return {
    email: googleEmail,
    username,
    profilePic: isIgConnected ? readHttpUrl(insta.profilePic) || googleProfilePic : googleProfilePic,
    googleProfilePic,
    isIgConnected,
    igUsername: isIgConnected ? igUsername : null,
    businessAccountId,
  }
}
