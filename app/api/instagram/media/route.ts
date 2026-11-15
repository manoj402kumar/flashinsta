import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import { fetchAllPages } from "@/lib/instagram-pagination"
import { safeErrorResponse } from "@/lib/security"

const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp"
const MEDIA_PAGE_SIZE = 100
const MEDIA_FETCH_TIMEOUT_MS = 6000
const STORIES_FETCH_TIMEOUT_MS = 3000

interface MediaResult {
  data: any[]
  storiesCount: number
  mediaComplete: boolean
  storiesComplete: boolean
}

// Server-side in-memory cache (5m fresh TTL, up to 30m stale serve) per user
interface CacheEntry extends MediaResult {
  timestamp: number
}
const mediaMemoryCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes fresh
const STALE_TTL_MS = 30 * 60 * 1000 // 30 minutes stale-while-revalidate

// In-flight request deduplication per user
const inFlightRequests = new Map<string, Promise<MediaResult>>()

function isValidInstagramToken(token: string | null | undefined): boolean {
  if (!token) return false
  if (token === "GOOGLE_AUTH" || token === "TEST_TOKEN_NOT_REAL") return false
  if (token.startsWith("ya29.")) return false
  return token.length > 20
}

async function executeFetch(targetUserId: string, cacheKey: string, forceRefresh = false): Promise<MediaResult> {
  const admin = getSupabaseAdmin()

  // Fetch user access token for this user ONLY
  let { data: user } = await admin
    .from("users")
    .select("access_token, business_account_id, page_id, ai_context")
    .eq("id", targetUserId)
    .maybeSingle()

  let token = user?.access_token
  if (!isValidInstagramToken(token) && user?.ai_context) {
    try {
      const parsed = JSON.parse(user.ai_context)
      const ctxToken =
        parsed._instagram?.accessToken ||
        parsed._instagram?.pageAccessToken ||
        parsed._instagram?.userAccessToken
      if (isValidInstagramToken(ctxToken)) {
        token = ctxToken
      }
    } catch {}
  }

  if (!isValidInstagramToken(token)) {
    return { data: [], storiesCount: 0, mediaComplete: true, storiesComplete: true }
  }

  let businessId = user?.business_account_id ? String(user.business_account_id) : null
  const isFb = token!.startsWith("EAA")

  // If businessId is missing or doesn't look like an IG Business Account ID (typically 17 digits, starts with 1784),
  // dynamically resolve the real Instagram Business Account ID from Page or /me
  if (isFb && (!businessId || !businessId.startsWith("1784"))) {
    let resolvedIgId: string | null = null

    // Try user.ai_context
    if (user?.ai_context) {
      try {
        const parsed = JSON.parse(user.ai_context)
        const ctxBizId = parsed._instagram?.businessAccountId
        if (ctxBizId && String(ctxBizId).startsWith("1784")) {
          resolvedIgId = String(ctxBizId)
        }
      } catch {}
    }

    // Try querying /me for instagram_business_account
    if (!resolvedIgId) {
      try {
        const meRes = await fetch(
          `https://graph.facebook.com/v24.0/me?fields=instagram_business_account{id}&access_token=${encodeURIComponent(token!)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        const meData = await meRes.json().catch(() => null)
        if (meData?.instagram_business_account?.id) {
          resolvedIgId = String(meData.instagram_business_account.id)
        }
      } catch {}
    }

    // Try querying page_id for instagram_business_account
    const targetPageId = user?.page_id || (user?.ai_context ? (() => {
      try { return JSON.parse(user.ai_context)._instagram?.pageId } catch { return null }
    })() : null)

    if (!resolvedIgId && targetPageId) {
      try {
        const pRes = await fetch(
          `https://graph.facebook.com/v24.0/${encodeURIComponent(targetPageId)}?fields=instagram_business_account{id}&access_token=${encodeURIComponent(token!)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        const pData = await pRes.json().catch(() => null)
        if (pData?.instagram_business_account?.id) {
          resolvedIgId = String(pData.instagram_business_account.id)
        }
      } catch {}
    }

    // Try querying /me/accounts to find connected Facebook Pages with Instagram accounts
    if (!resolvedIgId) {
      try {
        const accRes = await fetch(
          `https://graph.facebook.com/v24.0/me/accounts?fields=id,name,instagram_business_account{id}&limit=25&access_token=${encodeURIComponent(token!)}`,
          { signal: AbortSignal.timeout(5000) }
        )
        const accData = await accRes.json().catch(() => null)
        if (accData?.data && Array.isArray(accData.data)) {
          for (const page of accData.data) {
            if (page.instagram_business_account?.id) {
              resolvedIgId = String(page.instagram_business_account.id)
              break
            }
          }
        }
      } catch {}
    }

    if (resolvedIgId) {
      businessId = resolvedIgId
      // Persist the resolved Instagram Business Account ID to the database
      Promise.resolve(
        admin
          .from("users")
          .update({ business_account_id: resolvedIgId })
          .eq("id", targetUserId)
      )
        .then(() => console.log(`[media route] Cached resolved IG Business Account ID ${resolvedIgId} for user ${targetUserId}`))
        .catch(() => {})
    }
  }

  // If this is a Meta Graph API token, an Instagram Business Account ID (starts with 1784) is strictly required.
  if (isFb && (!businessId || !businessId.startsWith("1784"))) {
    return { data: [], storiesCount: 0, mediaComplete: true, storiesComplete: true }
  }

  const mediaUrl = isFb
    ? `https://graph.facebook.com/v24.0/${businessId}/media?fields=${MEDIA_FIELDS}&limit=${MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(token!)}`
    : `https://graph.instagram.com/me/media?fields=${MEDIA_FIELDS}&limit=${MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(token!)}`

  const storiesUrl = isFb
    ? `https://graph.facebook.com/v24.0/${businessId}/stories?fields=${MEDIA_FIELDS}&access_token=${encodeURIComponent(token!)}`
    : `https://graph.instagram.com/me/stories?fields=${MEDIA_FIELDS}&access_token=${encodeURIComponent(token!)}`

  const [mediaPage, storiesPage] = await Promise.all([
    fetchAllPages<any>(mediaUrl, { timeoutMs: MEDIA_FETCH_TIMEOUT_MS }),
    fetchAllPages<any>(storiesUrl, { timeoutMs: STORIES_FETCH_TIMEOUT_MS }),
  ])

  if (mediaPage.error) {
    console.warn(`[media route] Media fetch incomplete after ${mediaPage.pages} page(s):`, mediaPage.error)
  }
  if (storiesPage.error) {
    console.warn(`[media route] Stories fetch incomplete after ${storiesPage.pages} page(s):`, storiesPage.error)
  }

  let mediaItems = mediaPage.items
  let mediaComplete = mediaPage.complete
  const storiesItems = storiesPage.items.map((item: any) => ({
    ...item,
    is_story: true,
    media_type: "STORY",
  }))
  const storiesComplete = storiesPage.complete
  const storiesCount = storiesItems.length

  // If media fetch returned 0 items and user has a configured page access token, retry with their own token
  if (mediaItems.length === 0 && isFb && businessId) {
    try {
      let ownPageToken: string | null = null
      if (user?.ai_context) {
        try {
          const p = JSON.parse(user.ai_context)
          if (p._instagram?.pageAccessToken && p._instagram.pageAccessToken !== token) {
            ownPageToken = p._instagram.pageAccessToken
          }
        } catch {}
      }

      if (ownPageToken) {
        const retryUrl = `https://graph.facebook.com/v24.0/${businessId}/media?fields=${MEDIA_FIELDS}&limit=${MEDIA_PAGE_SIZE}&access_token=${encodeURIComponent(ownPageToken)}`
        const retryPage = await fetchAllPages<any>(retryUrl, { timeoutMs: 5000 })
        if (retryPage.items.length > 0) {
          mediaItems = retryPage.items
          mediaComplete = retryPage.complete
        }
      }
    } catch (fbErr) {
      console.warn("[media route] Error during user page token retry:", fbErr)
    }
  }

  const seenIds = new Set(mediaItems.map((i) => String(i.id)))
  const newStories = storiesItems.filter((i) => !seenIds.has(String(i.id)))
  const data = [...mediaItems, ...newStories]

  // Only cache if we actually found media and media fetch completed (never lock in transient empty/partial responses)
  if (data.length > 0 && mediaComplete) {
    const entry: CacheEntry = { data, storiesCount, mediaComplete, storiesComplete, timestamp: Date.now() }
    mediaMemoryCache.set(cacheKey, entry)
  } else if (forceRefresh) {
    mediaMemoryCache.delete(cacheKey)
  }
  return { data, storiesCount, mediaComplete, storiesComplete }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || !session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const requestedUserId = searchParams.get("userId")

    // Security check: Only allow users to request their own media
    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetUserId = session.userId
    const forceRefresh = searchParams.get("refresh") === "true"
    const cacheKey = targetUserId

    if (forceRefresh) {
      mediaMemoryCache.delete(cacheKey)
    }

    // 1. Stale-While-Revalidate: Return immediately from cache in < 2ms if valid
    if (!forceRefresh) {
      const cached = mediaMemoryCache.get(cacheKey)
      if (cached && cached.data.length > 0) {
        const age = Date.now() - cached.timestamp
        if (age < STALE_TTL_MS) {
          // If beyond fresh TTL (5 mins) and no fetch in-flight, refresh silently in background
          if (age >= CACHE_TTL_MS && !inFlightRequests.has(cacheKey)) {
            const revalidatePromise = executeFetch(targetUserId, cacheKey)
            inFlightRequests.set(cacheKey, revalidatePromise)
            revalidatePromise.finally(() => inFlightRequests.delete(cacheKey)).catch(() => {})
          }
          return NextResponse.json(
            {
              data: cached.data,
              storiesCount: cached.storiesCount,
              mediaComplete: cached.mediaComplete,
              storiesComplete: cached.storiesComplete,
              success: true,
              cached: true,
            },
            {
              headers: {
                "Cache-Control": "private, max-age=120, stale-while-revalidate=1800",
              },
            }
          )
        }
      }
    }

    // 2. Deduplicate concurrent requests
    if (inFlightRequests.has(cacheKey)) {
      const result = await inFlightRequests.get(cacheKey)!
      return NextResponse.json({
        ...result,
        success: true,
      })
    }

    const fetchPromise = executeFetch(targetUserId, cacheKey, forceRefresh)
    inFlightRequests.set(cacheKey, fetchPromise)
    try {
      const result = await fetchPromise
      return NextResponse.json(
        {
          ...result,
          success: true,
        },
        {
          headers: {
            "Cache-Control": "private, max-age=120, stale-while-revalidate=1800",
          },
        }
      )
    } finally {
      inFlightRequests.delete(cacheKey)
    }
  } catch (error) {
    return safeErrorResponse(error, "Failed to load media")
  }
}
