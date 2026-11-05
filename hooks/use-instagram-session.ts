"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import type { LinkedAccount } from "@/lib/types"

export interface InstagramStatus {
    connected: boolean
    instagramUsername: string | null
    businessAccountId: string | null
    expiresAt: string | null
    profilePic: string | null
    isExpired?: boolean
    isValid?: boolean
}

const processedCodes = new Set<string>()

export function useInstagramSession() {
    const [username, setUsername] = useState<string | null>(null)
    const [email, setEmail] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [profilePic, setProfilePic] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState<boolean>(true)

    // Instagram connection states (strictly default to disconnected)
    const [isIgConnected, setIsIgConnected] = useState<boolean>(false)
    const [igUsername, setIgUsername] = useState<string | null>(null)
    const [businessAccountId, setBusinessAccountId] = useState<string | null>(null)
    const [igExpiresAt, setIgExpiresAt] = useState<string | null>(null)
    const [igLoading, setIgLoading] = useState<boolean>(false)

    // Multi-Account Instagram state
    const [accounts, setAccounts] = useState<LinkedAccount[]>([])
    const [isSwitchingAccount, setIsSwitchingAccount] = useState<boolean>(false)

    const searchParams = useSearchParams()
    const router = useRouter()
    const isAuthenticatingRef = useRef(false)

    const fetchAccounts = useCallback(async () => {
        try {
            const res = await fetch("/api/auth/accounts")
            if (res.ok) {
                const data = await res.json()
                if (data?.accounts && Array.isArray(data.accounts)) {
                    setAccounts(data.accounts)
                }
            }
        } catch (e) {
            console.error("Failed to fetch linked accounts:", e)
        }
    }, [])

    const fetchIgStatus = useCallback(async (targetUserId: string) => {
        try {
            setIgLoading(true)
            const res = await fetch(`/api/instagram/status?userId=${encodeURIComponent(targetUserId)}`)
            if (res.ok) {
                const data: InstagramStatus = await res.json()
                const connected = Boolean(data.connected)
                setIsIgConnected(connected)
                if (connected) {
                    const handle = data.instagramUsername || null
                    setIgUsername(handle)
                    setBusinessAccountId(data.businessAccountId || null)
                    setIgExpiresAt(data.expiresAt || null)
                    if (data.profilePic) {
                        setProfilePic(data.profilePic)
                        if (typeof window !== "undefined") localStorage.setItem("ig_profile_pic", data.profilePic)
                    } else {
                        setProfilePic(null)
                        if (typeof window !== "undefined") localStorage.removeItem("ig_profile_pic")
                    }
                    if (handle) {
                        setUsername(handle)
                        if (typeof window !== "undefined") localStorage.setItem("ig_username", handle)
                    }
                } else {
                    setIsIgConnected(false)
                    setIgUsername(null)
                    setBusinessAccountId(null)
                    setIgExpiresAt(null)
                }
            }
        } catch (e) {
            console.error("Failed to fetch Instagram status:", e)
        } finally {
            setIgLoading(false)
        }
    }, [])

    // Primary session loader
    const verifyAndLoadSession = useCallback(async () => {
        if (isAuthenticatingRef.current) return
        isAuthenticatingRef.current = true

        try {
            // Check session with server
            const res = await fetch("/api/auth/session")
            if (res.ok) {
                const data = await res.json()
                if (data?.authenticated && data?.userId) {
                    const sid = String(data.userId)
                    const connected = Boolean(data.isIgConnected)
                    const sname = (connected && data.igUsername) ? data.igUsername : (data.username || "User")
                    const spic = data.profilePic || null
                    const smail = data.email || null

                    // Synchronize local storage to current user
                    if (typeof window !== "undefined") {
                        const cachedId = localStorage.getItem("ig_user_id")
                        if (cachedId && cachedId !== sid) {
                            localStorage.removeItem("ig_user_id")
                            localStorage.removeItem("ig_username")
                            localStorage.removeItem("ig_profile_pic")
                            localStorage.removeItem("login_email")
                        }
                        localStorage.setItem("ig_user_id", sid)
                        localStorage.setItem("ig_username", sname)
                        if (spic) localStorage.setItem("ig_profile_pic", spic)
                        if (smail) localStorage.setItem("login_email", smail)
                    }

                    setUserId(sid)
                    setUsername(sname)
                    setEmail(smail)
                    setProfilePic(spic)
                    setIsIgConnected(connected)
                    setIgUsername(connected ? (data.igUsername || sname) : null)

                    void fetchIgStatus(sid)
                    void fetchAccounts()
                    setIsLoading(false)
                    isAuthenticatingRef.current = false
                    return
                }
            }

            // Strictly unauthenticated: clean state
            if (typeof window !== "undefined") {
                localStorage.removeItem("ig_user_id")
                localStorage.removeItem("ig_username")
                localStorage.removeItem("ig_profile_pic")
                localStorage.removeItem("login_email")
            }
            setUserId(null)
            setUsername(null)
            setEmail(null)
            setProfilePic(null)
            setIsIgConnected(false)
            setIgUsername(null)
            setBusinessAccountId(null)
            setAccounts([])
        } catch (e) {
            console.error("Session verification failed:", e)
        } finally {
            setIsLoading(false)
            isAuthenticatingRef.current = false
        }
    }, [fetchIgStatus])

    useEffect(() => {
        const code = searchParams.get("code")
        const state = searchParams.get("state")

        // Handle Instagram OAuth callback if code is present
        const isGoogleCode = code ? (state === "google" || code.startsWith("4/")) : false

        if (code && !isGoogleCode && !processedCodes.has(code)) {
            processedCodes.add(code)
            fetch("/api/instagram/callback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
            })
                .then((res) => res.json())
                .then((data) => {
                    if (data.success) {
                        localStorage.setItem("ig_user_id", data.userId)
                        localStorage.setItem("ig_username", data.username)
                        if (data.profilePic) localStorage.setItem("ig_profile_pic", data.profilePic)

                        setUserId(String(data.userId))
                        setUsername(data.username)
                        setProfilePic(data.profilePic || null)
                        setIsIgConnected(true)
                        setIgUsername(data.username)
                        setBusinessAccountId(data.businessAccountId || null)
                    }
                })
                .catch((err) => console.error("Instagram login callback error:", err))
                .finally(() => {
                    if (typeof window !== "undefined" && window.location.search.includes("code=")) {
                        window.history.replaceState({}, document.title, window.location.pathname)
                    }
                    setIsLoading(false)
                })
            return
        }

        // Clean code param from URL without trigger-looping router
        if (code && typeof window !== "undefined") {
            window.history.replaceState({}, document.title, window.location.pathname)
        }

        // Validate session with server
        void verifyAndLoadSession()
    }, [searchParams, verifyAndLoadSession])

    const switchAccount = useCallback(
        async (targetUserId: string): Promise<boolean> => {
            const tgt = String(targetUserId)
            if (!tgt || tgt === userId || isSwitchingAccount) return false
            try {
                setIsSwitchingAccount(true)
                const res = await fetch("/api/auth/switch-account", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ targetUserId: tgt }),
                })
                const data = await res.json()
                if (res.ok && data?.success) {
                    const sid = String(data.userId)
                    const sname = data.username || "Account"
                    const spic = data.profilePic || null
                    const connected = Boolean(data.isIgConnected)

                    if (typeof window !== "undefined") {
                        localStorage.setItem("ig_user_id", sid)
                        localStorage.setItem("ig_username", sname)
                        if (spic) localStorage.setItem("ig_profile_pic", spic)
                        else localStorage.removeItem("ig_profile_pic")
                    }

                    setUserId(sid)
                    setUsername(sname)
                    setProfilePic(spic)
                    setIsIgConnected(connected)
                    setIgUsername(connected ? (data.igUsername || sname) : null)
                    setBusinessAccountId(data.businessAccountId || null)

                    await fetchIgStatus(sid)
                    await fetchAccounts()

                    // Trigger router refresh to reload all active page queries
                    router.refresh()
                    return true
                }
                return false
            } catch (e) {
                console.error("Failed to switch account:", e)
                return false
            } finally {
                setIsSwitchingAccount(false)
            }
        },
        [userId, isSwitchingAccount, fetchIgStatus, fetchAccounts, router]
    )

    const refreshIgStatus = useCallback(async () => {
        if (userId) {
            await fetchIgStatus(userId)
        }
    }, [userId, fetchIgStatus])

    const disconnectInstagram = useCallback(async () => {
        if (!userId) return
        try {
            const res = await fetch("/api/instagram/disconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            })
            if (res.ok) {
                if (typeof window !== "undefined") {
                    localStorage.removeItem("ig_username")
                    localStorage.removeItem("ig_profile_pic")
                }
                setIsIgConnected(false)
                setIgUsername(null)
                setProfilePic(null)
                setBusinessAccountId(null)
                setIgExpiresAt(null)
            }
        } catch (e) {
            console.error("Failed to disconnect Instagram:", e)
        }
    }, [userId])

    const logout = async () => {
        try {
            // 1. Invalidate and clear the HTTP-only cookie on the server
            await fetch("/api/auth/logout", { method: "POST" })
        } catch (e) {
            console.error("Logout request failed:", e)
        }

        // 2. Wipe client-side stored session tokens while strictly preserving user's manual theme selection
        if (typeof window !== "undefined") {
            const currentTheme = localStorage.getItem("flash-insta-theme")
            localStorage.clear()
            sessionStorage.clear()
            if (currentTheme) {
                localStorage.setItem("flash-insta-theme", currentTheme)
            }
        }

        // 3. Reset all React state to completely logged out
        setUsername(null)
        setEmail(null)
        setUserId(null)
        setProfilePic(null)
        setIsIgConnected(false)
        setIgUsername(null)
        setBusinessAccountId(null)
        setAccounts([])

        // 4. Force hard page reload to bust all Next.js router cache and force a 100% clean slate
        if (typeof window !== "undefined") {
            window.location.href = "/"
        } else {
            router.push("/")
        }
    }

    return {
        userId,
        username,
        email,
        profilePic,
        isLoading,
        logout,
        isIgConnected,
        igUsername,
        businessAccountId,
        igExpiresAt,
        igLoading,
        refreshIgStatus,
        disconnectInstagram,
        accounts,
        isSwitchingAccount,
        switchAccount,
        fetchAccounts,
    }
}
