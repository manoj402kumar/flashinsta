import { type NextRequest, NextResponse } from "next/server"
import { logger } from "./logger"

const MAX_PAYLOAD_BYTES = 1024 * 1024 // 1 MB limit

/**
 * Validates request payload size.
 * Returns null if ok, or a 413 NextResponse if payload exceeds max limit.
 */
export function checkPayloadSize(request: NextRequest, maxBytes = MAX_PAYLOAD_BYTES): NextResponse | null {
  const contentLength = request.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    return NextResponse.json(
      { error: "Payload too large. Maximum allowed size is 1MB." },
      { status: 413 }
    )
  }
  return null
}

/**
 * Safe JSON parser that enforces max payload size and handles malformed JSON without leaking errors.
 */
export async function parseSafeJson<T = any>(
  request: NextRequest,
  maxBytes = MAX_PAYLOAD_BYTES
): Promise<{ data: T | null; errorResponse: NextResponse | null }> {
  const sizeError = checkPayloadSize(request, maxBytes)
  if (sizeError) {
    return { data: null, errorResponse: sizeError }
  }

  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, "utf8") > maxBytes) {
      return {
        data: null,
        errorResponse: NextResponse.json(
          { error: "Payload too large. Maximum allowed size is 1MB." },
          { status: 413 }
        ),
      }
    }
    if (!raw.trim()) {
      return { data: {} as T, errorResponse: null }
    }
    const parsed = JSON.parse(raw) as T
    return { data: parsed, errorResponse: null }
  } catch {
    return {
      data: null,
      errorResponse: NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 }),
    }
  }
}

/**
 * Global safe error handler that suppresses raw stack traces and internal DB messages in client responses.
 */
export function safeErrorResponse(
  error: unknown,
  customMessage = "Internal Server Error",
  statusCode = 500
): NextResponse {
  logger.error(customMessage, error, { subsystem: "api", statusCode })
  return NextResponse.json({ error: customMessage }, { status: statusCode })
}
