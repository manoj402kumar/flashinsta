"use client"

import React, { useState } from "react"
import {
  Star,
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  Instagram,
  Bug,
  Lightbulb,
  Zap,
  Heart,
  MessageSquareHeart,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface FeedbackCardProps {
  userId?: string | null
  username?: string | null
  igUsername?: string | null
  profilePic?: string | null
  isIgConnected?: boolean
  className?: string
  compact?: boolean
  onSuccess?: () => void
}

const CATEGORIES = [
  { id: "feature_request", label: "Feature Request", icon: Lightbulb, color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { id: "bug", label: "Bug Report", icon: Bug, color: "text-destructive bg-destructive/10 border-destructive/20" },
  { id: "improvement", label: "Improvement", icon: Zap, color: "text-sky-500 bg-sky-500/10 border-sky-500/20" },
  { id: "praise", label: "Praise", icon: Heart, color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
]

const RATING_LABELS: Record<number, string> = {
  1: "Could be better 😕",
  2: "Fair, needs work 🤔",
  3: "Good, does the job 👍",
  4: "Great experience! 🔥",
  5: "Love FlashInsta! 🚀",
}

export function FeedbackCard({
  userId,
  username,
  igUsername,
  profilePic,
  isIgConnected,
  className,
  compact = false,
  onSuccess,
}: FeedbackCardProps) {
  const [rating, setRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [category, setCategory] = useState<string>("improvement")
  const [message, setMessage] = useState<string>("")
  const [customHandle, setCustomHandle] = useState<string>("")
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [submitted, setSubmitted] = useState<boolean>(false)

  const activeIgAccount = igUsername || (isIgConnected && username ? username : null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim().length < 5) {
      toast.error("Please enter at least 5 characters of feedback.")
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        rating,
        category,
        message: message.trim(),
        ig_username: customHandle.trim() || activeIgAccount || undefined,
      }

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit feedback")
      }

      setSubmitted(true)
      toast.success("Feedback sent! Thank you for helping improve FlashInsta.")
      if (onSuccess) onSuccess()
    } catch (err: any) {
      toast.error(err.message || "Failed to submit feedback. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setMessage("")
    setRating(5)
    setCategory("improvement")
    setSubmitted(false)
  }

  if (submitted) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20 p-6 text-center shadow-lg transition-all animate-in fade-in zoom-in-95 duration-200",
          className
        )}
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-3 shadow-sm">
          <CheckCircle2 className="size-6" />
        </div>
        <h4 className="text-sm font-bold text-foreground">Feedback Received!</h4>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
          Your feedback is directly linked to your account and forwarded to our engineering team.
        </p>
        <button
          type="button"
          onClick={resetForm}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          Submit another note
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur-sm transition-all hover:border-border/80",
        className
      )}
    >
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <MessageSquareHeart className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-tight text-foreground flex items-center gap-1.5">
              <span>Creator Feedback</span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-mono-ui font-semibold text-primary">
                PROD
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Help us craft the best Instagram automation experience
            </p>
          </div>
        </div>

        {/* Connected Instagram Account Badge */}
        {activeIgAccount ? (
          <div
            className="flex items-center gap-1.5 rounded-full bg-secondary/80 px-2.5 py-1 border border-border text-[11px] font-semibold text-foreground shadow-xs shrink-0"
            title="Feedback will be posted with this Instagram account"
          >
            <div className="size-4 rounded-full overflow-hidden bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-[1px] shrink-0">
              {profilePic ? (
                <img
                  src={profilePic}
                  alt={activeIgAccount}
                  className="size-full rounded-full object-cover"
                />
              ) : (
                <Instagram className="size-full text-white p-0.5" />
              )}
            </div>
            <span className="truncate max-w-[120px]">
              {activeIgAccount.startsWith("@") ? activeIgAccount : `@${activeIgAccount}`}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground italic font-mono-ui">
            Not connected to IG
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {/* 1. Rating Selector */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
            How is your experience with FlashInsta?
          </label>
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = (hoverRating !== null ? hoverRating : rating) >= star
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 rounded-lg hover:bg-muted transition-transform active:scale-95 cursor-pointer"
                  aria-label={`${star} star rating`}
                >
                  <Star
                    className={cn(
                      "size-5 transition-colors",
                      filled
                        ? "fill-amber-400 text-amber-400 drop-shadow-[0_1px_3px_rgba(251,191,36,0.3)]"
                        : "text-zinc-600 dark:text-zinc-700"
                    )}
                  />
                </button>
              )
            })}
            <span className="text-xs font-semibold text-foreground ml-2 animate-in fade-in duration-150">
              {RATING_LABELS[hoverRating ?? rating]}
            </span>
          </div>
        </div>

        {/* 2. Category Selection Pills */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground block mb-1.5">
            Feedback Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon
              const isSelected = category === cat.id
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer text-left",
                    isSelected
                      ? cn(cat.color, "shadow-xs ring-1 ring-primary/30")
                      : "border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 3. Custom Instagram Handle Input (shown if no account is connected) */}
        {!activeIgAccount && (
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Your Instagram Username (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-2.5 text-xs text-muted-foreground">@</span>
              <input
                type="text"
                placeholder="yourhandle"
                value={customHandle}
                onChange={(e) => setCustomHandle(e.target.value)}
                className="w-full h-8 pl-6 pr-3 text-xs rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        )}

        {/* 4. Feedback Message Textarea */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-muted-foreground">
              Your Feedback
            </label>
            <span className="text-[10px] font-mono-ui text-muted-foreground">
              {message.length}/2000
            </span>
          </div>
          <textarea
            rows={compact ? 2 : 3}
            maxLength={2000}
            placeholder="Tell us what you like, what is confusing, or feature requests you'd love to see..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full rounded-xl border border-input bg-background/90 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-all resize-none shadow-xs"
          />
        </div>

        {/* 5. Submit Button */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-primary" />
            Reviewed by engineering
          </span>

          <button
            type="submit"
            disabled={submitting || message.trim().length < 5}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:brightness-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                <span>Send Feedback</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
