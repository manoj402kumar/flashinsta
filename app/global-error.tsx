"use client"

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Global Error Boundary]", error?.message || "Unhandled error")
  }, [error])

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-background px-4 font-sans">
        <div className="max-w-md w-full text-center space-y-6 p-8 border rounded-xl bg-card shadow-lg">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">System Error</h1>
            <p className="text-sm text-muted-foreground">
              A critical server error occurred. Our team has been notified.
            </p>
          </div>
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </body>
    </html>
  )
}
