/**
 * Production-Grade Structured Logger & Incident Alert Dispatcher
 * Provides structured JSON logging in production, secret masking,
 * and optional asynchronous webhook incident alerting (Slack / Discord).
 */

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "CRITICAL"

export interface LogContext {
  subsystem?: string
  userId?: string | null
  route?: string
  latencyMs?: number
  [key: string]: unknown
}

export interface StructuredLogPayload {
  timestamp: string
  level: LogLevel
  subsystem: string
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
  }
  environment: string
}

// In-memory alert throttling: max 1 notification per unique error signature per 5 minutes
const alertThrottles = new Map<string, number>()
const ALERT_THROTTLE_TTL_MS = 5 * 60 * 1000

// Sensitive key patterns to redact automatically
const SENSITIVE_KEY_REGEX = /(?:access_token|token|secret|password|authorization|apikey|service_role_key)/i

export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 5) return "[MaxDepthReached]"
  if (!data || typeof data !== "object") return data

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1))
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = typeof value === "string" && value.length > 8 ? `${value.slice(0, 4)}...[REDACTED]` : "[REDACTED]"
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeLogData(value, depth + 1)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

async function dispatchExternalAlert(level: LogLevel, message: string, subsystem: string, error?: Error, context?: LogContext): Promise<void> {
  const alertUrl = process.env.INCIDENT_ALERT_WEBHOOK_URL || process.env.ALERT_WEBHOOK_URL
  if (!alertUrl || !alertUrl.startsWith("http")) return

  const alertKey = `${subsystem}:${message}`
  const now = Date.now()
  const lastAlert = alertThrottles.get(alertKey) || 0
  if (now - lastAlert < ALERT_THROTTLE_TTL_MS) return
  alertThrottles.set(alertKey, now)

  try {
    const payload = {
      content: `🚨 **[FlashInsta ${level}]** on \`${subsystem}\`\n**Message:** ${message}\n**Time:** ${new Date().toISOString()}${
        error ? `\n**Error:** ${error.message}` : ""
      }${context?.route ? `\n**Route:** ${context.route}` : ""}`,
    }

    await fetch(alertUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    })
  } catch {
    // Silently fail so alerting never interrupts application flow
  }
}

function writeLog(level: LogLevel, message: string, error?: unknown, context?: LogContext): void {
  const isProd = process.env.NODE_ENV === "production"
  const subsystem = context?.subsystem || "system"

  let errorDetails: StructuredLogPayload["error"] | undefined
  if (error instanceof Error) {
    errorDetails = {
      name: error.name,
      message: error.message,
      stack: isProd ? undefined : error.stack,
    }
  } else if (error) {
    errorDetails = {
      name: "Error",
      message: String(error),
    }
  }

  const payload: StructuredLogPayload = {
    timestamp: new Date().toISOString(),
    level,
    subsystem,
    message,
    context: context ? (sanitizeLogData(context) as Record<string, unknown>) : undefined,
    error: errorDetails,
    environment: process.env.NODE_ENV || "development",
  }

  if (isProd) {
    // Machine-readable JSON for production log aggregators (Axiom, Datadog, Vercel)
    const jsonStr = JSON.stringify(payload)
    if (level === "ERROR" || level === "CRITICAL") {
      console.error(jsonStr)
    } else if (level === "WARN") {
      console.warn(jsonStr)
    } else {
      console.log(jsonStr)
    }
  } else {
    // Clean formatted output for local terminal development
    const prefix = `[${payload.timestamp.slice(11, 19)}] [${level}] [${subsystem}]`
    if (level === "ERROR" || level === "CRITICAL") {
      console.error(`${prefix} ${message}`, error || "", context || "")
    } else if (level === "WARN") {
      console.warn(`${prefix} ${message}`, context || "")
    } else {
      console.log(`${prefix} ${message}`, context || "")
    }
  }

  // Asynchronously dispatch webhook alerts for high-severity failures
  if (level === "CRITICAL" || level === "ERROR") {
    const errObj = error instanceof Error ? error : error ? new Error(String(error)) : undefined
    void dispatchExternalAlert(level, message, subsystem, errObj, context)
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => writeLog("DEBUG", message, undefined, context),
  info: (message: string, context?: LogContext) => writeLog("INFO", message, undefined, context),
  warn: (message: string, context?: LogContext) => writeLog("WARN", message, undefined, context),
  error: (message: string, error?: unknown, context?: LogContext) => writeLog("ERROR", message, error, context),
  critical: (message: string, error?: unknown, context?: LogContext) => writeLog("CRITICAL", message, error, context),
}
