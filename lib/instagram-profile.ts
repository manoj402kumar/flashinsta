// Instagram profile photos are CDN URLs that expire. Meta returns a new URL on
// every Graph API profile read, so the stored URL must be refreshed before it
// turns into a 403. This module refreshes and persists that profile snapshot.

import {
  getInstagramToken,
  instagramProfileNeedsRefresh,
  parseAiContext,
} from "./identity"
import { getSupabaseAdmin } from "./supabase-admin"

const REFRESH_RETRY_MS = 10 * 60 * 1000
const GRAPH_TIMEOUT_MS = 6000

export interface InstagramProfileUser {
  id: string | number
  username?: string | null
  ai_context?: string | null
  access_token?: string | null
  token_expires_at?: string | null
  business_account_id?: string | number | null
  page_id?: string | null
}

export interface InstagramProfileRefresh {
  refreshed: boolean
  aiContext: string
  businessAccountId: string | null
  username: string | null
  name: string | null
  profilePic: string | null
}

interface GraphProfile {
  username: string | null
  name: string | null
  profilePic: string | null
  businessAccountId: string | null
}

const inFlightRefreshes = new Map<string, Promise<InstagramProfileRefresh>>()

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}

function asHttpUrl(value: unknown): string | null {
  const text = asString(value)
  return text && /^https?:\/\//i.test(text) ? text : null
}

function readInstagramContext(context: Record<string, any>): Record<string, any> {
  const insta = context._instagram
  return insta && typeof insta === "object" && !Array.isArray(insta) ? insta : {}
}

function resolveBusinessAccountId(
  user: InstagramProfileUser,
  insta: Record<string, any>,
): string | null {
  return asString(insta.businessAccountId) ||
    (user.business_account_id ? String(user.business_account_id) : null)
}

function describeProfile(user: InstagramProfileUser): InstagramProfileRefresh {
  const insta = readInstagramContext(parseAiContext(user.ai_context))
  return {
    refreshed: false,
    aiContext: typeof user.ai_context === "string" ? user.ai_context : "",
    businessAccountId: resolveBusinessAccountId(user, insta),
    username: asString(insta.username),
    name: asString(insta.name),
    profilePic: asHttpUrl(insta.profilePic),
  }
}

function canFetchFreshProfile(user: InstagramProfileUser): boolean {
  const token = getInstagramToken(user)
  if (!token) return false
  if (!token.startsWith("EAA")) return true
  const insta = readInstagramContext(parseAiContext(user.ai_context))
  return Boolean(resolveBusinessAccountId(user, insta) || asString(user.page_id))
}

async function fetchGraphProfile(url: string, nested: boolean): Promise<GraphProfile | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS) })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data || data.error) return null

    const account = nested ? data.instagram_business_account : data
    if (!account || typeof account !== "object") return null

    const profile: GraphProfile = {
      username: asString(account.username),
      name: asString(account.name),
      profilePic: asHttpUrl(account.profile_picture_url),
      businessAccountId: asString(account.id),
    }
    return profile.username || profile.profilePic ? profile : null
  } catch {
    return null
  }
}

async function fetchFreshProfile(user: InstagramProfileUser): Promise<GraphProfile | null> {
  const token = getInstagramToken(user)
  if (!token) return null

  const insta = readInstagramContext(parseAiContext(user.ai_context))
  const businessAccountId = resolveBusinessAccountId(user, insta)
  const pageId = asString(user.page_id)

  if (token.startsWith("EAA")) {
    const targetId =
      businessAccountId && !businessAccountId.startsWith("1015")
        ? businessAccountId
        : pageId || businessAccountId
    if (!targetId) return null

    // A Facebook Page response nests the Instagram account. Querying a 1784…
    // account directly returns Instagram fields at the top level.
    const nested = !targetId.startsWith("1784")
    const fields = nested
      ? "id,username,name,profile_picture_url,instagram_business_account{id,username,name,profile_picture_url}"
      : "id,username,name,profile_picture_url"
    return fetchGraphProfile(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(targetId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
      nested,
    )
  }

  return fetchGraphProfile(
    `https://graph.instagram.com/v24.0/me?fields=id,username,profile_picture_url&access_token=${encodeURIComponent(token)}`,
    false,
  )
}

async function refreshAndPersist(
  user: InstagramProfileUser,
  base: InstagramProfileRefresh,
): Promise<InstagramProfileRefresh> {
  try {
    if (!canFetchFreshProfile(user)) return base

    const context = parseAiContext(user.ai_context)
    const insta = readInstagramContext(context)
    const profile = await fetchFreshProfile(user)
    const nowIso = new Date().toISOString()

    if (!profile) {
      // Keep the stored snapshot only while it is fresh. Clearing a stale URL
      // lets resolveIdentity fall back to the Google photo instead of serving
      // a URL Meta has already invalidated.
      const nextInsta: Record<string, any> = { ...insta, profilePicRefreshFailedAt: nowIso }
      delete nextInsta.profilePic
      const nextContext = JSON.stringify({ ...context, _instagram: nextInsta })
      try {
        await getSupabaseAdmin()
          .from("users")
          .update({ ai_context: nextContext })
          .eq("id", user.id)
      } catch (error) {
        console.warn("[Instagram Profile] Failed to persist refresh failure:", error)
      }
      return { ...base, aiContext: nextContext, profilePic: null }
    }

    const nextInsta: Record<string, any> = {
      ...insta,
      username: profile.username || insta.username,
      name: profile.name || insta.name,
      profilePic: profile.profilePic || null,
      businessAccountId: profile.businessAccountId || base.businessAccountId,
      profilePicUpdatedAt: nowIso,
    }
    delete nextInsta.profilePicRefreshFailedAt

    const nextContext = JSON.stringify({ ...context, _instagram: nextInsta })
    const businessAccountId = asString(nextInsta.businessAccountId)
    const update: Record<string, any> = { ai_context: nextContext }
    if (businessAccountId) update.business_account_id = businessAccountId

    try {
      const { error } = await getSupabaseAdmin()
        .from("users")
        .update(update)
        .eq("id", user.id)
      if (error) {
        console.warn("[Instagram Profile] Failed to persist refreshed profile:", error.message)
      }
    } catch (error) {
      console.warn("[Instagram Profile] Failed to persist refreshed profile:", error)
    }

    return {
      refreshed: true,
      aiContext: nextContext,
      businessAccountId,
      username: asString(nextInsta.username),
      name: asString(nextInsta.name),
      profilePic: asHttpUrl(nextInsta.profilePic),
    }
  } catch (error) {
    console.warn("[Instagram Profile] Refresh failed:", error)
    return base
  }
}

export async function refreshInstagramProfileIfStale(
  user: InstagramProfileUser,
): Promise<InstagramProfileRefresh> {
  const base = describeProfile(user)
  if (!instagramProfileNeedsRefresh(user)) return base

  const insta = readInstagramContext(parseAiContext(user.ai_context))
  const failedAt =
    typeof insta.profilePicRefreshFailedAt === "string"
      ? Date.parse(insta.profilePicRefreshFailedAt)
      : NaN
  if (Number.isFinite(failedAt) && Date.now() - failedAt < REFRESH_RETRY_MS) return base

  const key = String(user.id)
  const existing = inFlightRefreshes.get(key)
  if (existing) return existing

  const task = refreshAndPersist(user, base).finally(() => {
    inFlightRefreshes.delete(key)
  })
  inFlightRefreshes.set(key, task)
  return task
}
