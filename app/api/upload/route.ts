import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { getSessionFromRequest } from "@/lib/session"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Strict size limits
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_AUDIO_SIZE = 25 * 1024 * 1024 // 25MB

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  audio: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/ogg"],
}

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  video: [".mp4", ".mov", ".webm"],
  audio: [".mp3", ".wav", ".m4a", ".aac", ".ogg"],
}

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req)
    if (!session || !session.userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Please log in to upload files." },
        { status: 401 }
      )
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const requestedType = (formData.get("mediaType") as string) || "image"
    const requestedUserId = (formData.get("userId") as string) || null

    // Multi-tenant authorization check: Never allow uploading under another user's identity
    if (requestedUserId && String(requestedUserId) !== String(session.userId)) {
      return NextResponse.json({ ok: false, error: "Forbidden: user identity mismatch" }, { status: 403 })
    }

    const effectiveUserId = String(session.userId)

    if (!file || typeof file === "string") {
      return NextResponse.json({ ok: false, error: "No file provided for upload" }, { status: 400 })
    }

    const mediaType = ["image", "video", "audio"].includes(requestedType) ? requestedType : "image"
    const allowedMimes = ALLOWED_MIME_TYPES[mediaType]
    const allowedExts = ALLOWED_EXTENSIONS[mediaType]
    const maxSize = mediaType === "video" ? MAX_VIDEO_SIZE : mediaType === "audio" ? MAX_AUDIO_SIZE : MAX_IMAGE_SIZE

    // 1. Validate File Size
    if (file.size > maxSize) {
      const maxMb = Math.round(maxSize / (1024 * 1024))
      return NextResponse.json(
        { ok: false, error: `File exceeds maximum allowed size of ${maxMb}MB for ${mediaType} uploads.` },
        { status: 400 }
      )
    }

    // 2. Validate MIME Type and Extension
    const originalName = file.name || "media"
    const ext = path.extname(originalName).toLowerCase()
    const mime = file.type?.toLowerCase() || ""

    const isMimeValid = allowedMimes.some((m) => mime.startsWith(m) || m === mime)
    const isExtValid = allowedExts.includes(ext)

    if (!isMimeValid && !isExtValid) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid file format for ${mediaType}. Allowed formats: ${allowedExts.join(", ").toUpperCase()}`,
        },
        { status: 400 }
      )
    }

    // 3. Sanitize filename
    const sanitizedBase = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40)
    const safeFileName = `${Date.now()}_${sanitizedBase || "asset"}${ext || (mediaType === "image" ? ".png" : mediaType === "video" ? ".mp4" : ".mp3")}`

    const storagePath = `user_${effectiveUserId}/${safeFileName}`

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 4. Upload to Supabase Storage Bucket ('media')
    const admin = getSupabaseAdmin()
    const { data, error: uploadError } = await admin.storage.from("media").upload(storagePath, buffer, {
      contentType: mime || "application/octet-stream",
      upsert: true,
    })

    if (!uploadError && data) {
      const { data: publicData } = admin.storage.from("media").getPublicUrl(storagePath)
      if (publicData?.publicUrl) {
        return NextResponse.json({
          ok: true,
          url: publicData.publicUrl,
          fileName: originalName,
          fileSize: file.size,
          mediaType,
        })
      }
    }

    if (uploadError) {
      console.warn("[upload] Supabase storage upload warning:", uploadError.message)
      // For small images (< 2MB), fallback to base64 Data URI so user workflows are never blocked
      if (mediaType === "image" && buffer.length < 2 * 1024 * 1024) {
        const base64Url = `data:${mime || "image/jpeg"};base64,${buffer.toString("base64")}`
        return NextResponse.json({
          ok: true,
          url: base64Url,
          fileName: originalName,
          fileSize: file.size,
          mediaType,
        })
      }

      return NextResponse.json(
        { ok: false, error: `Upload failed: ${uploadError.message}` },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { ok: false, error: "Failed to generate public URL for uploaded media." },
      { status: 500 }
    )
  } catch (err: any) {
    console.error("[upload] Unexpected error:", err)
    return NextResponse.json({ ok: false, error: "Internal server error during upload." }, { status: 500 })
  }
}
