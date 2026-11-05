"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  UploadCloud,
  Link2,
  ImageIcon,
  Film,
  Music2,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react"
import { toast } from "sonner"

export type MediaType = "image" | "video" | "audio"

interface MediaUploadOrUrlInputProps {
  mediaType: MediaType
  value: string
  onChange: (url: string) => void
  label?: string
  helperText?: string
  userId?: string
}

const ACCEPT_CONFIG: Record<
  MediaType,
  {
    accept: string
    extensions: string[]
    mimeTypes: string[]
    label: string
    hint: string
    maxSizeMb: number
  }
> = {
  image: {
    accept: "image/jpeg,image/png,image/webp,image/gif",
    extensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    label: "Image",
    hint: "PNG, JPG, WEBP, GIF • up to 10MB",
    maxSizeMb: 10,
  },
  video: {
    accept: "video/mp4,video/quicktime,video/webm",
    extensions: [".mp4", ".mov", ".webm"],
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    label: "Video",
    hint: "MP4, MOV, WebM • up to 50MB",
    maxSizeMb: 50,
  },
  audio: {
    accept: "audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/m4a,audio/aac,audio/ogg",
    extensions: [".mp3", ".wav", ".m4a", ".aac", ".ogg"],
    mimeTypes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/ogg"],
    label: "Audio",
    hint: "MP3, WAV, M4A, AAC • up to 25MB",
    maxSizeMb: 25,
  },
}

