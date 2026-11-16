"use client"

import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FeedbackCard } from "@/components/dashboard/FeedbackCard"

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId?: string | null
  username?: string | null
  igUsername?: string | null
  profilePic?: string | null
  isIgConnected?: boolean
}

export function FeedbackModal({
  open,
  onOpenChange,
  userId,
  username,
  igUsername,
  profilePic,
  isIgConnected,
}: FeedbackModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border border-border bg-card">
        <DialogHeader className="sr-only">
          <DialogTitle>Submit Creator Feedback</DialogTitle>
          <DialogDescription>
            Share your suggestions, feature requests, or report issues directly to the team.
          </DialogDescription>
        </DialogHeader>
        <FeedbackCard
          userId={userId}
          username={username}
          igUsername={igUsername}
          profilePic={profilePic}
          isIgConnected={isIgConnected}
          className="border-0 shadow-none bg-transparent"
          onSuccess={() => {
            setTimeout(() => {
              onOpenChange(false)
            }, 1800)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
