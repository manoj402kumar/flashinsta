"use client"

import { useState } from "react"
import Link from "next/link"
import {
    Loader2,
    Instagram,
    Key,
    ShieldCheck,
    RefreshCw,
    Unlink,
    AlertTriangle,
    AlertCircle,
    Users,
    Check,
    Plus,
    Trash2,
    Download,
    ExternalLink,
    Mail,
} from "lucide-react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConnectInstagramModal } from "@/components/dashboard/ConnectInstagramModal"

export default function SettingsPage() {
    const {
        userId,
        email,
        isLoading: sessionLoading,
        isIgConnected,
        igUsername,
        businessAccountId,
        igExpiresAt,
        profilePic,
        refreshIgStatus,
        disconnectInstagram,
        accounts,
        switchAccount,
        isSwitchingAccount,
        fetchAccounts,
    } = useInstagramSession()

    // Instagram connection modal & test states
    const [showConnectModal, setShowConnectModal] = useState(false)
    const [showAddAccountModal, setShowAddAccountModal] = useState(false)
    const [testingToken, setTestingToken] = useState(false)
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
    const [disconnecting, setDisconnecting] = useState(false)
    const [unlinkingId, setUnlinkingId] = useState<string | null>(null)
    const [exportingData, setExportingData] = useState(false)

    const handleUnlinkAccount = async (targetUserId: string, targetUsername: string, isCurrent: boolean) => {
        const cleanName = targetUsername.replace(/^@/, "")
        const mailContext = email ? ` (associated with ${email})` : ""
        const confirmMsg = isCurrent
            ? `Disconnect and remove @${cleanName}?\n\nThis will disconnect @${cleanName} from this email ID${mailContext}. Because this is your currently active view, your session will automatically switch to another linked account.`
            : `Disconnect and remove @${cleanName}?\n\nThis will completely disconnect @${cleanName} from this email ID${mailContext} and our application.`

        if (!window.confirm(confirmMsg)) return

        try {
            setUnlinkingId(targetUserId)
            const res = await fetch("/api/auth/unlink-account", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId }),
            })
            const data = await res.json()
            if (res.ok && data.success) {
                if (data.switchedToUserId || isCurrent) {
                    window.location.reload()
                } else {
                    await fetchAccounts()
                    await refreshIgStatus()
                }
            } else {
                alert(data.error || "Failed to remove account")
            }
        } catch (e) {
            console.error("Failed to unlink account:", e)
            alert("Network error while removing account")
        } finally {
            setUnlinkingId(null)
        }
    }

    const handleExportData = async () => {
        if (exportingData) return
        setExportingData(true)
        try {
            const res = await fetch("/api/privacy/export")
            if (!res.ok) throw new Error("Export failed")
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `workspace-data-${Date.now()}.json`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)
        } catch {
            alert("Failed to export data. Please try again.")
        } finally {
            setExportingData(false)
        }
    }

    const testConnectionLive = async () => {
        if (!userId || testingToken) return
        setTestingToken(true)
        setTestResult(null)

        try {
            const res = await fetch(`/api/instagram/status?userId=${userId}&validate=true`)
            const data = await res.json()
            if (data.connected && data.isValid) {
                setTestResult({
                    ok: true,
                    message: `Connection verified! Token is active for @${data.instagramUsername || "account"} (ID: ${data.businessAccountId || "N/A"}).`,
                })
            } else {
                setTestResult({
                    ok: false,
                    message: data.error || "Instagram token could not be verified by Meta Graph API.",
                })
            }
        } catch (e: any) {
            setTestResult({
                ok: false,
                message: e?.message || "Network error testing connection.",
            })
        } finally {
            setTestingToken(false)
        }
    }

    const handleDisconnect = async () => {
        if (!window.confirm("Are you sure you want to disconnect this Instagram account? All database passkeys will be permanently deleted and running automations will be stopped.")) {
            return
        }
        setDisconnecting(true)
        try {
            await disconnectInstagram()
            setTestResult(null)
            await refreshIgStatus()
            window.location.reload()
        } finally {
            setDisconnecting(false)
        }
    }

    if (sessionLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!userId) {
        return (
            <div className="mx-auto max-w-4xl px-5 py-16 text-center">
                <h2 className="text-xl font-semibold mb-2">No active account found</h2>
                <p className="text-sm text-muted-foreground mb-6">Please log in to manage your workspace preferences.</p>
                <Link href="/" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#ffe14d] text-black font-mono-ui text-sm font-bold px-6 hover:brightness-110 transition-all">
                    Go to Log in
                </Link>
            </div>
        )
    }

    return (
        <div className="mx-auto max-w-4xl px-5 py-7 sm:px-8 lg:px-10 space-y-8">
            <div className="border-b border-border pb-7">
                <p className="text-sm text-muted-foreground">Workspace settings</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-foreground">Settings</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Manage your Instagram connection and linked accounts.
                </p>
            </div>

            {/* Master Login Account Identity Section */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Mail className="size-5" />
                        </div>
                        <div>
                            <span className="text-[10px] font-mono-ui font-semibold uppercase tracking-wider text-muted-foreground block">
                                Master Login Account
                            </span>
                            <h2 className="text-base font-bold font-mono-ui text-foreground truncate">
                                {email || "Primary Account"}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                All Instagram accounts below are connected under this email. Logging out ends access to this master email.
                            </p>
                        </div>
                    </div>

                    {email && (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-secondary/80 border border-border text-xs font-mono-ui font-semibold text-foreground self-start sm:self-auto">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            <span className="truncate max-w-[240px]">{email}</span>
                        </div>
                    )}
                </div>
            </section>

            {/* Instagram Connection Management Card */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
                    <div className="flex items-center gap-3.5">
                        <div className="size-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shrink-0 shadow-sm">
                            <Instagram className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold font-mono-ui text-foreground">
                                Instagram API Integration
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Connect credentials or tokens to operate comments, DMs, and story automations.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isIgConnected ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-ui font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                Connected
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-ui font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                <span className="size-2 rounded-full bg-amber-500" />
                                Disconnected
                            </span>
                        )}
                    </div>
                </div>

                <div className="py-5 space-y-4">
                    {isIgConnected ? (
                        <div className="grid gap-3 sm:grid-cols-2 text-xs font-mono-ui">
                            <div className="p-3.5 rounded-xl bg-background border border-border flex items-center gap-3">
                                {profilePic ? (
                                    <img
                                        src={profilePic}
                                        alt={igUsername || "account"}
                                        referrerPolicy="no-referrer"
                                        crossOrigin="anonymous"
                                        className="size-10 rounded-full object-cover border border-border shrink-0"
                                    />
                                ) : (
                                    <div className="size-10 rounded-full bg-sidebar-primary flex items-center justify-center font-bold text-sm text-sidebar-primary-foreground border border-border shrink-0">
                                        {(igUsername || "I").charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <span className="text-muted-foreground block text-[11px] mb-0.5">Connected Account</span>
                                    <span className="text-sm font-bold text-foreground truncate block">@{igUsername || "instagram_user"}</span>
                                </div>
                            </div>
                            <div className="p-3.5 rounded-xl bg-background border border-border">
                                <span className="text-muted-foreground block text-[11px] mb-1">Business Account ID</span>
                                <span className="text-sm font-bold text-foreground">{businessAccountId || "Auto-detected"}</span>
                            </div>
                            {igExpiresAt && (
                                <div className="sm:col-span-2 p-3.5 rounded-xl bg-background border border-border flex items-center justify-between">
                                <div>
                                    <span className="text-muted-foreground block text-[11px] mb-1">Token Status</span>
                                    <span className="text-foreground">Valid until {new Date(igExpiresAt).toLocaleDateString()}</span>
                                </div>
                                <span className="text-emerald-400 font-semibold text-[11px]">Active</span>
                            </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs font-mono-ui text-neutral-400 flex items-start gap-3">
                            <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-foreground font-semibold">No Instagram account linked to this workspace</p>
                                <p className="text-muted-foreground mt-1 leading-relaxed">
                                    To let the backend reply to your comments and DMs, you need to connect your Instagram account or enter your User Access Token.
                                </p>
                            </div>
                        </div>
                    )}

                    {testResult && (
                        <div
                            className={`p-3.5 rounded-xl text-xs font-mono-ui flex items-start gap-2.5 ${
                                testResult.ok
                                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                            }`}
                        >
                            {testResult.ok ? (
                                <ShieldCheck className="size-4 shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                            )}
                            <div className="leading-relaxed">{testResult.message}</div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowConnectModal(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#ffe14d] text-black font-mono-ui text-xs font-bold px-4 py-2.5 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
                        >
                            <Key className="size-3.5" />
                            {isIgConnected ? "Update API Token / Credentials" : "Connect Instagram"}
                        </button>

                        {isIgConnected && (
                            <>
                                <button
                                    type="button"
                                    onClick={testConnectionLive}
                                    disabled={testingToken}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border hover:bg-secondary text-xs font-mono-ui font-semibold px-4 py-2.5 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {testingToken ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <RefreshCw className="size-3.5" />
                                    )}
                                    Test API Connection
                                </button>

                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    disabled={disconnecting}
                                    className="inline-flex items-center gap-1.5 rounded-xl text-xs font-mono-ui text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent px-3 py-2.5 transition-colors cursor-pointer ml-auto disabled:opacity-50"
                                >
                                    {disconnecting ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <Unlink className="size-3.5" />
                                    )}
                                    Disconnect Account
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </section>

            {/* Multi-Account Management Section */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
                    <div className="flex items-center gap-3.5">
                        <div className="size-10 rounded-xl bg-sidebar-accent border border-sidebar-border flex items-center justify-center text-foreground shrink-0 shadow-sm">
                            <Users className="size-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold font-mono-ui text-foreground">
                                Linked Instagram Accounts
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Switch between your connected Instagram accounts or remove any linked account from the list.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAddAccountModal(true)}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#ffe14d] text-black font-mono-ui text-xs font-bold px-4 py-2 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-sm self-start sm:self-auto"
                    >
                        <Plus className="size-3.5" />
                        Add Instagram Account
                    </button>
                </div>

                <div className="py-4 space-y-3">
                    {accounts && accounts.length > 0 ? (
                        accounts.map((acc) => {
                            const isCurrent = acc.isActive
                            const canRemove = !isCurrent || accounts.length > 1

                            return (
                                <div
                                    key={acc.userId}
                                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                                        isCurrent
                                            ? "bg-secondary/70 border-primary/30"
                                            : "bg-background border-border hover:border-border/80"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground border border-sidebar-border">
                                            {acc.profilePic ? (
                                                <img
                                                    src={acc.profilePic}
                                                    alt={acc.username}
                                                    referrerPolicy="no-referrer"
                                                    crossOrigin="anonymous"
                                                    className="size-full object-cover"
                                                />
                                            ) : (
                                                (acc.username || "A").charAt(0).toUpperCase()
                                            )}
                                            {acc.isIgConnected && (
                                                <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold font-mono-ui text-foreground truncate">
                                                    @{acc.username.replace(/^@/, "")}
                                                </span>
                                                {isCurrent && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono-ui font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                        <Check className="size-3" />
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {acc.isIgConnected ? "Instagram Connected" : "Workspace Profile"}
                                                {acc.businessAccountId ? ` · ID: ${acc.businessAccountId}` : ""}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {!isCurrent && (
                                            <button
                                                type="button"
                                                disabled={isSwitchingAccount}
                                                onClick={() => void switchAccount(acc.userId)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-secondary text-xs font-mono-ui font-semibold transition-colors cursor-pointer disabled:opacity-50"
                                            >
                                                {isSwitchingAccount ? (
                                                    <Loader2 className="size-3 animate-spin" />
                                                ) : null}
                                                Switch
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            disabled={unlinkingId === acc.userId || !canRemove}
                                            onClick={() => void handleUnlinkAccount(acc.userId, acc.username, isCurrent)}
                                            title={
                                                !canRemove
                                                    ? "Cannot remove the only account (use Disconnect Account above)"
                                                    : `Remove @${acc.username.replace(/^@/, "")} from switcher`
                                            }
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono-ui text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                        >
                                            {unlinkingId === acc.userId ? (
                                                <Loader2 className="size-3.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="size-3.5" />
                                            )}
                                            <span>Remove</span>
                                        </button>
                                    </div>
                                </div>
                            )
                        })
                    ) : (
                        <div className="text-xs text-muted-foreground py-2 font-mono-ui">
                            No additional accounts linked. Click &quot;Add Instagram Account&quot; to link your secondary accounts.
                        </div>
                    )}
                </div>
            </section>

            {/* Workspace Data & Privacy Section */}
            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-base font-bold font-mono-ui text-foreground">
                            Data & Privacy
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Download your workspace data or view our compliance policies.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            href="/privacy"
                            target="_blank"
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:bg-secondary text-xs font-mono-ui font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Privacy Policy
                            <ExternalLink className="size-3" />
                        </Link>

                        <button
                            type="button"
                            onClick={handleExportData}
                            disabled={exportingData}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border hover:bg-secondary text-xs font-mono-ui font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                            {exportingData ? (
                                <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                                <Download className="size-3.5" />
                            )}
                            Export Workspace Data
                        </button>
                    </div>
                </div>
            </section>

            {/* Connect Instagram Modal */}
            <ConnectInstagramModal
                open={showConnectModal}
                onOpenChange={setShowConnectModal}
                userId={userId}
                onConnected={() => {
                    void refreshIgStatus()
                    void fetchAccounts()
                }}
            />

            {/* Add Additional Instagram Account Modal */}
            <ConnectInstagramModal
                open={showAddAccountModal}
                onOpenChange={setShowAddAccountModal}
                userId={userId}
                asNewAccount={true}
                onConnected={() => {
                    void fetchAccounts()
                    void refreshIgStatus()
                }}
            />
        </div>
    )
}
