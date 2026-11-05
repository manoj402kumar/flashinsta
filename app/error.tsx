"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error internally without exposing details to user
    console.error("[App Error Boundary]", error?.message || "Unhandled error")
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-6 p-8 border rounded-xl bg-card shadow-lg">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl font-bold">
          !
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred while processing your request. Please try again.
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-lg border hover:bg-muted transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  )
}
