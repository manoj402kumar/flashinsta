import { NextResponse, type NextRequest } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { verifySessionTokenEdge } from "@/lib/edge-session"

const ALLOWED_ORIGINS = new Set([
  "https://insta-p8-fawn.vercel.app",
  "https://insta-p8-eeinfoinstaauto.vercel.app",
])

if (process.env.NEXT_PUBLIC_APP_URL) {
  try {
    ALLOWED_ORIGINS.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin)
  } catch {}
}

const MAX_PAYLOAD_BYTES = 1024 * 1024 // 1 MB

export async function middleware(request: NextRequest) {
  const origin = request.headers.get("origin")
  const path = request.nextUrl.pathname

  // 0. Strictly Protect /dashboard routes: Unauthenticated users are redirected to login immediately
  if (path === "/dashboard" || path.startsWith("/dashboard/")) {
    const sessionCookie =
      request.cookies.get("__Host-insta_session")?.value ||
      request.cookies.get("insta_session")?.value

    if (!sessionCookie || !sessionCookie.includes(".")) {
      const loginUrl = new URL("/", request.url)
      loginUrl.searchParams.set("auth", "login")
      return NextResponse.redirect(loginUrl)
    }

    // Cryptographically verify HMAC signature and session validity (prevents forgery)
    const data = await verifySessionTokenEdge(sessionCookie)
    if (!data || !data.userId) {
      const loginUrl = new URL("/", request.url)
      loginUrl.searchParams.set("auth", "login")
      return NextResponse.redirect(loginUrl)
    }

    try {
      // Ensure every user has a completely unique URL reflecting their email/account
      // Similar to Google Gemini (e.g. ?app=launch&user=...&uid=...&auth_source=email&ws=creator)
      const currentUrl = request.nextUrl
      const currentUid = currentUrl.searchParams.get("uid")
      const currentUser = currentUrl.searchParams.get("user")
      const expectedUser = data.username || "creator"
      const expectedUid = String(data.userId)

      if (currentUid !== expectedUid || currentUser !== expectedUser) {
        const uniqueUrl = new URL(request.url)
        uniqueUrl.searchParams.set("app", "launch")
        uniqueUrl.searchParams.set("user", expectedUser)
        uniqueUrl.searchParams.set("uid", expectedUid)
        uniqueUrl.searchParams.set("auth_source", "email")
        uniqueUrl.searchParams.set("ws", "creator")
        return NextResponse.redirect(uniqueUrl)
      }
    } catch {
      const loginUrl = new URL("/", request.url)
      loginUrl.searchParams.set("auth", "login")
      return NextResponse.redirect(loginUrl)
    }
  }

  // 1. Check Payload Size for Mutations (exempt /api/upload which enforces its own granular streaming limits up to 50MB)
  if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
    if (!path.startsWith("/api/upload")) {
      const contentLength = request.headers.get("content-length")
      if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
        return NextResponse.json(
          { error: "Payload too large. Maximum allowed is 1MB." },
          { status: 413 }
        )
      }
    }
  }

  // 2. Strict Rate Limiting on Authentication & Sensitive Endpoints
  if (path.startsWith("/api/auth") || path.startsWith("/api/instagram/test-login")) {
    const rate = checkRateLimit(request, { limit: 20, windowMs: 60 * 1000, identifierPrefix: "auth" })
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many authentication attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.reset), "X-RateLimit-Remaining": "0" },
        }
      )
    }
  } else if (path.startsWith("/api/inbox/send") || path.startsWith("/api/instagram/send-message")) {
    const rate = checkRateLimit(request, { limit: 60, windowMs: 60 * 1000, identifierPrefix: "dm" })
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please slow down." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.reset), "X-RateLimit-Remaining": "0" },
        }
      )
    }
  }

  // 3. Strict CORS Validation
  let isAllowedOrigin = false
  if (origin) {
    if (ALLOWED_ORIGINS.has(origin)) {
      isAllowedOrigin = true
    } else if (process.env.NODE_ENV !== "production" && origin.includes("localhost")) {
      isAllowedOrigin = true
    }
  }

  // Handle Preflight Requests
  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin) {
      return new NextResponse(null, { status: 403 })
    }
    const headers = new Headers()
    if (origin && isAllowedOrigin) {
      headers.set("Access-Control-Allow-Origin", origin)
      headers.set("Access-Control-Allow-Credentials", "true")
    }
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
    headers.set("Access-Control-Max-Age", "86400")
    return new NextResponse(null, { status: 204, headers })
  }

  const response = NextResponse.next()

  if (origin && isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Credentials", "true")
  }

  return response
}

export const config = {
  matcher: ["/api/:path*", "/dashboard", "/dashboard/:path*"],
}
