"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Zap,
  MessageCircle,
  Sparkles,
  ArrowRight,
  Send,
  Bot,
  Inbox,
  Lock,
  Loader2,
  X,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  Instagram,
  BarChart3,
  Clock,
  ExternalLink,
  SlidersHorizontal,
  ChevronRight,
} from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { InstagramAutomationPlayer } from "@/components/video/InstagramAutomationPlayer"

const INSTAGRAM_URL = "https://www.instagram.com/ee.info/"
const CANONICAL_PROD_URL = "https://insta-p8-fawn.vercel.app"

function getEffectiveRedirectUri(configuredUri?: string, defaultPath = ""): string {
  if (typeof window === "undefined") return configuredUri || ""
  if (window.location.hostname.includes("localhost") || window.location.hostname.includes("127.0.0.1")) {
    return configuredUri || `${window.location.origin}${defaultPath}`
  }
  return `${CANONICAL_PROD_URL}${defaultPath}`
}

export function LandingPage() {
  const router = useRouter()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)
  const [existingSession, setExistingSession] = useState<{ userId: string; username: string } | null>(null)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  const userWorkspaceUrl = existingSession
    ? `/dashboard?app=launch&user=${encodeURIComponent(existingSession.username)}&uid=${encodeURIComponent(existingSession.userId)}&auth_source=email&ws=creator`
    : "/dashboard"

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.userId) {
          setExistingSession({ userId: String(data.userId), username: data.username || "User" })
        } else {
          setExistingSession(null)
        }
      })
      .catch(() => {
        setExistingSession(null)
      })
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const authAction = params.get("auth")

    if (authAction === "login" || authAction === "signup") {
      setAuthMode(authAction)
      setShowLoginModal(true)
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    if (code && (state === "google" || code.startsWith("4/"))) {
      setLoginLoading(true)
      setShowLoginModal(true)
      setLoginError("")

      const redirectUri = getEffectiveRedirectUri(process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI, "")

      fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            localStorage.setItem("ig_user_id", data.userId)
            if (data.profilePic) localStorage.setItem("ig_profile_pic", data.profilePic)
            if (data.username) localStorage.setItem("ig_username", data.username)

            window.history.replaceState({}, document.title, window.location.pathname)

            setShowLoginModal(false)
            router.replace("/dashboard")
          } else {
            setLoginError(data.error || "Google login failed")
            setLoginLoading(false)
          }
        })
        .catch((err) => {
          setLoginError(err?.message || "Google login failed")
          setLoginLoading(false)
        })
    }
  }, [router])

  const handleSocialClick = (provider: "google" | "facebook" | "telegram") => {
    if (provider === "google" || provider === "facebook") {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      const redirectUri = getEffectiveRedirectUri(process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI, "")
      if (!clientId) {
        setLoginError("Google sign-in is not configured yet")
        return
      }
      const scope = "openid email profile"
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${encodeURIComponent(
        scope
      )}&state=google&access_type=offline&prompt=consent`

      window.location.href = authUrl
    } else if (provider === "telegram") {
      window.open(INSTAGRAM_URL, "_blank")
    }
  }

  const openAuth = (mode: "login" | "signup") => {
    setAuthMode(mode)
    setLoginError("")
    setShowLoginModal(true)
  }

  const faqs = [
    {
      q: "Does flash-insta work for content creators as well as businesses?",
      a: "Yes, 100%! flash-insta is built for both Instagram Creator accounts and Instagram Business accounts. Whether you are an influencer sharing presets and YouTube links, an educator delivering free guides, or an e-commerce brand driving sales, you get full automation power without any restrictions.",
    },
    {
      q: "Will using flash-insta get my Instagram account banned or flagged?",
      a: "Never. flash-insta operates 100% within Meta's official Instagram Graph API rules and guidelines. We do not use unauthorized scrapers, botting scripts, or unofficial private APIs. Your account is completely safe.",
    },
    {
      q: "Does flash-insta follow official Instagram and Meta policies?",
      a: "Yes, 100%. All interactions flow through the official Meta Instagram Graph API. The system uses authorized webhooks and permanent page tokens with zero spam risk.",
    },
    {
      q: "How does the AI assistant know about my content, products, or policies?",
      a: "You provide your creator bio, brand summary, favorite gear, FAQs, or store catalog directly inside the settings tab. The AI model only answers using your verified context, speaking in your unique conversational tone.",
    },
    {
      q: "Can I pause automations and chat with followers or customers myself?",
      a: "Yes, at any time. The unified live inbox provides real-time visibility over every incoming comment and direct message. You can jump in manually whenever you wish with full automation continuity.",
    },
    {
      q: "Do I need coding or technical setup to get started?",
      a: "None at all. The dashboard is completely point-and-click. Connect your Instagram account, write your trigger rules, and your automated system starts working in under 2 minutes.",
    },
    {
      q: "Is follower and customer information kept private and secure?",
      a: "Yes. In accordance with modern data privacy standards, messages are never used to train public AI models. All access credentials are encrypted, and you can export or wipe your data with one click.",
    },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-amber-400 selection:text-black">
      {/* 1. Precision Navigation Bar */}
      <nav className="sticky top-0 z-40 w-full border-b border-border bg-card/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo.svg"
              alt="flash-insta logo"
              className="size-8 shrink-0 rounded-lg object-contain shadow-xs group-hover:scale-105 transition-transform"
            />
            <span className="font-mono-ui text-sm font-bold tracking-tight text-foreground">flash-insta</span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-xs font-mono-ui text-muted-foreground">
            <a href="#video-demo" className="hover:text-foreground transition-colors">Video Demo</a>
            <a href="#comparison" className="hover:text-foreground transition-colors">Before &amp; After</a>
            <a href="#features" className="hover:text-foreground transition-colors">Capabilities</a>
            <a href="#workflow" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle className="h-7 w-14" />
            {existingSession ? (
              <Link
                href={userWorkspaceUrl}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#ffe14d] text-black px-4 py-2 text-xs font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
              >
                Start Automating Now
                <ArrowRight className="size-3.5" />
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
                  className="hidden sm:inline-block text-xs font-mono-ui font-semibold text-muted-foreground hover:text-foreground px-3 py-2 transition-colors cursor-pointer"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("signup")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#ffe14d] text-black px-4 py-2 text-xs font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
                >
                  Start Automating Now
                  <ArrowRight className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* 2. Hero: High-Converting Outcome-First Headline & Spoken Cadence */}
      <section className="pt-16 pb-12 sm:pt-24 sm:pb-16 px-5 sm:px-8 max-w-5xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1 text-xs font-mono-ui text-muted-foreground shadow-xs">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Meta Verified Partner API</span>
          <span className="text-border">•</span>
          <span className="text-foreground font-semibold">For Creators &amp; Businesses</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-[-0.035em] text-foreground leading-[1.1] max-w-3xl mx-auto">
          Turn your Instagram comments into viral growth and sales.
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Whether you&apos;re a creator dropping free guides, presets, and affiliate links, or a business closing sales 24/7 — deliver instant DMs the second someone comments. Never leave engagement or revenue behind.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {existingSession ? (
            <Link
              href={userWorkspaceUrl}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffe14d] text-black px-7 py-3.5 text-sm font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-[#ffe14d]/20"
            >
              Start Automating Now
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuth("signup")}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffe14d] text-black px-7 py-3.5 text-sm font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-[#ffe14d]/20"
            >
              Start Automating Now
              <ArrowRight className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => openAuth("login")}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-7 py-3.5 text-sm font-mono-ui font-semibold text-foreground hover:bg-secondary transition-colors cursor-pointer"
          >
            Log in
          </button>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-5 text-xs text-muted-foreground font-mono-ui">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" /> Free for creators &amp; brands
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-500" /> 60-second setup
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-500" /> Official Meta Graph API
          </span>
        </div>

        {/* Quantified Impact Strip */}
        <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
          <div className="p-4 rounded-xl border border-border bg-card text-left">
            <div className="text-2xl sm:text-3xl font-extrabold text-foreground font-mono-ui tracking-tight">1.2s</div>
            <div className="text-xs font-semibold text-foreground mt-0.5">Average Reply Speed</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Instant DMs sent in seconds</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-left">
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-500 dark:text-[#ffe14d] font-mono-ui tracking-tight">21x</div>
            <div className="text-xs font-semibold text-foreground mt-0.5">Higher Conversion</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Turn scrollers into fans &amp; buyers</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-left">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-500 font-mono-ui tracking-tight">80%</div>
            <div className="text-xs font-semibold text-foreground mt-0.5">Less Manual Grind</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">No copy-pasting links all night</div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card text-left">
            <div className="text-2xl sm:text-3xl font-extrabold text-sky-500 font-mono-ui tracking-tight">100%</div>
            <div className="text-xs font-semibold text-foreground mt-0.5">Account Safety</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Creator &amp; Business verified</div>
          </div>
        </div>
      </section>

      {/* 3. Programmatic Remotion Animation Video */}
      <section id="video-demo" className="px-5 sm:px-8 pb-16 max-w-5xl mx-auto space-y-5">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono-ui font-semibold bg-amber-500/10 text-amber-500 dark:text-[#ffe14d] border border-amber-500/25">
            <Sparkles className="size-3.5" />
            <span>Remotion Programmatic Video · 100% Code</span>
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Watch how fast an automated DM lands.
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Follower comments &apos;GROW&apos; on your Reel &rarr; instant Meta webhook &rarr; delivered into their DMs in under 2 seconds. Everything animated purely via code.
          </p>
        </div>

        <InstagramAutomationPlayer />
      </section>

      {/* 4. High-Converting Before & After Comparison */}
      <section id="comparison" className="py-20 border-t border-border bg-secondary/15">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <span className="text-xs font-mono-ui font-bold text-amber-500 dark:text-[#ffe14d] uppercase tracking-wider">
              Before &amp; After
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Your Instagram inbox: Before and After
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Stop copy-pasting the same reply 200 times a day. Turn chaotic comments into a predictable revenue engine.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* The Manual Grind */}
            <div className="p-7 rounded-2xl border border-destructive/25 bg-destructive/5 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-destructive font-mono-ui font-bold text-sm">
                <X className="size-4 stroke-[3]" />
                <span>The Manual Grind (The Old Way)</span>
              </div>
              <ul className="space-y-3.5 text-xs sm:text-sm text-foreground/80 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="text-destructive font-bold shrink-0">✕</span>
                  <span>Spending 4 hours manually copy-pasting links in DMs after a Reel blows up.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-destructive font-bold shrink-0">✕</span>
                  <span>Losing eager followers, sponsors, and buyers who reach out while you sleep.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-destructive font-bold shrink-0">✕</span>
                  <span>Typing the same answers about your gear, presets, courses, or shipping over and over.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-destructive font-bold shrink-0">✕</span>
                  <span>Risking temporary account shadowbans by sending manual links too quickly.</span>
                </li>
              </ul>
            </div>

            {/* flash-insta Autopilot */}
            <div className="p-7 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-emerald-500 font-mono-ui font-bold text-sm">
                <CheckCircle2 className="size-4 stroke-[2.5]" />
                <span>flash-insta Autopilot (The Modern Way)</span>
              </div>
              <ul className="space-y-3.5 text-xs sm:text-sm text-foreground leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>Instant DMs sent in under 2 seconds whenever followers comment your trigger keyword.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>Skyrocket Reel reach and algorithmic distribution by multiplying comment activity.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>Smart AI assistant answers fan questions, gear inquiries, and customer FAQs 24/7.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  <span>100% Meta Graph API compliant for both Instagram Creator and Business profiles.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Core Capabilities (Figma Component System) */}
      <section id="features" className="py-20 border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 space-y-12">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Built for high-converting creators, brands &amp; digital sellers
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every capability is engineered directly with Meta&apos;s official Instagram Graph API for rock-solid reliability, speed, and account safety.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Feature 1 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <MessageCircle className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">Reel &amp; Post Comment-to-DM</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Turn comments into instant private link drops. Share YouTube videos, presets, Notion templates, newsletter signups, or product links in 1.2 seconds.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">24/7 AI Creator &amp; Store Assistant</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Trained on your brand, content, gear, pricing, and policies. It answers fans and buyers naturally and accurately without making up false facts.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Inbox className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">Unified Live Inbox</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Track and manage all your conversations across posts, Reels, and direct messages in one screen. Jump into any conversation manually whenever you want.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Zap className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">Keyword &amp; Story Triggers</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Listen for words like &apos;LINK&apos;, &apos;PRESET&apos;, &apos;BUY&apos;, or Story reactions. Send instant resource links and track every click automatically.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <Clock className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">Natural Spoken Rhythm</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Built-in randomized sending pauses and simulated typing indicators ensure automated replies feel warm, courteous, and authentic.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs hover:border-primary/40 transition-colors">
              <div className="size-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <ShieldCheck className="size-4" />
              </div>
              <h3 className="text-base font-bold text-foreground">Creator &amp; Business Verified</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Engineered strictly on official Meta Graph API infrastructure. Works with both Instagram Creator accounts and Business accounts with zero ban risk.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Workflow Step Breakdown */}
      <section id="workflow" className="py-20 max-w-5xl mx-auto px-5 sm:px-8 space-y-12">
        <div className="text-center max-w-xl mx-auto space-y-3">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Get started in 3 simple steps
          </h2>
          <p className="text-sm text-muted-foreground">
            No code required. No complex setups. Launch your first automation in under 2 minutes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs">
            <span className="text-xs font-mono-ui font-bold text-primary">Step 01</span>
            <h4 className="text-sm font-bold text-foreground">Connect with Meta in 1 Click</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign in with Google, authorize your Instagram Creator or Business account securely through official Meta OAuth.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs">
            <span className="text-xs font-mono-ui font-bold text-primary">Step 02</span>
            <h4 className="text-sm font-bold text-foreground">Set Your Keyword &amp; Message</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Choose the keyword your followers will comment (like &apos;LINK&apos; or &apos;DEAL&apos;) and write the automated DM to deliver.
            </p>
          </div>

          <div className="p-6 rounded-2xl border border-border bg-card space-y-3 shadow-xs">
            <span className="text-xs font-mono-ui font-bold text-primary">Step 03</span>
            <h4 className="text-sm font-bold text-foreground">Watch Sales &amp; Leads Flow</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Publish your Reel or post. flash-insta converts comments into link clicks, customers, and revenue 24/7.
            </p>
          </div>
        </div>
      </section>

      {/* 7. FAQ Accordion */}
      <section id="faq" className="py-20 border-t border-border bg-secondary/20">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-muted-foreground">
              Clear answers regarding account security, pricing, and capabilities.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const isOpen = activeFaq === idx
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-card overflow-hidden transition-all shadow-xs"
                >
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between p-4 sm:p-5 text-left text-sm font-semibold text-foreground cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180 text-foreground" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 8. Bottom Action Banner */}
      <section className="py-20 border-t border-border bg-card">
        <div className="mx-auto max-w-4xl px-5 sm:px-8 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Stop losing reach and revenue in your DMs.
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Join modern creators and businesses saving hours every week while converting comments into loyal fans and customers on autopilot.
          </p>
          <div className="pt-2">
            {existingSession ? (
              <Link
                href={userWorkspaceUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ffe14d] text-black px-8 py-3.5 text-sm font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-[#ffe14d]/20"
              >
                Start Automating Now
                <ArrowRight className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("signup")}
                className="inline-flex items-center gap-2 rounded-xl bg-[#ffe14d] text-black px-8 py-3.5 text-sm font-mono-ui font-bold hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-[#ffe14d]/20"
              >
                Start Automating Now
                <ArrowRight className="size-4" />
              </button>
            )}
          </div>
          <p className="text-xs font-mono-ui text-muted-foreground">
            Free trial • 60-second setup • No credit card required
          </p>
        </div>
      </section>

      {/* 8. Modern Minimal Footer */}
      <footer className="border-t border-border bg-background py-10 text-xs text-muted-foreground font-mono-ui">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="flash-insta logo" className="size-5 rounded object-contain" />
            <span className="font-bold text-foreground">flash-insta</span>
            <span>· &copy; {new Date().getFullYear()} All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Support
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            {existingSession ? (
              <Link href={userWorkspaceUrl} className="hover:text-foreground transition-colors">
                Workspace
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("login")}
                className="hover:text-foreground transition-colors cursor-pointer"
              >
                Workspace
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* 9. Sign in / Sign up Modal (Preserves Complete Auth Flow) */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in-0 duration-200">
          <div className="relative w-full max-w-[420px] bg-card text-card-foreground border border-border rounded-2xl p-6 sm:p-8 shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setShowLoginModal(false)
              }}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="size-5" />
            </button>

            <div>
              <div className="mb-6">
                <h3 className="font-mono-ui text-lg font-bold text-card-foreground">
                  {authMode === "signup" ? "Get started free" : "Sign in"}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Continue with your Google account to access the workspace.
                </p>
              </div>

              {loginError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-xs font-mono-ui text-destructive mb-4">
                  {loginError}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleSocialClick("google")}
                  disabled={loginLoading}
                  className="w-full h-13 flex items-center justify-center gap-3 rounded-xl border border-border bg-secondary/50 hover:bg-secondary disabled:opacity-60 transition-all font-mono-ui text-sm font-semibold text-foreground cursor-pointer group shadow-xs"
                  title="Continue with Google"
                >
                  {loginLoading ? (
                    <Loader2 className="size-5 animate-spin text-amber-500 dark:text-[#ffe14d]" />
                  ) : (
                    <svg
                      className="size-5 group-hover:scale-105 transition-transform"
                      viewBox="0 0 24 24"
                    >
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                  )}
                  <span>{loginLoading ? "Connecting with Google..." : "Continue with Google"}</span>
                </button>
              </div>

              <p className="text-center text-xs text-muted-foreground font-mono-ui mt-6">
                {authMode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("login")
                        setLoginError("")
                      }}
                      className="text-amber-500 dark:text-[#ffe14d] hover:underline cursor-pointer font-bold"
                    >
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    Don&apos;t have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("signup")
                        setLoginError("")
                      }}
                      className="text-amber-500 dark:text-[#ffe14d] hover:underline cursor-pointer font-bold"
                    >
                      Start free
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
