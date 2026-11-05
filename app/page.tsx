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

    // If this is a Google OAuth callback, let LandingPage handle it
    if (code && (state === "google" || code.startsWith("4/"))) {
      return
    }

    // Verify authenticated state with server before redirecting anywhere
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.userId) {
          if (code) {
            router.replace("/dashboard?code=" + encodeURIComponent(code))
          } else {
            router.replace("/dashboard")
          }
        } else {
          // Strictly clear stale IDs from client storage
          if (typeof window !== "undefined") {
            localStorage.removeItem("ig_user_id")
            localStorage.removeItem("ig_username")
            localStorage.removeItem("ig_profile_pic")
            localStorage.removeItem("login_email")
          }
        }
      })
      .catch(() => {})
  }, [searchParams, router])

  return <LandingPage />
}
