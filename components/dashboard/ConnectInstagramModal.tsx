"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Instagram,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowRight,
  Sparkles,
  Info,
} from "lucide-react"

interface ConnectInstagramModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string | null
  onConnected?: () => void
  asNewAccount?: boolean
}

const REQUIRED_PERMISSIONS = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
]

export function ConnectInstagramModal({
  open,
  onOpenChange,
  userId,
  onConnected,
  asNewAccount = false,
}: ConnectInstagramModalProps) {
  const [activeTab, setActiveTab] = useState<"connect" | "guide">("connect")
  const [accessToken, setAccessToken] = useState("")
  const [businessAccountId, setBusinessAccountId] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [copiedPermissions, setCopiedPermissions] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleCopyPermissions = () => {
    navigator.clipboard.writeText(REQUIRED_PERMISSIONS.join(", "))
    setCopiedPermissions(true)
    setTimeout(() => setCopiedPermissions(false), 2000)
  }

  const handleManualConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) {
      setError("Please log in first to connect an Instagram account.")
      return
    }

    if (!accessToken.trim()) {
      setError("Please enter your Instagram Access Token.")
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const res = await fetch("/api/instagram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          accessToken: accessToken.trim(),
          businessAccountId: businessAccountId.trim() || undefined,
          asNewAccount: Boolean(asNewAccount),
        }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || "Failed to verify and connect Instagram credentials.")
      } else {
        if (data.instagramUsername && typeof window !== "undefined") {
          localStorage.setItem("ig_username", data.instagramUsername)
        }
        if (data.profilePic && typeof window !== "undefined") {
          localStorage.setItem("ig_profile_pic", data.profilePic)
        }
        setSuccessMsg(data.message || "Instagram account connected successfully!")
        setTimeout(() => {
          onConnected?.()
          onOpenChange(false)
          setSuccessMsg(null)
          setAccessToken("")
          setBusinessAccountId("")
          window.location.reload()
        }, 1200)
      }
    } catch (err: any) {
      setError(err?.message || "Network error. Please verify your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col bg-card border-border text-card-foreground p-0 overflow-hidden shadow-2xl rounded-2xl">
        {/* Header */}
        <div className="p-5 border-b border-border bg-secondary/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] flex items-center justify-center text-white shadow-md shrink-0">
              <Instagram className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold font-mono-ui text-foreground">
                {asNewAccount ? "Add Instagram Account" : "Connect Instagram Account"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {asNewAccount
                  ? "Connect an additional Instagram account to switch between accounts with one click."
                  : "Automate your Instagram DMs, comments, and story replies with your Meta API credentials."}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {activeTab === "connect" ? (
            <>
              {/* Quick banner linking to guide */}
              <div className="p-3.5 rounded-xl bg-secondary/50 border border-border flex items-center justify-between gap-3 text-xs font-mono-ui">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="size-4 text-amber-500 dark:text-[#ffe14d] shrink-0" />
                  <span>Don&apos;t have an Instagram Access Token yet?</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("guide")}
                  className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-[#ffe14d] hover:underline cursor-pointer shrink-0 text-xs"
                >
                  View Step-by-Step Guide <ArrowRight className="size-3" />
                </button>
              </div>

              {error && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs font-mono-ui text-destructive">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">{error}</div>
                  </div>

                  {error.toLowerCase().includes("expired") && (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono-ui text-amber-700 dark:text-amber-300">
                      <div className="font-bold flex items-center justify-between mb-1.5 text-foreground">
                        <span>💡 How to get a Never-Expiring Token:</span>
                        <a
                          href="https://developers.facebook.com/tools/explorer/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-amber-600 dark:text-[#ffe14d] hover:underline inline-flex items-center gap-1 font-semibold text-[11px]"
                        >
                          Open Explorer <ExternalLink className="size-3" />
                        </a>
                      </div>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-[11px]">
                        <li>Open <strong>Meta Graph API Explorer</strong>.</li>
                        <li>Under <strong>User or Page</strong>, select your <strong>Facebook Page</strong> (not User Token).</li>
                        <li>Click <strong>Generate Access Token</strong>. Page Tokens never expire!</li>
                        <li>Paste the new token below and click Verify.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}

              {successMsg && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono-ui text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <form onSubmit={handleManualConnect} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-mono-ui text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Key className="size-3.5 text-amber-500 dark:text-[#ffe14d]" />
                      Instagram Access Token (Page or User Token)
                      <span className="text-destructive">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="text-[11px] font-mono-ui text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {showToken ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                      {showToken ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div className="relative">
                    <textarea
                      rows={3}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="EAA..."
                      required
                      className="w-full bg-background border border-input rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 dark:focus:border-[#ffe14d] font-mono-ui resize-none transition-all shadow-xs"
                      style={{
                        fontFamily: showToken ? "JetBrains Mono, monospace" : "password",
                        ["WebkitTextSecurity" as any]: showToken ? "none" : "disc",
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono-ui mt-1.5">
                    Long-lived Page Token or User Token from Meta Developer Portal / Graph API Explorer.
                  </p>
                </div>

                <div>
                  <label className="block font-mono-ui text-xs font-semibold text-foreground mb-2">
                    Instagram Account ID or Facebook Page ID{" "}
                    <span className="text-muted-foreground font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={businessAccountId}
                    onChange={(e) => setBusinessAccountId(e.target.value)}
                    placeholder="e.g. 17841400000000000 or 101500000000000"
                    className="w-full bg-background border border-input rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 dark:focus:border-[#ffe14d] font-mono-ui transition-all shadow-xs"
                  />
                  <p className="text-[11px] text-muted-foreground font-mono-ui mt-1">
                    Leave blank to automatically discover your connected Page & Instagram account.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#ffe14d] text-black font-mono-ui text-xs font-bold py-3.5 rounded-xl hover:brightness-105 active:scale-[0.99] disabled:opacity-50 transition-all cursor-pointer shadow-md shadow-[#ffe14d]/10"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Verifying with Instagram Graph API...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="size-4" />
                        Verify & Connect Account
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Guide Tab */
            <div className="space-y-4 font-mono-ui text-xs">
              <div className="flex items-center justify-between pb-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("connect")}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-semibold cursor-pointer transition-colors"
                >
                  <ArrowRight className="size-3.5 rotate-180" />
                  Back to Connect
                </button>
              </div>

              {/* Meta Explorer Direct Link Card */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    <Sparkles className="size-4 text-amber-500 dark:text-[#ffe14d]" />
                    Meta Graph API Explorer
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Generate your token in 3 quick steps using Meta&apos;s official tool.
                  </p>
                </div>
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 bg-[#ffe14d] text-black font-bold text-xs px-3.5 py-2 rounded-lg hover:brightness-105 transition-all shadow-xs shrink-0"
                >
                  Open Graph API Explorer <ExternalLink className="size-3.5" />
                </a>
              </div>

              {/* Step 1 */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-[#ffe14d] flex items-center justify-center text-[11px] font-mono-ui">
                    1
                  </span>
                  Switch Instagram to Professional & Link Facebook Page
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed pl-7">
                  In your Instagram app: Open <strong className="text-foreground">Settings</strong> → <strong className="text-foreground">Account type and tools</strong> → Switch to <strong className="text-foreground">Creator or Business</strong>. Then link your Instagram account to a <strong className="text-foreground">Facebook Page</strong> that you manage.
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-[#ffe14d] flex items-center justify-center text-[11px] font-mono-ui">
                    2
                  </span>
                  Open Meta Graph API Explorer
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed pl-7">
                  Go to{" "}
                  <a
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-600 dark:text-[#ffe14d] hover:underline font-semibold"
                  >
                    Meta Graph API Explorer
                  </a>
                  . Under <strong className="text-foreground">Meta App</strong>, select your App (or create a Business App on Meta Developers if you don&apos;t have one).
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                    <span className="size-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-[#ffe14d] flex items-center justify-center text-[11px] font-mono-ui">
                      3
                    </span>
                    Select Page & Add Permissions
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPermissions}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-[#ffe14d] hover:underline cursor-pointer"
                  >
                    {copiedPermissions ? (
                      <>
                        <Check className="size-3 text-emerald-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        Copy permissions
                      </>
                    )}
                  </button>
                </div>
                <div className="pl-7 space-y-2">
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Under <strong className="text-foreground">User or Page</strong>, select your <strong className="text-foreground">Facebook Page</strong> (recommended: generates a permanent token that never expires).
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    In the <strong className="text-foreground">Add a Permission</strong> dropdown, search and add these permissions:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {REQUIRED_PERMISSIONS.map((perm) => (
                      <span
                        key={perm}
                        className="bg-background border border-border text-foreground px-2 py-0.5 rounded-md text-[11px] font-mono"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-2">
                <div className="flex items-center gap-2 font-bold text-foreground text-xs">
                  <span className="size-5 rounded-full bg-amber-500/20 text-amber-700 dark:text-[#ffe14d] flex items-center justify-center text-[11px] font-mono-ui">
                    4
                  </span>
                  Generate Token & Connect
                </div>
                <div className="pl-7 space-y-3">
                  <p className="text-muted-foreground text-[11px] leading-relaxed">
                    Click the blue <strong className="text-foreground">Generate Access Token</strong> button. Authorize your Facebook account when prompted. Then copy the token starting with <code className="bg-background border border-border px-1.5 py-0.5 rounded text-foreground font-mono">EAA...</code>.
                  </p>

                  <button
                    type="button"
                    onClick={() => setActiveTab("connect")}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-[#ffe14d] text-black font-bold text-xs px-4 py-2.5 rounded-xl hover:brightness-105 transition-all shadow-xs cursor-pointer"
                  >
                    Got my Token, Connect Now <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Pro-Tip Box */}
              <div className="p-3.5 rounded-xl bg-secondary/60 border border-border flex items-start gap-2.5 text-[11px] text-muted-foreground leading-relaxed">
                <Info className="size-4 text-amber-500 dark:text-[#ffe14d] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Pro-Tip for Never-Expiring Tokens:</strong> Selecting your <span className="text-foreground font-semibold">Facebook Page</span> instead of User Token generates a Page Access Token that does not expire, ensuring your automated replies run 24/7 uninterrupted.
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

