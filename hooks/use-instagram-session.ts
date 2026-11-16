"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import type { LinkedAccount } from "@/lib/types"

export interface InstagramStatus {
    connected: boolean
    username?: string | null
    email?: string | null
    instagramUsername: string | null
    businessAccountId: string | null
    expiresAt: string | null
    profilePic: string | null
    isExpired?: boolean
    isValid?: boolean
}

const processedCodes = new Set<string>()

// Module-level deduplication and memory caches to prevent thundering herd across mounting components
let inFlightSessionPromise: Promise<{ status: number; ok: boolean; data: any }> | null = null
let sessionMemoryCache: { data: any; timestamp: number } | null = null
let inFlightAccountsPromise: Promise<any> | null = null
let accountsMemoryCache: { accounts: LinkedAccount[]; timestamp: number } | null = null
const SESSION_CACHE_TTL_MS = 15_000 // 15 seconds

export function useInstagramSession() {
    const [userId, setUserId] = useState<string | null>(() => {
        if (typeof window !== "undefined") return localStorage.getItem("ig_user_id") || null
        return null
    })
    const [username, setUsername] = useState<string | null>(() => {
        if (typeof window !== "undefined") return localStorage.getItem("ig_username") || null
        return null
    })
    const [email, setEmail] = useState<string | null>(() => {
        if (typeof window !== "undefined") return localStorage.getItem("login_email") || null
        return null
    })
    const [profilePic, setProfilePic] = useState<string | null>(() => {
        if (typeof window !== "undefined") return localStorage.getItem("ig_profile_pic") || null
        return null
    })
    const [isLoading, setIsLoading] = useState<boolean>(() => {
        if (typeof window !== "undefined") {
            return !localStorage.getItem("ig_user_id") && !localStorage.getItem("flashinsta_session_token")
        }
        return true
    })

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
        const now = Date.now()
        if (accountsMemoryCache && now - accountsMemoryCache.timestamp < SESSION_CACHE_TTL_MS) {
            setAccounts(accountsMemoryCache.accounts)
            return
        }
        try {
            if (!inFlightAccountsPromise) {
                inFlightAccountsPromise = fetch("/api/auth/accounts")
                    .then(async (res) => (res.ok ? await res.json() : null))
                    .finally(() => {
                        setTimeout(() => { inFlightAccountsPromise = null }, 300)
                    })
            }
            const data = await inFlightAccountsPromise
            if (data?.accounts && Array.isArray(data.accounts)) {
                accountsMemoryCache = { accounts: data.accounts, timestamp: Date.now() }
                setAccounts(data.accounts)
            }
        } catch (e) {
            console.error("Failed to fetch linked accounts:", e)
        }
    }, [])

    const fetchIgStatus = useCallback(async (targetUserId: string, options?: { fresh?: boolean }) => {
        try {
            setIgLoading(true)
            const fresh = options?.fresh === true
            const res = await fetch(`/api/instagram/status?userId=${encodeURIComponent(targetUserId)}${fresh ? "&validate=true" : ""}`)
            if (res.ok) {
                const data: InstagramStatus = await res.json()
                const connected = Boolean(data.connected)
                setIsIgConnected(connected)
                if (connected) {
                    const handle = data.instagramUsername || null
                    setIgUsername(handle)
                    setBusinessAccountId(data.businessAccountId || null)
                    setIgExpiresAt(data.expiresAt || null)
                    if (data.username) {
                        setUsername(data.username)
                        if (typeof window !== "undefined") localStorage.setItem("ig_username", data.username)
                    }
                    if (data.profilePic) {
                        setProfilePic(data.profilePic)
                        if (typeof window !== "undefined") localStorage.setItem("ig_profile_pic", data.profilePic)
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
    const verifyAndLoadSession = useCallback(async (options?: { fresh?: boolean }) => {
        if (isAuthenticatingRef.current) return
        isAuthenticatingRef.current = true

        try {
            const now = Date.now()
            // 1. Instant response from module memory cache if available and not fresh
            if (!options?.fresh && sessionMemoryCache && (now - sessionMemoryCache.timestamp < SESSION_CACHE_TTL_MS)) {
                const data = sessionMemoryCache.data
                if (data?.authenticated && data?.userId) {
                    const sid = String(data.userId)
                    const connected = Boolean(data.isIgConnected)
                    const sname = data.username || (connected ? data.igUsername : data.email) || "User"
                    const spic = data.profilePic || null
                    const smail = data.email || null

                    setUserId(sid)
                    setUsername(sname)
                    setEmail(smail)
                    setProfilePic(spic)
                    setIsIgConnected(connected)
                    setIgUsername(connected ? (data.igUsername || sname) : null)
                    setIsLoading(false)
                    isAuthenticatingRef.current = false
                    return
                }
            }

            // 2. Deduplicate network request across simultaneously mounting components
            if (!inFlightSessionPromise || options?.fresh) {
                const token = typeof window !== "undefined" ? localStorage.getItem("flashinsta_session_token") : null
                const headers: HeadersInit = {}
                if (token) {
                    headers["Authorization"] = `Bearer ${token}`
                    headers["x-session-token"] = token
                }

                inFlightSessionPromise = fetch("/api/auth/session", { headers, cache: "no-store" })
                    .then(async (res) => {
                        const json = await res.json().catch(() => null)
                        return { status: res.status, ok: res.ok, data: json }
                    })
                    .finally(() => {
                        setTimeout(() => { inFlightSessionPromise = null }, 300)
                    })
            }

            const result = await inFlightSessionPromise
            if (result.ok && result.data?.authenticated && result.data?.userId) {
                const data = result.data
                sessionMemoryCache = { data, timestamp: Date.now() }

                const sid = String(data.userId)
                const connected = Boolean(data.isIgConnected)
                const sname = data.username || (connected ? data.igUsername : data.email) || "User"
                const spic = data.profilePic || null
                const smail = data.email || null

                // Synchronize local storage to current user
                if (typeof window !== "undefined") {
                    if (data.token) {
                        localStorage.setItem("flashinsta_session_token", data.token)
                    }
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
                    else localStorage.removeItem("ig_profile_pic")
                    if (smail) localStorage.setItem("login_email", smail)
                }

                setUserId(sid)
                setUsername(sname)
                setEmail(smail)
                setProfilePic(spic)
                setIsIgConnected(connected)
                setIgUsername(connected ? (data.igUsername || sname) : null)

                void fetchIgStatus(sid, options)
                void fetchAccounts()
                setIsLoading(false)
                isAuthenticatingRef.current = false
                return
            }

            // Strictly unauthenticated: clean state only if server explicitly returned 401 or authenticated === false
            if (result.status === 401 || (result.ok && result.data?.authenticated === false)) {
                sessionMemoryCache = null
                accountsMemoryCache = null
                if (typeof window !== "undefined") {
                    localStorage.removeItem("flashinsta_session_token")
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
            } else if (result.status === 429 || result.status >= 500) {
                // Rate-limited or transient network error: NEVER wipe out existing session!
                console.warn(`[Session] HTTP ${result.status} notice from server. Preserving active session.`)
                const cachedId = typeof window !== "undefined" ? localStorage.getItem("ig_user_id") : null
                if (cachedId) {
                    setUserId(cachedId)
                    setUsername(typeof window !== "undefined" ? localStorage.getItem("ig_username") : null)
                    setEmail(typeof window !== "undefined" ? localStorage.getItem("login_email") : null)
                    setProfilePic(typeof window !== "undefined" ? localStorage.getItem("ig_profile_pic") : null)
                }
            }
        } catch (e) {
            console.error("Session verification network error:", e)
        } finally {
            setIsLoading(false)
            isAuthenticatingRef.current = false
        }
    }, [fetchIgStatus, fetchAccounts])

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
                        if (data.token) {
                            localStorage.setItem("flashinsta_session_token", data.token)
                        }
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
                await verifyAndLoadSession({ fresh: true })
            }
        } catch (e) {
            console.error("Failed to disconnect Instagram:", e)
        }
    }, [userId, verifyAndLoadSession])

    const logout = async () => {
        try {
            // 1. Invalidate and clear the HTTP-only cookie on the server
            await fetch("/api/auth/logout", {
                method: "POST",
                headers: { "Cache-Control": "no-cache" },
                cache: "no-store",
            })
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

        // 4. Force hard navigation using location.replace to purge bfcache and overwrite history entry
        if (typeof window !== "undefined") {
            window.location.replace("/?auth=login")
        } else {
            router.replace("/?auth=login")
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