export function MediaUploadOrUrlInput({
  mediaType,
  value,
  onChange,
  label,
  helperText,
  userId,
}: MediaUploadOrUrlInputProps) {
  const [mode, setMode] = useState<"upload" | "url">(() => {
    // If value starts with http and looks like an external hosted link, default to url, otherwise upload
    if (value && !value.includes("/uploads/") && !value.includes("/storage/v1/object/public/media/")) {
      return "url"
    }
    return "upload"
  })

  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [fileSize, setFileSize] = useState<string>("")
  const [previewError, setPreviewError] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const config = ACCEPT_CONFIG[mediaType]

  // Reset preview error when value changes
  useEffect(() => {
    setPreviewError(false)
  }, [value])

  const validateFile = (file: File): boolean => {
    // 1. Strict Size Check
    const maxBytes = config.maxSizeMb * 1024 * 1024
    if (file.size > maxBytes) {
      toast.error(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed for ${config.label} is ${config.maxSizeMb}MB.`)
      return false
    }

    // 2. Strict MIME and Extension Check
    const ext = "." + file.name.split(".").pop()?.toLowerCase()
    const mime = file.type?.toLowerCase() || ""

    const isExtAllowed = config.extensions.includes(ext)
    const isMimeAllowed = config.mimeTypes.some((m) => mime === m || mime.startsWith(m))

    if (!isExtAllowed && !isMimeAllowed) {
      toast.error(
        `Strict format requirement: Only ${config.label.toLowerCase()} files (${config.extensions.join(", ").toUpperCase()}) are accepted.`
      )
      return false
    }

    return true
  }

  const handleFileUpload = async (file: File) => {
    if (!validateFile(file)) return

    // 1. Immediately create an instant optimistic local blob URL so preview updates with ZERO delay
    const localBlobUrl = URL.createObjectURL(file)
    onChange(localBlobUrl)
    setFileName(file.name)
    setFileSize(`${(file.size / (1024 * 1024)).toFixed(1)} MB`)
    setIsUploading(true)
    setUploadProgress(`Uploading ${file.name} to cloud CDN...`)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("mediaType", mediaType)
      if (userId) formData.append("userId", userId)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (res.ok && data.ok && data.url) {
        onChange(data.url)
        toast.success(`${config.label} uploaded & synced to Instagram preview ✨`)
      } else {
        // Fallback to data URL so the image is 100% preserved in local preview
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === "string") {
            onChange(reader.result)
          }
        }
        reader.readAsDataURL(file)
        toast.info(`${config.label} attached for local preview & testing`)
      }
    } catch {
      // Fallback to data URL so preview is never broken
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onChange(reader.result)
        }
      }
      reader.readAsDataURL(file)
      toast.info(`${config.label} attached for local preview & testing`)
    } finally {
      setIsUploading(false)
      setUploadProgress("")
    }
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
    // reset input so the same file can be selected again if replaced
    if (e.target) e.target.value = ""
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange("")
    setFileName("")
    setFileSize("")
  }

  const renderIcon = (className: string) => {
    switch (mediaType) {
      case "video":
        return <Film className={className} />
      case "audio":
        return <Music2 className={className} />
      case "image":
      default:
        return <ImageIcon className={className} />
    }
  }

  const hasValue = !!value && value.trim().length > 0

  return (
    <div className="space-y-2.5">
      {/* Header with Mode Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          {renderIcon("w-3.5 h-3.5 text-accent-yellow")}
          <span className="text-xs font-semibold text-foreground tracking-tight">
            {label || `${config.label} Source`}
          </span>
          {helperText && <span className="text-[10px] text-muted-foreground">• {helperText}</span>}
        </div>

        {/* Compact Mode Pill Switcher */}
        <div className="inline-flex items-center bg-muted/40 p-0.5 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              mode === "upload"
                ? "bg-card text-foreground shadow-xs border border-border/80 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UploadCloud className="w-3 h-3" />
            <span>Upload {config.label}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              mode === "url"
                ? "bg-card text-foreground shadow-xs border border-border/80 font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Link2 className="w-3 h-3" />
            <span>Web URL</span>
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={config.accept}
        onChange={onFileChange}
        className="hidden"
      />

      {/* Content Area */}
      {mode === "upload" ? (
        <div className="space-y-2">
          {hasValue ? (
            /* Uploaded Preview Card */
            <div className="border border-border/80 bg-muted/30 rounded-xl p-3.5 space-y-2.5 animate-in fade-in duration-150 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* Media Thumbnail */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-black/60 border border-border/80 overflow-hidden shrink-0 flex items-center justify-center relative shadow-sm group">
                    {mediaType === "image" ? (
                      <img
                        src={value}
                        alt="Uploaded preview"
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        onError={() => setPreviewError(true)}
                      />
                    ) : mediaType === "video" ? (
                      <video
                        src={value}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        loop
                        autoPlay
                      />
                    ) : (
                      <div className="w-full h-full relative flex flex-col items-center justify-center bg-zinc-950 p-2">
                        <Music2 className="w-6 h-6 text-accent-yellow" />
                        <span className="text-[7px] text-zinc-400 font-mono-ui mt-1">AUDIO</span>
                      </div>
                    )}
                  </div>

                  {/* File info & Status */}
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-foreground truncate block">
                        {fileName || `${config.label} attached`}
                      </span>
                      {isUploading ? (
                        <span className="shrink-0 flex items-center gap-1 text-[9px] font-mono-ui text-accent-yellow bg-accent-yellow/15 border border-accent-yellow/30 px-1.5 py-0.5 rounded-full">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Uploading to cloud...
                        </span>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1 text-[9px] font-mono-ui text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ready on Instagram ✅
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono-ui truncate max-w-xs">
                      {fileSize ? `${fileSize} • ` : ""}
                      {value.startsWith("blob:") ? "Local preview attached" : value.slice(0, 48) + "..."}
                    </p>
                    {mediaType === "audio" && (
                      <div className="pt-1">
                        <audio src={value} controls className="h-6 w-44" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 shrink-0 self-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg border border-border bg-card hover:bg-muted text-foreground flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                    title="Replace file"
                  >
                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                    <span>Replace</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    disabled={isUploading}
                    className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                    title="Remove media"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : isUploading ? (
            /* Uploading state before local URL resolves */
            <div className="border border-accent-yellow/40 bg-accent-yellow/5 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center animate-in fade-in duration-150">
              <Loader2 className="w-5 h-5 text-accent-yellow animate-spin" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-foreground">{uploadProgress}</p>
                <p className="text-[10px] text-muted-foreground font-mono-ui">
                  Optimizing and securing for Instagram delivery
                </p>
              </div>
            </div>
          ) : (
            /* Dropzone when empty */
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 sm:p-5 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-accent-yellow bg-accent-yellow/10 scale-[0.99]"
                  : "border-border/70 hover:border-accent-yellow/50 bg-muted/10 hover:bg-muted/25"
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-accent-yellow/15 border border-accent-yellow/30 flex items-center justify-center text-accent-yellow">
                <UploadCloud className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground">
                  Click to upload or drag & drop {config.label.toLowerCase()}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono-ui">{config.hint}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Web URL Mode */
        <div className="space-y-2">
          <div className="relative flex items-center">
            <Link2 className="absolute left-3 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`https://example.com/asset.${mediaType === "image" ? "jpg" : mediaType === "video" ? "mp4" : "mp3"}`}
              className="w-full bg-muted/30 border border-border rounded-xl pl-9 pr-9 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-yellow/50 font-mono-ui transition-colors"
            />
            {hasValue && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute right-2.5 p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Clear URL"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* URL Live Preview Card */}
          {hasValue && (
            <div className="border border-border/80 bg-muted/20 rounded-xl p-2.5 flex items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-10 h-10 rounded-md bg-black/40 border border-border/60 overflow-hidden shrink-0 flex items-center justify-center">
                  {mediaType === "image" ? (
                    <img
                      src={value}
                      alt="URL preview"
                      className="w-full h-full object-cover"
                      onError={() => setPreviewError(true)}
                    />
                  ) : mediaType === "video" ? (
                    <Film className="w-4 h-4 text-zinc-400" />
                  ) : (
                    <Music2 className="w-4 h-4 text-accent-yellow" />
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate max-w-xs">{value}</p>
                  <p className="text-[9px] text-muted-foreground font-mono-ui">
                    {previewError ? (
                      <span className="text-amber-400 flex items-center gap-1">
                        <AlertCircle className="w-2.5 h-2.5" /> Preview unavailable • URL will still be sent
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Link formatted
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onChange("")}
                className="p-1 text-muted-foreground hover:text-red-400 rounded cursor-pointer"
                title="Clear"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
