"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { LandingPage } from "@/components/layout/landing-page"
import { Loader2 } from "lucide-react"

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if we have an active session or a callback code
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const savedId = typeof window !== "undefined" ? localStorage.getItem("ig_user_id") : null

    // If this is a Google OAuth callback, let LandingPage handle it
    if (code && (state === "google" || code.startsWith("4/"))) {
      return
    }

    if (code) {
      // Instagram OAuth code - forward to dashboard for token exchange
      router.replace("/dashboard?code=" + encodeURIComponent(code))
    } else if (savedId) {
      // Active session - redirect directly to dashboard without code param
      router.replace("/dashboard")
    }
  }, [searchParams, router])

  return <LandingPage />
}
