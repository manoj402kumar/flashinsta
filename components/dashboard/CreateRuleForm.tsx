"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import {
  Plus, Trash2, Film, Check, MessageCircle, Send, AtSign, Heart,
  MessageSquare, Image as ImageIcon, Timer, Eye, Megaphone, Lock,
  Link2, Zap, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, X, Loader2,
  ArrowLeft, Phone, Video, Info, Sparkles, Smile, Camera, Mic, Image as PicIcon,
  Globe, CheckCircle2, Sliders, CheckCheck, Pencil,
  MoreHorizontal, Bookmark, Home, Search, PlusSquare, Music2, VolumeX, Play, RotateCcw, Smartphone
} from "lucide-react"
import { TagInput } from "@/components/ui/tag-input"
import { MediaUploadOrUrlInput } from "@/components/dashboard/MediaUploadOrUrlInput"
import { getAutomationMediaIds } from "@/lib/automation-media"
import { formatIdentityHandle } from "@/lib/identity"
import type { ProButton, QuickReplyOption, Automation } from "@/lib/types"
import { toast } from "sonner"

/* ============================================================
   AESTHETIC & MODERN 3-STEP WIZARD FOR INSTAGRAM AUTOMATION RULES
   Step 1: TRIGGER  — Left: Channels & Reel Picker | Right: Keywords & Continuation
   Step 2: RESPONSE — Left: DM / Reply Editor      | Right: Iconic Live Phone Preview
   Step 3: REVIEW   — Left: Settings & Delay       | Right: Logic Summary & Publish
   ============================================================ */

interface CreateRuleFormProps {
  userId: string
  triggerSource: "comment" | "dm" | "story"
  onSuccess: () => void
  editRule?: Automation | null
  creatorUsername?: string
  creatorProfilePic?: string | null
  isIgConnected?: boolean
}

type MediaTargetMode = "none" | "all" | "specific"

const DEFAULT_KEYWORD_SUGGESTIONS = ["price", "link", "send"]
const DEFAULT_PUBLIC_SUGGESTIONS = [
  "Sent you a DM! 📬",
  "Check your inbox! ✨",
  "Just messaged you! 💌",
]

const RANDOM_SIM_USERS = [
  { username: "sarah_k", initial: "S", gradient: "from-purple-500 to-indigo-500", time: "Just now" },
  { username: "marcus_dev", initial: "M", gradient: "from-blue-500 to-cyan-500", time: "1m" },
  { username: "elena_visuals", initial: "E", gradient: "from-pink-500 to-rose-500", time: "2m" },
  { username: "jordan.design", initial: "J", gradient: "from-amber-500 to-orange-500", time: "3m" },
  { username: "chloe_creative", initial: "C", gradient: "from-emerald-500 to-teal-500", time: "4m" },
  { username: "alex_builder", initial: "A", gradient: "from-violet-500 to-purple-600", time: "5m" },
  { username: "nina_growth", initial: "N", gradient: "from-red-500 to-pink-600", time: "6m" },
  { username: "david_marketing", initial: "D", gradient: "from-teal-500 to-emerald-600", time: "8m" },
  { username: "samuel_tech", initial: "S", gradient: "from-indigo-500 to-blue-600", time: "10m" },
  { username: "maya_studio", initial: "M", gradient: "from-fuchsia-500 to-pink-500", time: "12m" },
]

// User-scoped client cache to make media section load instantly with 0ms delay on repeat visits
const clientReelsCacheByUserId = new Map<string, any[]>()

export function CreateRuleForm({
  userId,
  triggerSource: initialSource,
  onSuccess,
  editRule,
  creatorUsername: propUsername,
  creatorProfilePic: propProfilePic,
  isIgConnected: propIsIgConnected,
}: CreateRuleFormProps) {
  const isEditing = !!editRule
  const [isIgConnectedLocal, setIsIgConnectedLocal] = useState<boolean | null>(
    propIsIgConnected !== undefined ? propIsIgConnected : null
  )
  const [triggerSource, setTriggerSource] = useState<"comment" | "dm" | "story">(
    editRule ? (editRule.trigger_source || "comment") : initialSource || "comment"
  )

  /* ---------- WHEN ---------- */
  const [triggers, setTriggers] = useState<string[]>([])
  const [commentMatchAll, setCommentMatchAll] = useState<boolean>(() => {
    if (editRule) {
      const tv = (editRule.trigger_value || "").toUpperCase().trim()
      return (
        editRule.trigger_type === "reply_all" ||
        !editRule.trigger_value ||
        tv === "ALL" ||
        tv === "ALL_COMMENTS"
      )
    }
    return true
  })
  const [storyTriggerType, setStoryTriggerType] = useState<"mention" | "reaction" | "reply">("mention")
  const [mediaTarget, setMediaTarget] = useState<{ mode: MediaTargetMode; items: any[] }>({
    mode: "none",
    items: [],
  })
  const selectedMedia = mediaTarget.mode === "specific" ? mediaTarget.items : []
  const selectedMediaIds = useMemo(
    () => selectedMedia.map((item: any) => String(item.id)),
    [selectedMedia],
  )
  const [previewMediaIndex, setPreviewMediaIndex] = useState(0)
  const selectedReel = selectedMedia[previewMediaIndex] || selectedMedia[0] || null
  const hasSelectedReelOption = mediaTarget.mode !== "none"
  const [mediaTriggerOverrides, setMediaTriggerOverrides] = useState<Record<string, string>>({})
  const [isAddingCustomForMedia, setIsAddingCustomForMedia] = useState<string | null>(null)
  const [newCustomKeyword, setNewCustomKeyword] = useState<string>("")
  const customOverrideCount = useMemo(() => {
    return selectedMedia.filter(
      (m: any) => (mediaTriggerOverrides[String(m.id)] || "").trim().length > 0,
    ).length
  }, [selectedMedia, mediaTriggerOverrides])

  /* ---------- Per-Reel Unique Reply Configurations ---------- */
  interface ReelReplyConfig {
    replyMode: "both" | "dm_only" | "public_only"
    publicReply: string
    type: "text" | "card" | "media"
    messageText: string
    cardTitle: string
    cardSubtitle: string
    cardImage: string
    buttons: ProButton[]
    mediaUrl: string
    mediaType: "image" | "video" | "audio"
    quickReplies: QuickReplyOption[]
  }
  const [selectedReplyTarget, setSelectedReplyTarget] = useState<"all" | string>("all")
  const [reelReplyConfigs, setReelReplyConfigs] = useState<Record<string, ReelReplyConfig>>({})
  const defaultReplyConfigRef = useRef<ReelReplyConfig | null>(null)

  useEffect(() => {
    if (previewMediaIndex >= selectedMedia.length && selectedMedia.length > 0) {
      setPreviewMediaIndex(0)
    }
  }, [selectedMedia.length, previewMediaIndex])

  /* ---------- THEN ---------- */
  const [type, setType] = useState<"text" | "card" | "media">("text")
  const [messageText, setMessageText] = useState("")
  const [cardTitle, setCardTitle] = useState("")
  const [cardSubtitle, setCardSubtitle] = useState("")
  const [cardImage, setCardImage] = useState("")
  const [buttons, setButtons] = useState<ProButton[]>([])
  const [mediaUrl, setMediaUrl] = useState("")
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio">("image")
  const [quickReplies, setQuickReplies] = useState<QuickReplyOption[]>([])

  /* ---------- Public comment reply (Single reply sent to each commenter) ---------- */
  const [replyMode, setReplyMode] = useState<"both" | "dm_only" | "public_only">("both")
  const [publicReply, setPublicReply] = useState<string>(() => {
    if (editRule) {
      const content: any =
        typeof editRule.response_content === "string"
          ? JSON.parse(editRule.response_content as any)
          : editRule.response_content || {}
      if (Array.isArray(content.public_replies) && content.public_replies.length > 0) {
        return content.public_replies[0]
      }
      if (typeof content.public_reply === "string") return content.public_reply
    }
    return "Sent you a DM! 📬"
  })
  const publicReplies = useMemo(() => (publicReply.trim() ? [publicReply.trim()] : []), [publicReply])
  const [includeReplies, setIncludeReplies] = useState(true)

  /* ---------- Customizable Keyword & Public Suggestions (Persisted across new workflows, Max 4) ---------- */
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("insta_custom_keyword_suggestions")
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4)
        }
      } catch {}
    }
    return DEFAULT_KEYWORD_SUGGESTIONS
  })
  const [editingKeywordIndex, setEditingKeywordIndex] = useState<number | null>(null)
  const [editingKeywordText, setEditingKeywordText] = useState<string>("")
  const [isAddingKeyword, setIsAddingKeyword] = useState<boolean>(false)
  const [newKeywordInput, setNewKeywordInput] = useState<string>("")

  const [publicSuggestions, setPublicSuggestions] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("insta_custom_public_suggestions")
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4)
        }
      } catch {}
    }
    return DEFAULT_PUBLIC_SUGGESTIONS
  })
  const [editingPublicIndex, setEditingPublicIndex] = useState<number | null>(null)
  const [editingPublicText, setEditingPublicText] = useState<string>("")
  const [isAddingPublic, setIsAddingPublic] = useState<boolean>(false)
  const [newPublicInput, setNewPublicInput] = useState<string>("")

  // Auto-sync user customized suggestions to localStorage so they persist for future new workflows
  useEffect(() => {
    if (typeof window !== "undefined" && keywordSuggestions.length > 0) {
      try {
        localStorage.setItem("insta_custom_keyword_suggestions", JSON.stringify(keywordSuggestions))
      } catch {}
    }
  }, [keywordSuggestions])

  useEffect(() => {
    if (typeof window !== "undefined" && publicSuggestions.length > 0) {
      try {
        localStorage.setItem("insta_custom_public_suggestions", JSON.stringify(publicSuggestions))
      } catch {}
    }
  }, [publicSuggestions])

  /* ---------- EXTRAS ---------- */
  const [name, setName] = useState("")
  const [userHasEditedName, setUserHasEditedName] = useState(false)
  const [checkFollow, setCheckFollow] = useState(false)
  const [delaySeconds, setDelaySeconds] = useState(0)
  const [typingIndicator, setTypingIndicator] = useState(false)

  /* ---------- Reply Config Snapshots & Switching Handlers ---------- */
  const getCurrentFormConfig = (): ReelReplyConfig => ({
    replyMode,
    publicReply,
    type,
    messageText,
    cardTitle,
    cardSubtitle,
    cardImage,
    buttons: buttons.map((b) => ({ ...b })),
    mediaUrl,
    mediaType,
    quickReplies: quickReplies.map((q) => ({ ...q })),
  })

  const applyConfigToForm = (cfg: ReelReplyConfig) => {
    setReplyMode(cfg.replyMode)
    setPublicReply(cfg.publicReply)
    setType(cfg.type)
    setMessageText(cfg.messageText)
    setCardTitle(cfg.cardTitle)
    setCardSubtitle(cfg.cardSubtitle)
    setCardImage(cfg.cardImage)
    setButtons((cfg.buttons || []).map((b) => ({ ...b })))
    setMediaUrl(cfg.mediaUrl)
    setMediaType(cfg.mediaType)
    setQuickReplies((cfg.quickReplies || []).map((q) => ({ ...q })))
  }

  const handleSelectReplyTarget = (targetId: "all" | string) => {
    if (targetId === selectedReplyTarget) return

    // 1. Snapshot current active form values to previous target
    const current = getCurrentFormConfig()
    if (selectedReplyTarget === "all") {
      defaultReplyConfigRef.current = current
    } else {
      setReelReplyConfigs((prev) => ({
        ...prev,
        [selectedReplyTarget]: current,
      }))
    }

    // 2. Load the requested target
    if (targetId === "all") {
      const defaultCfg = defaultReplyConfigRef.current || current
      applyConfigToForm(defaultCfg)
    } else {
      const targetIdx = selectedMedia.findIndex((m: any) => String(m.id) === targetId)
      if (targetIdx >= 0) {
        setPreviewMediaIndex(targetIdx)
      }

      if (reelReplyConfigs[targetId]) {
        applyConfigToForm(reelReplyConfigs[targetId])
      } else {
        // Clone from default template so creator starts with a clean baseline
        const baseCfg = defaultReplyConfigRef.current || current
        const cloned: ReelReplyConfig = {
          ...baseCfg,
          buttons: (baseCfg.buttons || []).map((b) => ({ ...b })),
          quickReplies: (baseCfg.quickReplies || []).map((q) => ({ ...q })),
        }
        setReelReplyConfigs((prev) => ({
          ...prev,
          [targetId]: cloned,
        }))
        applyConfigToForm(cloned)
      }
    }

    setSelectedReplyTarget(targetId)
  }

  // Auto-revert target to "all" if selected post is removed in Step 1
  useEffect(() => {
    if (selectedReplyTarget !== "all" && !selectedMedia.some((m: any) => String(m.id) === selectedReplyTarget)) {
      setSelectedReplyTarget("all")
      if (defaultReplyConfigRef.current) {
        applyConfigToForm(defaultReplyConfigRef.current)
      }
    }
  }, [selectedMedia, selectedReplyTarget])

  /* ---------- LIVE PHONE PREVIEW & SIMULATOR STATES ---------- */
  const [phoneScreenMode, setPhoneScreenMode] = useState<"content" | "dm">(
    editRule?.trigger_source === "dm" || initialSource === "dm" ? "dm" : "content"
  )
  const [commentSheetOpen, setCommentSheetOpen] = useState<boolean>(false)
  const [currentPublicDraft, setCurrentPublicDraft] = useState<string>("")
  const [currentTriggerDraft, setCurrentTriggerDraft] = useState<string>("")
  const [simStage, setSimStage] = useState<number>(0)
  const [postLiked, setPostLiked] = useState<boolean>(false)
  const [postSaved, setPostSaved] = useState<boolean>(false)
  const [storyLiked, setStoryLiked] = useState<boolean>(false)
  const [spintaxIndex, setSpintaxIndex] = useState<number>(0)
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState<boolean>(false)

  const chatScrollRef = useRef<HTMLDivElement>(null)
  const mobileChatScrollRef = useRef<HTMLDivElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const mobileChatBottomRef = useRef<HTMLDivElement>(null)

  const showPayloadStage = () => {
    setPhoneScreenMode("dm")
    setCommentSheetOpen(false)
    setSimStage(checkFollow ? 2 : 1)
  }

  useEffect(() => {
    const scrollToBottom = () => {
      if (chatBottomRef.current) {
        chatBottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
      } else if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
      }
      if (mobileChatBottomRef.current) {
        mobileChatBottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
      } else if (mobileChatScrollRef.current) {
        mobileChatScrollRef.current.scrollTop = mobileChatScrollRef.current.scrollHeight
      }
    }
    scrollToBottom()
    const t = setTimeout(scrollToBottom, 60)
    return () => clearTimeout(t)
  }, [simStage, messageText, cardTitle, cardSubtitle, cardImage, mediaUrl, buttons, type, phoneScreenMode])

  /* ---------- HYPER-INTERACTIVE SIMULATOR STATES ---------- */
  const [simComments, setSimComments] = useState<Array<{
    id: string
    username: string
    initial?: string
    gradient?: string
    text: string
    time: string
    isUser: boolean
    matched: boolean
    hasReply?: boolean
    replyText?: string
  }>>([
    {
      id: "c_root_1",
      username: "alex_design",
      initial: "A",
      gradient: "from-zinc-600 to-zinc-700",
      text: "Is there a download link or tutorial for this setup?",
      time: "2h",
      isUser: false,
      matched: false,
    },
  ])
  const [simInputText, setSimInputText] = useState<string>("")
  const [simStoryInputText, setSimStoryInputText] = useState<string>("")
  const [simActiveTriggerText, setSimActiveTriggerText] = useState<string>("")
  const [simNotification, setSimNotification] = useState<{
    visible: boolean
    title: string
    body: string
  } | null>(null)

  const livePublicReply = publicReply.trim()
  const liveTrigger = currentTriggerDraft || (triggers.length > 0 ? triggers[0] : "")
  const liveTriggerDisplay = currentTriggerDraft
    ? currentTriggerDraft
    : triggers.length > 0
      ? triggers.join(", ")
      : ""

  const activeReelId = selectedReel ? String(selectedReel.id) : null
  const activeReelCustomKw = activeReelId ? (mediaTriggerOverrides[activeReelId] || "").trim() : ""
  const activeCardTitle = cardTitle
  const activeMessageText = messageText
  const activeButtons = buttons

  const liveCommentText =
    simActiveTriggerText ||
    simInputText ||
    (activeReelCustomKw ? activeReelCustomKw.split(",")[0].trim() : null) ||
    currentTriggerDraft ||
    (triggers.length > 0 ? triggers[0] : (commentMatchAll ? "Love this! Tell me more ✨" : "link"))

  const liveAutoReplyText = publicReply.trim() || DEFAULT_PUBLIC_SUGGESTIONS[0]

  const activeKeywords = triggers.map((t) => t.toLowerCase().trim()).filter(Boolean)
  const isLiveMatch =
    commentMatchAll ||
    Boolean(activeReelCustomKw && liveCommentText.toLowerCase().includes(activeReelCustomKw.toLowerCase())) ||
    (activeKeywords.length === 0 && !currentTriggerDraft && !activeReelCustomKw) ||
    (currentTriggerDraft && liveCommentText.toLowerCase().includes(currentTriggerDraft.toLowerCase())) ||
    activeKeywords.some((kw) => liveCommentText.toLowerCase().includes(kw))

  /* Generate dedicated random simulated user comments for every trigger keyword */
  const simKeywordComments = useMemo(() => {
    const list: Array<{
      id: string
      username: string
      initial: string
      gradient: string
      text: string
      time: string
      isDraft?: boolean
      matched: boolean
    }> = []

    if (commentMatchAll) {
      list.push({
        id: "sim_all_1",
        username: "sarah_k",
        initial: "S",
        gradient: "from-purple-500 to-indigo-500",
        text: liveCommentText || "Love this setup! ✨",
        time: "Just now",
        matched: true,
      })
      return list
    }

    const activeList = [...triggers]
    if (currentTriggerDraft && !activeList.some((t) => t.toLowerCase() === currentTriggerDraft.toLowerCase())) {
      activeList.push(currentTriggerDraft)
    }

    if (activeList.length === 0) {
      list.push({
        id: "sim_kw_default",
        username: "sarah_k",
        initial: "S",
        gradient: "from-purple-500 to-indigo-500",
        text: "link",
        time: "Just now",
        matched: true,
      })
      return list
    }

    activeList.forEach((kw, index) => {
      const userPreset = RANDOM_SIM_USERS[index % RANDOM_SIM_USERS.length]
      const isDraft = kw === currentTriggerDraft
      list.push({
        id: `sim_kw_${index}_${kw}`,
        username: userPreset.username,
        initial: userPreset.initial,
        gradient: userPreset.gradient,
        text: kw,
        time: isDraft ? "Typing..." : userPreset.time,
        isDraft,
        matched: true,
      })
    })

    return list
  }, [triggers, currentTriggerDraft, commentMatchAll, liveCommentText])

  /* Follow Gate & Initial Greeting Configuration */
  const [initialTitle, setInitialTitle] = useState("Hey there! I'm so happy you're here, thanks so much for your interest 😊")
  const [initialSubtitle, setInitialSubtitle] = useState("Click below and I'll send you the link in just a sec ✨")
  const [initialButtonText, setInitialButtonText] = useState("Send me the link")
  const [followGateTitle, setFollowGateTitle] = useState("Oh no! It seems you're not following me 👀")
  const [followGateSubtitle, setFollowGateSubtitle] = useState("Follow my profile first, then tap 'I'm following' below to get your link! ✨")
  const [followGateImageUrl, setFollowGateImageUrl] = useState("")
  const [followGateButtonFollow, setFollowGateButtonFollow] = useState("Visit Profile")
  const [followGateButtonUnlock, setFollowGateButtonUnlock] = useState("I'm following ✅")

  const [creatorUsername, setCreatorUsername] = useState<string>(() => {
    if (propUsername) return propUsername.replace(/^@/, '')
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ig_username")
      if (stored) return stored.replace(/^@/, '')
    }
    return "creator"
  })

  const [creatorProfilePic, setCreatorProfilePic] = useState<string>(() => {
    if (propProfilePic && propProfilePic.startsWith("http")) return propProfilePic
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ig_profile_pic")
      if (stored && stored.startsWith("http")) return stored
    }
    return "/mock/creator_avatar_hd.jpg"
  })
  const creatorHandle = formatIdentityHandle(creatorUsername, "creator")

  const selectedPostMedia = selectedReel
    ? (selectedReel.thumbnail_url || selectedReel.image_url || selectedReel.media_url || selectedReel.cover_url || null)
    : null

  const selectedStoryMedia = selectedReel
    ? (selectedReel.media_url || selectedReel.thumbnail_url || selectedReel.image_url || null)
    : null

  useEffect(() => {
    if (propUsername) setCreatorUsername(propUsername.replace(/^@/, ''))
    if (propProfilePic) setCreatorProfilePic(propProfilePic)
    else if (propProfilePic === null) setCreatorProfilePic("/mock/creator_avatar_hd.jpg")
  }, [propUsername, propProfilePic])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch(`/api/instagram/status?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data) return
        if (typeof data.connected === "boolean") {
          setIsIgConnectedLocal(data.connected)
        }
        if (data.profilePic) {
          setCreatorProfilePic(data.profilePic)
          if (typeof window !== "undefined") localStorage.setItem("ig_profile_pic", data.profilePic)
        } else if (data.connected === false) {
          setCreatorProfilePic("/mock/creator_avatar_hd.jpg")
        }
        const displayName = data.instagramUsername || data.username
        if (displayName) {
          setCreatorUsername(String(displayName).replace(/^@/, ''))
          if (typeof window !== "undefined") localStorage.setItem("ig_username", String(displayName))
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [userId])

  useEffect(() => {
    if (triggerSource === "dm") {
      setPhoneScreenMode("dm")
      setCommentSheetOpen(false)
    } else {
      setPhoneScreenMode("content")
      setCommentSheetOpen(false)
    }
  }, [triggerSource])

  /* ---------- HYPER-INTERACTIVE SIMULATOR HANDLERS ---------- */
  const handleSimPostComment = (textOverride?: string) => {
    const raw = (textOverride !== undefined ? textOverride : simInputText).trim()
    if (!raw) return

    const activeKeywords = triggers.map((t) => t.toLowerCase().trim()).filter(Boolean)
    const isReplyAll = commentMatchAll || activeKeywords.length === 0
    const isMatch = isReplyAll || activeKeywords.some((kw) => raw.toLowerCase().includes(kw))

    const randomUser = RANDOM_SIM_USERS[(simComments.length + Math.floor(Math.random() * 3)) % RANDOM_SIM_USERS.length]

    const newComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      username: randomUser.username,
      initial: randomUser.initial,
      gradient: randomUser.gradient,
      text: raw,
      time: "Just now",
      isUser: true,
      matched: isMatch,
      hasReply: isMatch && replyMode !== "dm_only",
      replyText: isMatch && replyMode !== "dm_only" ? (publicReply.trim() || DEFAULT_PUBLIC_SUGGESTIONS[0]) : undefined,
    }

    setSimComments((prev) => [...prev, newComment])
    setSimInputText("")
    setSimActiveTriggerText(raw)

    if (isMatch) {
      toast.success(`Trigger matched! ${creatorHandle} sent public reply & preparing DM ✨`)
      if (replyMode !== "public_only") {
        const notifBody = checkFollow
          ? (initialTitle.slice(0, 50) + "...")
          : (messageText || cardTitle || "Sent you the link! 📬")

        setSimNotification({
          visible: true,
          title: `${creatorHandle}`,
          body: notifBody,
        })

        setTimeout(() => {
          setPhoneScreenMode("dm")
          setCommentSheetOpen(false)
          setSimStage(0)
          setSimNotification(null)
        }, 1500)
      }
    } else {
      toast.error(`Did not match trigger keyword. Try: "${triggers[0] || 'link'}"`)
    }
  }

  const handleSimStoryInteract = (interaction: { type: "reaction" | "reply"; value: string }) => {
    if (!interaction.value.trim()) return
    setSimActiveTriggerText(interaction.value)
    toast.success(`Story ${interaction.type} sent! Opening automated DM...`)
    setSimNotification({
      visible: true,
      title: `${creatorHandle}`,
      body: checkFollow ? (initialTitle.slice(0, 50) + "...") : (messageText || cardTitle || "Sent you a message!"),
    })
    setTimeout(() => {
      setPhoneScreenMode("dm")
      setSimStage(0)
      setSimNotification(null)
      setSimStoryInputText("")
    }, 1200)
  }

  const handleResetSim = () => {
    setSimComments([
      {
        id: "c_root_1",
        username: "alex_design",
        text: "Is there a download link or tutorial for this setup?",
        time: "2h",
        isUser: false,
        matched: false,
      },
    ])
    setSimInputText("")
    setSimStoryInputText("")
    setSimActiveTriggerText("")
    setSimNotification(null)
    setSimStage(0)
    setPhoneScreenMode("content")
    setCommentSheetOpen(false)
    toast.info("Simulation reset to initial state")
  }

  const [saving, setSaving] = useState(false)
  const [reels, setReels] = useState<any[]>(() => {
    if (!userId) return []
    if (clientReelsCacheByUserId.has(userId)) return clientReelsCacheByUserId.get(userId) || []
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_reels_" + userId)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            clientReelsCacheByUserId.set(userId, parsed)
            return parsed
          }
        }
      } catch {}
    }
    return []
  })
  const [loadingReels, setLoadingReels] = useState(() => {
    if (!userId) return false
    if (clientReelsCacheByUserId.has(userId)) return false
    if (typeof window !== "undefined") {
      try {
        const stored = window.sessionStorage.getItem("flashinsta_reels_" + userId)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) return false
        }
      } catch {}
    }
    return true
  })

  const fetchReels = (force = false) => {
    if (!userId) return
    setLoadingReels(true)
    const url = `/api/instagram/media?userId=${encodeURIComponent(userId)}${force ? "&refresh=true" : ""}`
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        const list = j.data && Array.isArray(j.data) ? j.data : Array.isArray(j) ? j : []
        setReels(list)
        if (list.length > 0) {
          clientReelsCacheByUserId.set(userId, list)
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.setItem("flashinsta_reels_" + userId, JSON.stringify(list))
            } catch {}
          }
          setMediaTarget((prev) => {
            if (prev.mode !== "specific") return prev
            return {
              mode: "specific",
              items: prev.items.map((item: any) => {
                const match = list.find((media: any) => String(media.id) === String(item.id))
                return match || item
              }),
            }
          })
        }
      })
      .catch((err) => console.error("Failed to load reels", err))
      .finally(() => setLoadingReels(false))
  }

  useEffect(() => {
    if (!userId) return
    if (!clientReelsCacheByUserId.has(userId)) {
      fetchReels(false)
    }
  }, [userId])

  /* Prefill on edit */
  useEffect(() => {
    if (!editRule) return
    const content: any =
      typeof editRule.response_content === "string"
        ? JSON.parse(editRule.response_content as any)
        : editRule.response_content || {}

    setName(editRule.name)
    setUserHasEditedName(true)
    if (["mention", "reaction", "reply"].includes(editRule.trigger_type)) {
      setStoryTriggerType(editRule.trigger_type as any)
    }
    const rawTriggers = (editRule.trigger_value || "")
      .split(",").map((t) => t.trim())
      .filter((t) => t && !["ALL", "ALL_COMMENTS", "ALL_MENTIONS", "ALL_REACTIONS"].includes(t.toUpperCase()))
    setTriggers(rawTriggers)
    const tv = (editRule.trigger_value || "").toUpperCase().trim()
    const isAll =
      editRule.trigger_type === "reply_all" ||
      !editRule.trigger_value ||
      tv === "ALL" ||
      tv === "ALL_COMMENTS"
    setCommentMatchAll(isAll)

    if (content.media?.url) {
      setType("media"); setMediaUrl(content.media.url); setMediaType(content.media.type || "image"); setMessageText(content.message || "")
    } else if (content.card) {
      setType("card"); setCardTitle(content.card.title || ""); setCardSubtitle(content.card.subtitle || ""); setCardImage(content.card.image_url || "")
      setButtons((content.card.buttons || []).map((b: any, i: number) => ({ id: `${Date.now()}_${i}`, ...b })))
    } else {
      setType("text"); setMessageText(content.message || "")
    }
    setQuickReplies((content.quick_replies || []).map((q: any, i: number) => ({ id: `${Date.now()}_qr${i}`, title: q.title, payload: q.payload })))
    setReplyMode(content.reply_mode || "both")
    const initialReply =
      Array.isArray(content.public_replies) && content.public_replies.length > 0
        ? content.public_replies[0]
        : typeof content.public_reply === "string"
          ? content.public_reply
          : ""
    setPublicReply(initialReply)
    setIncludeReplies(true)
    setCheckFollow(content.check_follow === true)
    setDelaySeconds(Number(content.delay_seconds) || 0)
    setTypingIndicator(content.typing_indicator === true)
    
    if (content.follow_gate) {
      if (content.follow_gate.initial_title) setInitialTitle(content.follow_gate.initial_title)
      if (content.follow_gate.initial_subtitle) setInitialSubtitle(content.follow_gate.initial_subtitle)
      if (content.follow_gate.initial_button_text) setInitialButtonText(content.follow_gate.initial_button_text)
      if (content.follow_gate.title) setFollowGateTitle(content.follow_gate.title)
      if (content.follow_gate.subtitle) setFollowGateSubtitle(content.follow_gate.subtitle)
      if (content.follow_gate.image_url) setFollowGateImageUrl(content.follow_gate.image_url)
      if (content.follow_gate.button_follow) setFollowGateButtonFollow(content.follow_gate.button_follow)
      if (content.follow_gate.button_unlock) setFollowGateButtonUnlock(content.follow_gate.button_unlock)
    }
    if (content.initial_title) setInitialTitle(content.initial_title)
    if (content.initial_subtitle) setInitialSubtitle(content.initial_subtitle)
    if (content.initial_button_text) setInitialButtonText(content.initial_button_text)
    
    const editMediaIds = getAutomationMediaIds(editRule)
    if (editMediaIds.length > 0) {
      const cachedReels = userId ? clientReelsCacheByUserId.get(userId) || [] : []
      setMediaTarget({
        mode: "specific",
        items: editMediaIds.map((id) => {
          const cached = cachedReels.find((media: any) => String(media.id) === String(id))
          return cached || {
            id,
            caption: editRule.trigger_source === "story" ? "Selected story" : "Selected post",
          }
        }),
      })
    } else {
      setMediaTarget({ mode: "all", items: [] })
    }
  }, [editRule, userId])

  /* Auto name: Only suggest an initial name if the user hasn't manually edited/cleared it */
  useEffect(() => {
    if (isEditing || userHasEditedName) return
    const isReplyAll = triggerSource === "comment" && commentMatchAll
    if (isReplyAll) setName("Reply to every comment")
    else if (triggers.length > 0) setName(`Reply to "${triggers[0]}"`)
  }, [triggers, commentMatchAll, userHasEditedName, isEditing, triggerSource])

  /* ---------- helpers ---------- */
  const addButton = () => {
    if (buttons.length >= 3) return
    setButtons([...buttons, { id: Date.now().toString(), type: "web_url", title: "", url: "", payload: "" }])
    showPayloadStage()
  }
  const updateButton = (id: string, field: keyof ProButton, value: string) => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)))
    showPayloadStage()
  }
  const removeButton = (id: string) => {
    setButtons(buttons.filter((b) => b.id !== id))
    showPayloadStage()
  }

  const addQuickReply = () => {
    if (quickReplies.length >= 4) return
    setQuickReplies([...quickReplies, { id: Date.now().toString(), title: "" }])
    showPayloadStage()
  }
  const updateQuickReply = (id: string, title: string) => {
    setQuickReplies(quickReplies.map((q) => (q.id === id ? { ...q, title } : q)))
    showPayloadStage()
  }
  const removeQuickReply = (id: string) => {
    setQuickReplies(quickReplies.filter((q) => q.id !== id))
    showPayloadStage()
  }

  const toggleKeyword = (kw: string) => {
    if (triggers.includes(kw)) {
      setTriggers(triggers.filter((t) => t !== kw))
    } else {
      setTriggers([...triggers, kw])
      setCommentMatchAll(false)
    }
  }

  /* Multi-select helpers for post/reel/story targeting */
  const toggleMediaTarget = (item: any) => {
    setMediaTarget((prev) => {
      const current = prev.mode === "specific" ? prev.items : []
      const exists = current.some((entry) => String(entry.id) === String(item.id))
      const nextItems = exists
        ? current.filter((entry) => String(entry.id) !== String(item.id))
        : [...current, item]
      return nextItems.length > 0
        ? { mode: "specific", items: nextItems }
        : { mode: "none", items: [] }
    })
    setPhoneScreenMode("content")
    setCommentSheetOpen(false)
  }

  const toggleAllMediaTarget = () => {
    setMediaTarget((prev) =>
      prev.mode === "all" ? { mode: "none", items: [] } : { mode: "all", items: [] },
    )
    setPhoneScreenMode("content")
    setCommentSheetOpen(false)
  }

  /* Keyword suggestions helpers (Card 2) */
  const handleAddKeywordSuggestion = () => {
    const trimmed = newKeywordInput.trim().toLowerCase()
    if (trimmed && keywordSuggestions.length < 4 && !keywordSuggestions.includes(trimmed)) {
      setKeywordSuggestions([...keywordSuggestions, trimmed])
      setTriggers([...triggers.filter((t) => t !== trimmed), trimmed])
      setCommentMatchAll(false)
      setNewKeywordInput("")
      setIsAddingKeyword(false)
    }
  }

  const handleDeleteKeywordSuggestion = (index: number) => {
    const deletedKw = keywordSuggestions[index]?.toLowerCase()
    setKeywordSuggestions(keywordSuggestions.filter((_, i) => i !== index))
    if (deletedKw && triggers.includes(deletedKw)) {
      setTriggers(triggers.filter((t) => t !== deletedKw))
    }
    if (editingKeywordIndex === index) setEditingKeywordIndex(null)
  }

  const handleStartEditKeyword = (index: number) => {
    setEditingKeywordIndex(index)
    setEditingKeywordText(keywordSuggestions[index])
  }

  const handleSaveEditKeyword = (index: number) => {
    const trimmed = editingKeywordText.trim().toLowerCase()
    if (trimmed) {
      const prev = keywordSuggestions[index]?.toLowerCase()
      const next = [...keywordSuggestions]
      next[index] = trimmed
      setKeywordSuggestions(next)
      if (prev && triggers.includes(prev)) {
        setTriggers(triggers.map((t) => (t === prev ? trimmed : t)))
      }
    }
    setEditingKeywordIndex(null)
  }

  const toggleKeywordSuggestion = (kw: string) => {
    const lower = kw.toLowerCase()
    if (triggers.includes(lower)) {
      setTriggers(triggers.filter((t) => t !== lower))
    } else {
      setTriggers([...triggers, lower])
      setCommentMatchAll(false)
    }
    setPhoneScreenMode("content")
    setCommentSheetOpen(true)
  }

  /* Public reply suggestions helpers (Card 3) */
  const handleAddPublicSuggestion = () => {
    const trimmed = newPublicInput.trim()
    if (trimmed && publicSuggestions.length < 4 && !publicSuggestions.includes(trimmed)) {
      setPublicSuggestions([...publicSuggestions, trimmed])
      setNewPublicInput("")
      setIsAddingPublic(false)
    }
  }

  const handleDeletePublicSuggestion = (index: number) => {
    const deletedText = publicSuggestions[index]
    setPublicSuggestions(publicSuggestions.filter((_, i) => i !== index))
    if (publicReply.trim() === deletedText.trim()) {
      setPublicReply("")
    }
    if (editingPublicIndex === index) setEditingPublicIndex(null)
  }

  const handleStartEditPublic = (index: number) => {
    setEditingPublicIndex(index)
    setEditingPublicText(publicSuggestions[index])
  }

  const handleSaveEditPublic = (index: number) => {
    const trimmed = editingPublicText.trim()
    if (trimmed) {
      const prevText = publicSuggestions[index]
      const next = [...publicSuggestions]
      next[index] = trimmed
      setPublicSuggestions(next)
      if (publicReply.trim() === prevText.trim()) {
        setPublicReply(trimmed)
      }
    }
    setEditingPublicIndex(null)
  }

  const togglePublicSuggestion = (text: string) => {
    const trimmed = text.trim()
    if (publicReply.trim() === trimmed) {
      setPublicReply("")
    } else {
      setPublicReply(trimmed)
    }
    setPhoneScreenMode("content")
    setCommentSheetOpen(true)
  }

  const needsKeywords = triggerSource === "dm"

  const whenValid = triggerSource === "comment" 
    ? hasSelectedReelOption && (commentMatchAll || triggers.length > 0)
    : triggerSource === "story"
      ? true // Story mentions, reactions, and replies can apply to all or filtered by keyword
      : triggers.length > 0

  const thenValid =
    replyMode === "public_only"
      ? publicReply.trim().length > 0
      : (type === "text"
          ? messageText.trim().length > 0
          : type === "card"
            ? (cardTitle.trim().length > 0 || cardImage.trim().length > 0)
            : (mediaUrl.trim().length > 0 || messageText.trim().length > 0))
  const canSave = whenValid && thenValid && name.trim().length > 0

  const validationHint = !whenValid
    ? (triggerSource === "comment" && !hasSelectedReelOption
        ? "Select one or more posts or 'All Posts & Reels' above to continue"
        : triggerSource === "comment" && !commentMatchAll && triggers.length === 0
          ? "Add at least one trigger keyword or select 'Every comment' above"
          : needsKeywords && triggers.length === 0
            ? "Add at least one keyword in Direct Messages above"
            : "Complete trigger conditions above")
    : !thenValid
      ? (replyMode === "public_only" && !publicReply.trim()
          ? "Enter your public comment reply above"
          : "Add your direct message content above")
      : !name.trim()
        ? "Give this workflow a name before publishing"
        : ""

  /* Plain-language summary sentence */
  const summary = useMemo(() => {
    const isReplyAll = triggerSource === "comment" && commentMatchAll
    const targetCount = selectedMedia.length
    const targetDesc =
      targetCount > 1
        ? `your ${targetCount} selected ${triggerSource === "story" ? "stories" : "posts"}`
        : targetCount === 1
          ? triggerSource === "story" ? "your target story" : "your target reel / post"
          : triggerSource === "story" ? "your story" : "your reel or post"
    const who =
      triggerSource === "comment"
        ? isReplyAll
          ? `anyone comments on ${targetDesc}`
          : `someone comments ${triggers.length ? `"${triggers[0]}"` : "a keyword"} on ${targetDesc}`
        : triggerSource === "dm"
          ? `someone DMs you ${triggers.length ? `"${triggers[0]}"` : "a keyword"}`
          : storyTriggerType === "mention" ? "someone mentions you in a story"
            : storyTriggerType === "reaction" ? "someone reacts to your story"
              : "someone replies to your story"
    const what =
      replyMode === "public_only" ? "reply publicly with a comment"
        : type === "card" ? "send them an interactive card"
          : type === "media" ? `send them ${mediaType === "image" ? "an image" : `a ${mediaType}`}`
            : "send them a private DM"
    return { who, what }
  }, [triggerSource, commentMatchAll, triggers, storyTriggerType, replyMode, type, mediaType, selectedMedia.length])

  function buildContentFromConfig(cfg: ReelReplyConfig, baseContent: any) {
    const custom = JSON.parse(JSON.stringify(baseContent))
    custom.reply_mode = cfg.replyMode
    if (cfg.publicReply && cfg.publicReply.trim()) {
      custom.public_replies = [cfg.publicReply.trim()]
      custom.public_reply = cfg.publicReply.trim()
    } else {
      delete custom.public_replies
      delete custom.public_reply
    }

    delete custom.message
    delete custom.media
    delete custom.card

    if (cfg.type === "text") {
      custom.message = cfg.messageText
    } else if (cfg.type === "media") {
      custom.media = { type: cfg.mediaType, url: cfg.mediaUrl.trim() }
      if (cfg.messageText.trim()) custom.message = cfg.messageText
    } else {
      const cleanButtons = (cfg.buttons || [])
        .map((b) => {
          if (b.type === "web_url") {
            let cleanUrl = b.url?.trim() || ""
            if (cleanUrl.startsWith("https://https://")) cleanUrl = cleanUrl.replace("https://https://", "https://")
            return { type: "web_url" as const, title: b.title, url: cleanUrl }
          }
          return { type: "postback" as const, title: b.title, payload: b.payload }
        })
        .filter((b) => b.title)
      custom.card = {
        title: cfg.cardTitle,
        subtitle: cfg.cardSubtitle || undefined,
        image_url: cfg.cardImage || undefined,
        buttons: cleanButtons,
      }
    }

    if (cfg.quickReplies && cfg.quickReplies.filter((q) => q.title.trim()).length > 0) {
      custom.quick_replies = cfg.quickReplies
        .filter((q) => q.title.trim())
        .map((q) => ({ title: q.title.trim(), payload: q.payload }))
    } else {
      delete custom.quick_replies
    }

    return custom
  }

  /* ---------- save ---------- */
  const handleSubmit = async () => {
    if (!canSave || saving) return
    setSaving(true)

    const isReplyAll = triggerSource === "comment" && commentMatchAll

    const content: any = { check_follow: checkFollow }
    if (delaySeconds > 0) content.delay_seconds = delaySeconds
    if (typingIndicator) content.typing_indicator = true
    if (triggerSource === "comment") {
      content.reply_mode = replyMode
      if (publicReply.trim()) {
        content.public_replies = [publicReply.trim()]
        content.public_reply = publicReply.trim()
      }
      if (includeReplies) content.include_replies = true
    }
    // Save Initial Greeting & Request Card (default active in application)
    content.initial_title = initialTitle.trim() || "Hey there! I'm so happy you're here, thanks so much for your interest 😊"
    content.initial_subtitle = initialSubtitle.trim() || "Click below and I'll send you the link in just a sec ✨"
    content.initial_button_text = initialButtonText.trim() || "Send me the link"

    if (checkFollow) {
      content.follow_gate = {
        initial_title: content.initial_title,
        initial_subtitle: content.initial_subtitle,
        initial_button_text: content.initial_button_text,
        title: followGateTitle.trim() || "Oh no! It seems you're not following me 👀",
        subtitle: followGateSubtitle.trim() || "Follow my profile first, then tap 'I'm following' below to get your link! ✨",
        image_url: followGateImageUrl.trim() || undefined,
        button_follow: followGateButtonFollow.trim() || "Visit Profile",
        button_unlock: followGateButtonUnlock.trim() || "I'm following ✅",
      }
    } else {
      content.follow_gate = {
        initial_title: content.initial_title,
        initial_subtitle: content.initial_subtitle,
        initial_button_text: content.initial_button_text,
      }
    }
    if (quickReplies.filter((q) => q.title.trim()).length > 0) {
      content.quick_replies = quickReplies.filter((q) => q.title.trim()).map((q) => ({ title: q.title.trim(), payload: q.payload }))
    }

    if (type === "text") {
      content.message = messageText
    } else if (type === "media") {
      content.media = { type: mediaType, url: mediaUrl.trim() }
      if (messageText.trim()) content.message = messageText
    } else {
      const cleanButtons = buttons
        .map((b) => {
          if (b.type === "web_url") {
            let cleanUrl = b.url?.trim() || ""
            if (cleanUrl.startsWith("https://https://")) cleanUrl = cleanUrl.replace("https://https://", "https://")
            return { type: "web_url" as const, title: b.title, url: cleanUrl }
          }
          return { type: "postback" as const, title: b.title, payload: b.payload }
        })
        .filter((b) => b.title)
      content.card = { title: cardTitle, subtitle: cardSubtitle || undefined, image_url: cardImage || undefined, buttons: cleanButtons }
    }

    const finalName = name.trim() || (triggerSource === "comment" && triggers.length === 0 ? "Reply to every comment" : triggers.length > 0 ? `Reply to "${triggers[0]}"` : "Untitled Workflow")

    const mediaIds = triggerSource === "dm" ? [] : selectedMediaIds

    // Snapshot current form values before saving
    const currentSnapshot = getCurrentFormConfig()
    const activeConfigs = { ...reelReplyConfigs }
    let latestDefault = defaultReplyConfigRef.current || currentSnapshot
    if (selectedReplyTarget === "all") {
      latestDefault = currentSnapshot
    } else {
      activeConfigs[selectedReplyTarget] = currentSnapshot
    }

    const payload = {
      userId,
      name: finalName,
      trigger_source: triggerSource,
      trigger_type: isReplyAll ? "reply_all" : triggerSource === "story" ? storyTriggerType : "keyword",
      trigger_value: isReplyAll ? "ALL_COMMENTS"
        : triggerSource === "story" && storyTriggerType === "mention" ? "ALL_MENTIONS"
          : triggerSource === "story" && storyTriggerType === "reaction" && triggers.length === 0 ? "ALL_REACTIONS"
            : triggerSource === "story" && storyTriggerType === "reply" && triggers.length === 0 ? "ALL"
              : triggers.length > 0 ? triggers.join(", ") : "ALL",
      content,
      specific_media_ids: mediaIds,
      specific_media_id: mediaIds[0] || null,
      separate_workflows: !isEditing && mediaIds.length > 1,
      media_items: selectedMedia.map((m: any) => {
        const mId = String(m.id)
        const customVal = (mediaTriggerOverrides[mId] || "").trim()
        const customCfg = activeConfigs[mId]

        let customContent = undefined
        if (customCfg) {
          customContent = buildContentFromConfig(customCfg, content)
        }

        return {
          id: mId,
          caption: typeof m.caption === "string" ? m.caption : null,
          trigger_value: customVal || null,
          trigger_type: customVal
            ? customVal.toUpperCase() === "ALL" || customVal.toUpperCase() === "ALL_COMMENTS"
              ? "reply_all"
              : "keyword"
            : undefined,
          custom_content: customContent,
        }
      }),
    }

    try {
      const res = await fetch("/api/automations", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { ...payload, id: editRule!.id } : payload),
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        const isArray = Array.isArray(json)
        const count = isArray ? json.length : json?.count || (payload.separate_workflows ? mediaIds.length : 1)
        toast.success(
          isEditing
            ? "Automation updated"
            : count > 1
              ? `${count} separate automations created`
              : "Automation is live",
        )
        onSuccess()
      } else {
        toast.error("Could not save — try again")
      }
    } catch {
      toast.error("Network error")
    } finally {
      setSaving(false)
    }
  }

  const renderMessageWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation()
              toast.info(`Simulated: Opening link "${part}"`)
            }}
            className="text-[#3797f0] underline hover:opacity-80 font-medium break-all"
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  const renderPayloadMessage = (isMobile: boolean = false, badgeText: string = "🎁 Delivered Payload") => {
    const cardMaxWidth = isMobile ? "max-w-[195px]" : "max-w-[215px]"
    const avatarSize = isMobile ? "w-5 h-5" : "w-6 h-6"
    return (
      <div className="flex justify-start items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
        <div className={`${avatarSize} rounded-full overflow-hidden border border-zinc-700/60 shrink-0 self-end mb-0.5 bg-neutral-900 shadow-sm`}>
          <img
            src={creatorProfilePic}
            alt={creatorUsername}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
            }}
          />
        </div>
        <div className={`w-full ${cardMaxWidth} bg-[#1c1c1e] text-white rounded-2xl rounded-bl-xs p-3 border border-zinc-800 shadow-2xl space-y-2 font-sans overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
            <h5 className="text-[10px] font-bold text-emerald-400">{badgeText}</h5>
            <span className="text-[7.5px] font-mono-ui text-zinc-400 uppercase">
              {type === "card" ? "Card" : type === "media" ? mediaType : "Text"}
            </span>
          </div>

          {type === "card" ? (
            <div className="space-y-2">
              {cardImage && (cardImage.startsWith("http") || cardImage.startsWith("/") || cardImage.startsWith("data:") || cardImage.startsWith("blob:")) && (
                <div className={`w-full ${isMobile ? "h-20" : "h-24"} rounded-lg overflow-hidden bg-black/40 relative`}>
                  <img src={cardImage} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              <div>
                <p className="text-[11px] font-bold text-white line-clamp-2 break-words">{activeCardTitle || "Card Title"}</p>
                {cardSubtitle && (
                  <p className="text-[8.5px] text-zinc-400 line-clamp-3 mt-0.5 break-words">{cardSubtitle}</p>
                )}
              </div>
              {activeButtons.filter((b) => b.title).length > 0 && (
                <div className="space-y-1 pt-1">
                  {activeButtons.filter((b) => b.title).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        if (b.type === "web_url" && b.url) {
                          toast.info(`Simulated: Opening link "${b.url}"`)
                        } else {
                          toast.info(`Simulated action: "${b.title}"`)
                        }
                      }}
                      className="w-full h-7 bg-[#2c2c2e] hover:bg-[#38383a] text-white text-[9.5px] font-bold rounded-lg flex items-center justify-center cursor-pointer transition-colors truncate px-2"
                    >
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : type === "media" ? (
            <div className="space-y-1.5">
              {mediaType === "image" && (
                <div className={`w-full ${isMobile ? "h-24" : "h-32"} rounded-lg overflow-hidden bg-black/40 relative`}>
                  {mediaUrl ? (
                    <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-1 text-zinc-500">
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-[7.5px] uppercase font-mono-ui">Image Payload</span>
                    </div>
                  )}
                </div>
              )}
              {mediaType === "video" && (
                <div className={`w-full ${isMobile ? "h-20" : "h-28"} rounded-lg overflow-hidden bg-black relative flex items-center justify-center`}>
                  {mediaUrl ? (
                    <video src={mediaUrl} className="w-full h-full object-cover" controls playsInline />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 text-zinc-500">
                      <Play className="w-4 h-4 text-white" />
                      <span className="text-[7.5px] uppercase font-mono-ui">Video Payload</span>
                    </div>
                  )}
                </div>
              )}
              {mediaType === "audio" && (
                <div className="p-2 bg-neutral-900 rounded-lg flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-[#3797f0] fill-[#3797f0] shrink-0" />
                  <span className="text-[8.5px] text-zinc-300 font-mono-ui">Voice Note Payload</span>
                </div>
              )}
              {activeMessageText && (
                <p className="text-[9.5px] text-zinc-200 mt-1 whitespace-pre-wrap break-words break-all">{renderMessageWithLinks(activeMessageText)}</p>
              )}
            </div>
          ) : (
            <p className="text-[10.5px] text-zinc-200 leading-snug whitespace-pre-wrap break-words break-all">
              {activeMessageText ? renderMessageWithLinks(activeMessageText) : "Here is your exclusive link!"}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="workflow-builder space-y-4">
      {/* ── UNIFIED 2-COLUMN BUILDER (Persistent Live Phone Simulator on Right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── LEFT COLUMN (7 cols): Continuous Workflow Flow (Independent scroll on desktop) ── */}
        <div className="lg:col-span-7 space-y-4 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-3 scrollbar-thin">
          {/* 1. TARGET CONTENT */}
          <div
            onClick={() => {
              if (triggerSource === "comment") {
                setPhoneScreenMode("content")
                setCommentSheetOpen(false)
              } else if (triggerSource === "story") {
                setPhoneScreenMode("content")
              } else {
                setPhoneScreenMode("dm")
              }
            }}
            className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4 transition-colors"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground tracking-tight">1. Select Target Content</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Choose where this automation will listen for incoming engagement.</p>
              </div>
            </div>

            {/* Channel / Trigger Source Selector */}
            <div className="space-y-1.5">
              <FieldLabel>Channel / Trigger Source</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTriggerSource("comment")
                    setMediaTarget({ mode: "none", items: [] })
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    triggerSource === "comment"
                      ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground bg-card"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Film className={`w-3.5 h-3.5 ${triggerSource === "comment" ? "text-accent-yellow" : "text-muted-foreground"}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Post / Reel</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Comments on feed & reels</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTriggerSource("story")
                    setMediaTarget({ mode: "none", items: [] })
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    triggerSource === "story"
                      ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground bg-card"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className={`w-3.5 h-3.5 ${triggerSource === "story" ? "text-accent-yellow" : "text-muted-foreground"}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Stories</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Replies & reactions</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTriggerSource("dm")
                    setMediaTarget({ mode: "all", items: [] })
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                    triggerSource === "dm"
                      ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground bg-card"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Send className={`w-3.5 h-3.5 ${triggerSource === "dm" ? "text-accent-yellow" : "text-muted-foreground"}`} />
                    <span className="text-xs font-bold uppercase tracking-wider">Direct DM</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Keywords in direct inbox</p>
                </button>
              </div>
            </div>

            {/* Target Content Area */}
            {triggerSource === "comment" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <FieldLabel>Automate which post or reel?</FieldLabel>
                    <span className="text-[10px] text-muted-foreground font-normal">Multi-select</span>
                    <button
                      type="button"
                      onClick={() => fetchReels(true)}
                      disabled={loadingReels}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
                      title="Refresh Instagram Feed"
                    >
                      <RotateCcw className={`w-3 h-3 ${loadingReels ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {loadingReels && (
                      <span className="text-[10px] font-mono-ui text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-accent-yellow" />
                        Syncing feed...
                      </span>
                    )}
                    {selectedMedia.length > 0 ? (
                      <span className="text-[10px] font-mono-ui text-accent-yellow flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {selectedMedia.length} {selectedMedia.length === 1 ? "Post" : "Posts"} Selected
                      </span>
                    ) : hasSelectedReelOption ? (
                      <span className="text-[10px] font-mono-ui text-accent-yellow flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        All Posts Selected
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono-ui text-muted-foreground">
                        None selected
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[340px] sm:max-h-[360px] overflow-y-auto pr-1 pb-1">
                  {/* Option: Global Post Rule — ALWAYS available immediately */}
                  <button
                    type="button"
                    onClick={toggleAllMediaTarget}
                    aria-pressed={mediaTarget.mode === "all"}
                    className={`aspect-square rounded-xl border flex flex-col items-center justify-center p-3 text-center transition-all cursor-pointer ${
                      mediaTarget.mode === "all"
                        ? "border-accent-yellow ring-2 ring-accent-yellow/40 bg-accent-yellow/15 text-foreground shadow-sm"
                        : "border-border bg-card hover:border-foreground/30 hover:bg-accent/40"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-accent-blue/15 flex items-center justify-center mb-1.5 text-accent-blue">
                      <Globe className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-foreground">All Posts & Reels</span>
                    <span className="text-[9px] text-muted-foreground mt-0.5 font-mono-ui">Global Trigger</span>
                  </button>

                  {/* Reel Cards */}
                  {reels.filter((r) => r.media_type !== "STORY" && !r.is_story).map((reel) => {
                    const isSelected = selectedMediaIds.includes(String(reel.id))
                    const isVideo = reel.media_type === "VIDEO" || (!reel.media_type && (reel.media_url?.includes(".mp4") || reel.permalink?.includes("/reel/")))
                    // Do not put .mp4 into img src
                    const cover = reel.thumbnail_url || (isVideo ? null : (reel.image_url || reel.media_url || reel.cover_url))
                    return (
                      <button
                        key={reel.id}
                        type="button"
                        onClick={() => toggleMediaTarget(reel)}
                        aria-pressed={isSelected}
                        title={isSelected ? "Deselect post" : "Select post"}
                        className={`aspect-square rounded-xl border overflow-hidden relative group text-left transition-all cursor-pointer bg-neutral-900 ${
                          isSelected
                            ? "border-accent-yellow ring-2 ring-accent-yellow/40 shadow-md"
                            : "border-border hover:border-foreground/40"
                        }`}
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={reel.caption || "Reel Cover"}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none"
                            }}
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-neutral-900 flex flex-col items-center justify-center p-2 text-center">
                            <Film className="w-6 h-6 text-neutral-500 mb-1" />
                            <span className="text-[8px] text-neutral-400 font-mono-ui uppercase tracking-wider line-clamp-1">
                              {reel.media_type === "VIDEO" ? "Reel" : "Post"}
                            </span>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                        {/* Media Type Tag */}
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[8px] font-mono-ui text-white uppercase tracking-wider border border-white/10">
                          {reel.media_type === "STORY" ? "Story" : reel.media_type === "VIDEO" ? "Reel" : "Post"}
                        </span>

                        {/* Selected Check overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-accent-yellow/20 flex items-center justify-center backdrop-blur-[1px]">
                            <div className="w-8 h-8 rounded-full bg-accent-yellow text-black flex items-center justify-center shadow-lg ring-2 ring-accent-yellow">
                              <Check className="w-4 h-4 stroke-[3]" />
                            </div>
                          </div>
                        )}

                        {/* Caption snippet */}
                        <div className="absolute inset-x-0 bottom-0 px-2 pt-4 pb-1.5 pointer-events-none">
                          <p className="text-[10px] text-white line-clamp-1 font-sans drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                            {reel.caption || "Untitled"}
                          </p>
                        </div>
                      </button>
                    )
                  })}

                  {/* Graceful Skeletons while loading first time */}
                  {loadingReels && reels.length === 0 && (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div
                          key={`reel-skel-${i}`}
                          className="aspect-square rounded-xl border border-border/50 bg-muted/20 animate-pulse relative overflow-hidden flex flex-col justify-end p-2.5"
                        >
                          <div className="w-8 h-3 rounded bg-muted/40 mb-1" />
                          <div className="w-14 h-2 rounded bg-muted/30" />
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Empty State Banner if 0 reels returned */}
                {!loadingReels && reels.filter((r) => r.media_type !== "STORY" && !r.is_story).length === 0 && (
                  <div className="p-3.5 rounded-xl border border-dashed border-border bg-card/60 text-center">
                    {isIgConnectedLocal === false ? (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Instagram Account Not Linked</p>
                        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                          To automate replies on your live Instagram reels & posts, connect your Instagram account in Settings.
                        </p>
                        <a
                          href="/dashboard/settings"
                          className="inline-flex items-center gap-1 text-xs font-bold text-accent-yellow hover:underline mt-1"
                        >
                          Open Settings to Connect Instagram →
                        </a>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">No Reels or Posts Found</p>
                        <p className="text-[11px] text-muted-foreground max-w-sm mx-auto leading-relaxed">
                          No posts found yet on this account. You can use <strong>All Posts & Reels</strong> above or upload a new reel on Instagram.
                        </p>
                        <button
                          type="button"
                          onClick={() => fetchReels(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors cursor-pointer mt-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Refresh Feed
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Story Trigger Sub-Options */}
            {triggerSource === "story" && (
              <div className="space-y-3">
                <FieldLabel>Select Story Interaction Type</FieldLabel>
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { key: "reply" as const, icon: <MessageSquare className="w-4 h-4" />, label: "Replies", desc: "Text reply to story" },
                    { key: "reaction" as const, icon: <Heart className="w-4 h-4" />, label: "Reacts", desc: "Emoji reaction" },
                    { key: "mention" as const, icon: <AtSign className="w-4 h-4" />, label: "Mentions", desc: "Tagged in a story" },
                  ]).map(({ key, icon, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStoryTriggerType(key)}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1 transition-all cursor-pointer ${
                        storyTriggerType === key
                          ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground bg-card"
                      }`}
                    >
                      <span className={storyTriggerType === key ? "text-accent-yellow" : "text-muted-foreground"}>{icon}</span>
                      <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </button>
                  ))}
                </div>

                {/* Stories picker */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FieldLabel>Apply to which Story?</FieldLabel>
                      <span className="text-[10px] text-muted-foreground font-normal">Multi-select</span>
                    </div>
                    {selectedMedia.length > 0 ? (
                      <span className="text-[10px] font-mono-ui text-accent-yellow flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {selectedMedia.length} {selectedMedia.length === 1 ? "Story" : "Stories"} Selected
                      </span>
                    ) : hasSelectedReelOption ? (
                      <span className="text-[10px] font-mono-ui text-accent-yellow flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        All Stories Selected
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono-ui text-muted-foreground">
                        None selected
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={toggleAllMediaTarget}
                      aria-pressed={mediaTarget.mode === "all"}
                      className={`aspect-square rounded-xl border flex flex-col items-center justify-center p-2 text-center transition-all cursor-pointer ${
                        mediaTarget.mode === "all"
                          ? "border-accent-yellow ring-2 ring-accent-yellow/30 bg-accent-yellow/10"
                          : "border-border bg-card hover:border-foreground/30"
                      }`}
                    >
                      <Globe className="w-4 h-4 mb-1 text-accent-blue" />
                      <span className="text-[10px] font-bold text-foreground">All Stories</span>
                      <span className="text-[8px] text-muted-foreground mt-0.5">Global</span>
                    </button>
                    {reels.filter((r) => r.media_type === "STORY" || r.is_story).map((story) => {
                      const isSel = selectedMediaIds.includes(String(story.id))
                      const cover = story.thumbnail_url || story.image_url || story.media_url
                      return (
                        <button
                          key={story.id}
                          type="button"
                          onClick={() => toggleMediaTarget(story)}
                          aria-pressed={isSel}
                          title={isSel ? "Deselect story" : "Select story"}
                          className={`aspect-square rounded-xl border overflow-hidden relative group text-left transition-all cursor-pointer ${
                            isSel ? "border-accent-yellow ring-2 ring-accent-yellow/30" : "border-border"
                          }`}
                        >
                          {cover && (
                            <img
                              src={cover}
                              alt="Story"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          )}
                          <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-black/75 text-[8px] font-mono-ui text-white">Story</span>
                          {isSel && (
                            <div className="absolute inset-0 bg-accent-yellow/20 flex items-center justify-center">
                              <div className="w-6 h-6 rounded-full bg-accent-yellow text-black flex items-center justify-center">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Direct DM info box */}
            {triggerSource === "dm" && (
              <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-start gap-3">
                <Send className="w-5 h-5 text-accent-yellow shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Direct Inbox Trigger</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                    This workflow monitors your Instagram Direct Messages. When any incoming DM matches your keywords on the right, the reply sequence is triggered instantly.
                  </p>
                </div>
              </div>
            )}
          </div>

            {/* 2. TRIGGER CONDITIONS */}
            <div
              onClick={() => {
                if (triggerSource === "comment") {
                  setPhoneScreenMode("content")
                  setCommentSheetOpen(true)
                } else if (triggerSource === "story") {
                  setPhoneScreenMode("content")
                } else {
                  setPhoneScreenMode("dm")
                }
              }}
              className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4 transition-colors"
            >
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-bold text-foreground tracking-tight">2. Trigger Conditions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Specify what keywords or actions trigger the response.</p>
              </div>

              {/* Automation Name (Moved from Card 4) */}
              <div className="space-y-1.5 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <FieldLabel>Automation Name</FieldLabel>
                  {userHasEditedName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setUserHasEditedName(false)
                        const isReplyAll = triggerSource === "comment" && commentMatchAll
                        setName(isReplyAll ? "Reply to every comment" : triggers.length > 0 ? `Reply to "${triggers[0]}"` : "")
                      }}
                      className="text-[11px] font-mono-ui text-muted-foreground hover:text-accent-yellow transition-colors cursor-pointer"
                    >
                      Reset to suggested name
                    </button>
                  )}
                </div>
                <TextField
                  value={name}
                  onChange={(val) => {
                    setUserHasEditedName(true)
                    setName(val)
                  }}
                  placeholder='e.g. "Send the free guide" or "Black Friday Promo"'
                />
              </div>

              {/* Comment trigger keyword settings */}
              {triggerSource === "comment" && (
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <FieldLabel>Keyword matching</FieldLabel>
                    <p className="text-[11px] text-muted-foreground">Select how incoming comments should trigger this workflow:</p>

                    {/* Radio Button Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {/* Radio Option 1: All Comments */}
                      <label
                        onClick={(e) => {
                          e.stopPropagation()
                          setCommentMatchAll(true)
                          setTriggers([])
                          setCurrentTriggerDraft("")
                          setPhoneScreenMode("content")
                          setCommentSheetOpen(true)
                        }}
                        className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                          commentMatchAll
                            ? "border-accent-yellow bg-accent-yellow/15 ring-1 ring-accent-yellow/40 shadow-xs"
                            : "border-border bg-card hover:border-foreground/30 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="commentMatchRadio"
                          checked={commentMatchAll}
                          onChange={() => {}}
                          className="mt-0.5 w-4 h-4 text-accent-yellow accent-yellow-400 cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <p className={`text-xs font-bold ${commentMatchAll ? "text-foreground" : "text-foreground/90"}`}>
                            Every Comment (All)
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Reply to every incoming comment on this post.
                          </p>
                        </div>
                      </label>

                      {/* Radio Option 2: Specific Keywords */}
                      <label
                        onClick={(e) => {
                          e.stopPropagation()
                          setCommentMatchAll(false)
                          setPhoneScreenMode("content")
                          setCommentSheetOpen(true)
                        }}
                        className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                          !commentMatchAll
                            ? "border-accent-yellow bg-accent-yellow/15 ring-1 ring-accent-yellow/40 shadow-xs"
                            : "border-border bg-card hover:border-foreground/30 hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <input
                          type="radio"
                          name="commentMatchRadio"
                          checked={!commentMatchAll}
                          onChange={() => {}}
                          className="mt-0.5 w-4 h-4 text-accent-yellow accent-yellow-400 cursor-pointer"
                        />
                        <div className="space-y-0.5">
                          <p className={`text-xs font-bold ${!commentMatchAll ? "text-foreground" : "text-foreground/90"}`}>
                            Specific Keywords
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Only reply when comment contains specific words.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Mode 1: Replying to every comment (Clean matching theme) */}
                  {commentMatchAll ? (
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        setPhoneScreenMode("content")
                        setCommentSheetOpen(true)
                      }}
                      className="p-3.5 rounded-xl border border-border bg-muted/30 flex items-start gap-3 shadow-xs transition-all cursor-pointer hover:border-foreground/30"
                    >
                      <div className="w-8 h-8 rounded-lg bg-accent-yellow/15 flex items-center justify-center text-accent-yellow shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <span>Replying to every comment (All)</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Every incoming comment on this post will receive the automated reply. Select &quot;Specific Keywords&quot; above if you want to filter by keywords.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Mode 2: Specific Keywords (Button-based, no input bar) */
                    <div className="space-y-3 p-3.5 rounded-xl border border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-foreground">Trigger keywords</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Click a keyword to activate. Click &apos;+ Add keyword&apos; to add your own.
                          </p>
                        </div>
                        {keywordSuggestions.length < 4 && !isAddingKeyword && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setIsAddingKeyword(true)
                              setNewKeywordInput("")
                            }}
                            className="text-xs font-bold text-accent-yellow hover:underline flex items-center gap-1 cursor-pointer bg-accent-yellow/10 px-2.5 py-1 rounded-lg border border-accent-yellow/30"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add keyword
                          </button>
                        )}
                      </div>

                      {/* Prominent Trigger Keyword Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {keywordSuggestions.map((kw, idx) => {
                          const isSel = triggers.includes(kw.toLowerCase())
                          const isEditingThis = editingKeywordIndex === idx

                          if (isEditingThis) {
                            return (
                              <div key={idx} className="flex items-center gap-1.5 bg-card border border-accent-yellow/80 rounded-xl p-1.5 shadow-xs">
                                <input
                                  type="text"
                                  value={editingKeywordText}
                                  onChange={(e) => setEditingKeywordText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault()
                                      handleSaveEditKeyword(idx)
                                    } else if (e.key === "Escape") {
                                      setEditingKeywordIndex(null)
                                    }
                                  }}
                                  autoFocus
                                  className="bg-transparent text-xs sm:text-sm text-foreground px-2 py-0.5 w-28 outline-none font-semibold"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditKeyword(idx)}
                                  className="p-1 hover:bg-accent-yellow/20 text-accent-yellow rounded-lg cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingKeywordIndex(null)}
                                  className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )
                          }

                          return (
                            <div
                              key={kw + idx}
                              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold border transition-all shadow-xs ${
                                isSel
                                  ? "bg-accent-yellow text-black border-accent-yellow ring-2 ring-accent-yellow/50 scale-102"
                                  : "bg-card text-foreground border-border hover:border-accent-yellow/60 hover:bg-muted/40"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleKeywordSuggestion(kw)
                                }}
                                className="flex items-center gap-1.5 cursor-pointer"
                                title={isSel ? "Click to deactivate keyword" : "Click to activate keyword"}
                              >
                                <span>{kw}</span>
                                {isSel && <Check className="w-3.5 h-3.5 text-black stroke-[3]" />}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartEditKeyword(idx)
                                }}
                                className={`p-0.5 rounded cursor-pointer transition-colors ${
                                  isSel ? "text-black/70 hover:text-black hover:bg-black/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                }`}
                                title="Edit keyword"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteKeywordSuggestion(idx)
                                }}
                                className={`p-0.5 rounded cursor-pointer transition-colors ${
                                  isSel ? "text-black/70 hover:text-black hover:bg-black/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                }`}
                                title="Delete keyword"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )
                        })}

                        {isAddingKeyword && (
                          <div className="flex items-center gap-1.5 bg-card border border-accent-yellow/80 rounded-xl p-1.5 shadow-xs">
                            <input
                              type="text"
                              value={newKeywordInput}
                              onChange={(e) => setNewKeywordInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  handleAddKeywordSuggestion()
                                } else if (e.key === "Escape") {
                                  setIsAddingKeyword(false)
                                }
                              }}
                              placeholder="New keyword..."
                              autoFocus
                              className="bg-transparent text-xs sm:text-sm text-foreground px-2 py-0.5 w-28 outline-none font-semibold"
                            />
                            <button
                              type="button"
                              onClick={handleAddKeywordSuggestion}
                              className="p-1 hover:bg-accent-yellow/20 text-accent-yellow rounded-lg cursor-pointer"
                              title="Add"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddingKeyword(false)}
                              className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-foreground rounded-lg cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Story trigger keyword/emoji settings */}
              {triggerSource === "story" && (
                <div className="space-y-3">
                  {storyTriggerType === "reply" && (
                    <div className="space-y-2">
                      <FieldLabel>Keywords in story reply (Optional)</FieldLabel>
                      <p className="text-[11px] text-muted-foreground">
                        Leave empty to reply to <span className="text-accent-yellow font-semibold">ALL story replies</span>, or enter specific keywords.
                      </p>
                      <TagInput
                        value={triggers}
                        onChange={(newTriggers) => {
                          setTriggers(newTriggers)
                          setPhoneScreenMode("content")
                        }}
                        onInputChange={(val) => {
                          setCurrentTriggerDraft(val)
                          setPhoneScreenMode("content")
                        }}
                        onFocus={() => setPhoneScreenMode("content")}
                        placeholder="e.g. link, price, yes (leave empty for all)"
                      />
                    </div>
                  )}

                  {storyTriggerType === "reaction" && (
                    <div className="space-y-2">
                      <FieldLabel>Emojis to match (Optional)</FieldLabel>
                      <p className="text-[11px] text-muted-foreground">
                        Leave empty to trigger on <span className="text-accent-yellow font-semibold">ANY emoji reaction</span>, or specify emojis below.
                      </p>
                      <TagInput
                        value={triggers}
                        onChange={(newTriggers) => {
                          setTriggers(newTriggers)
                          setPhoneScreenMode("content")
                        }}
                        onInputChange={(val) => {
                          setCurrentTriggerDraft(val)
                          setPhoneScreenMode("content")
                        }}
                        onFocus={() => setPhoneScreenMode("content")}
                        placeholder="e.g. ❤️, 🔥, 👏 (leave empty for any)"
                      />
                    </div>
                  )}

                  {storyTriggerType === "mention" && (
                    <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-accent-yellow/15 flex items-center justify-center text-accent-yellow shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Trigger on All Story Mentions</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          Whenever someone mentions or tags your Instagram account in their story, this workflow will automatically send your configured DM.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Direct DM trigger keyword settings */}
              {triggerSource === "dm" && (
                <div className="space-y-2">
                  <FieldLabel>Keywords in Direct Message *</FieldLabel>
                  <p className="text-[11px] text-muted-foreground">
                    Matches incoming keywords or phrases (case-insensitive).
                  </p>
                  <TagInput
                    value={triggers}
                    onChange={(newTriggers) => {
                      setTriggers(newTriggers)
                      setPhoneScreenMode("dm")
                    }}
                    onInputChange={(val) => {
                      setCurrentTriggerDraft(val)
                      setPhoneScreenMode("dm")
                    }}
                    onFocus={() => setPhoneScreenMode("dm")}
                    placeholder="type keyword, press Enter (e.g. price, guide)"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground font-mono-ui">Suggestions:</span>
                    {keywordSuggestions.map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleKeyword(kw)
                          setPhoneScreenMode("dm")
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-all cursor-pointer ${
                          triggers.includes(kw)
                            ? "bg-accent-yellow text-black font-semibold shadow-xs"
                            : "bg-muted hover:bg-accent text-muted-foreground border border-border"
                        }`}
                      >
                        +{kw}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Multi-Post Trigger Configuration */}
              {selectedMedia.length > 1 && !isEditing && !commentMatchAll && (triggerSource === "comment" || (triggerSource === "story" && storyTriggerType === "reply")) && (
                <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4 space-y-3.5 shadow-xs">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-1 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-accent-yellow/15 flex items-center justify-center text-accent-yellow shrink-0">
                        <Sliders className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          Trigger Mode for {selectedMedia.length} {triggerSource === "story" ? "Stories" : "Posts"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Configure trigger keywords for each post below. If unselected, that post inherits the default (<span className="text-foreground font-semibold">{triggers.length > 0 ? triggers[0] : "default"}</span>).
                        </p>
                      </div>
                    </div>
                    {customOverrideCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setMediaTriggerOverrides({})
                        }}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      >
                        Reset all
                      </button>
                    )}
                  </div>

                  {/* Individual Keywords per Post View */}
                  <div className="max-h-[460px] overflow-y-auto space-y-2.5 pr-1">
                        {selectedMedia.map((media: any, idx: number) => {
                          const mediaId = String(media.id)
                          const customVal = mediaTriggerOverrides[mediaId] ?? ""
                          const isCustom = customVal.trim().length > 0
                          const cover = media.thumbnail_url || media.image_url || media.media_url || media.cover_url
                          const cleanCaption = (media.caption || "").replace(/[\r\n\t]+/g, " ").trim()
                          const isActivePreview = previewMediaIndex === idx
                          const fallbackPlaceholder = triggers.length > 0 ? `Inherits: "${triggers[0]}"` : "e.g. price"

                          return (
                            <div
                              key={mediaId}
                              onClick={() => setPreviewMediaIndex(idx)}
                              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                                isActivePreview
                                  ? "border-accent-yellow/80 bg-accent-yellow/5 ring-1 ring-accent-yellow/30 shadow-xs"
                                  : "border-border/80 bg-muted/20 hover:border-foreground/30 hover:bg-muted/30"
                              }`}
                            >
                              {/* Top row: Thumbnail + Title + Active Preview indicator */}
                              <div className="flex items-center justify-between gap-2.5 mb-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-9 h-9 rounded-lg bg-neutral-900 border border-border/80 overflow-hidden shrink-0 relative flex items-center justify-center">
                                    {cover ? (
                                      <img
                                        src={cover}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLElement).style.display = "none"
                                        }}
                                      />
                                    ) : (
                                      <Film className="w-4 h-4 text-neutral-500" />
                                    )}
                                    <span className="absolute bottom-0 right-0 px-1 rounded-tl bg-black/80 text-[7px] font-mono-ui text-white">
                                      #{idx + 1}
                                    </span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground truncate" title={cleanCaption || `Item #${idx + 1}`}>
                                      {cleanCaption || `${triggerSource === "story" ? "Story" : "Post"} #${idx + 1}`}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      {isCustom ? (
                                        <span className="text-[9px] font-mono-ui font-bold text-accent-yellow bg-accent-yellow/15 px-1.5 py-0.2 rounded">
                                          Trigger: &quot;{customVal}&quot;
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-mono-ui text-muted-foreground">
                                          Inherits: <span className="text-foreground/80">{triggers.length > 0 ? `"${triggers[0]}"` : "Default"}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-1">
                                  {isActivePreview ? (
                                    <span className="text-[9px] font-mono-ui font-semibold text-accent-yellow flex items-center gap-1 bg-accent-yellow/10 px-2 py-0.5 rounded-full border border-accent-yellow/30">
                                      <Smartphone className="w-2.5 h-2.5" />
                                      Phone Preview
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPreviewMediaIndex(idx)
                                      }}
                                      className="text-[9px] font-mono-ui text-muted-foreground hover:text-foreground flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted cursor-pointer"
                                    >
                                      Preview →
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Trigger Keyword Selector (No input bar) */}
                              <div className="flex flex-wrap items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                                <span className="text-[10px] font-mono-ui uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
                                  Trigger:
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {keywordSuggestions.map((kw) => {
                                    const isSelected = (customVal || (triggers.length > 0 ? triggers[0] : "")).toLowerCase() === kw.toLowerCase()
                                    return (
                                      <button
                                        key={kw}
                                        type="button"
                                        onClick={() => {
                                          setMediaTriggerOverrides((prev) => ({
                                            ...prev,
                                            [mediaId]: kw,
                                          }))
                                        }}
                                        className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                                          isSelected
                                            ? "bg-accent-yellow text-black ring-2 ring-accent-yellow/60 font-black scale-102"
                                            : "bg-muted/70 hover:bg-muted text-foreground border border-border/80 hover:border-accent-yellow/50"
                                        }`}
                                      >
                                        <span>{kw}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3] text-black" />}
                                      </button>
                                    )
                                  })}

                                  {/* Allow adding custom keyword inline */}
                                  {isAddingCustomForMedia === mediaId ? (
                                    <div className="flex items-center gap-1 bg-card border border-accent-yellow/60 rounded-lg p-1 shadow-xs">
                                      <input
                                        type="text"
                                        value={newCustomKeyword}
                                        onChange={(e) => setNewCustomKeyword(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault()
                                            const trimmed = newCustomKeyword.trim().toLowerCase()
                                            if (trimmed) {
                                              if (!keywordSuggestions.includes(trimmed)) {
                                                setKeywordSuggestions([...keywordSuggestions, trimmed])
                                              }
                                              setMediaTriggerOverrides((prev) => ({ ...prev, [mediaId]: trimmed }))
                                              setNewCustomKeyword("")
                                              setIsAddingCustomForMedia(null)
                                            }
                                          } else if (e.key === "Escape") {
                                            setIsAddingCustomForMedia(null)
                                          }
                                        }}
                                        autoFocus
                                        placeholder="keyword..."
                                        className="bg-transparent text-xs text-foreground px-2 py-0.5 w-24 outline-none font-medium"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const trimmed = newCustomKeyword.trim().toLowerCase()
                                          if (trimmed) {
                                            if (!keywordSuggestions.includes(trimmed)) {
                                              setKeywordSuggestions([...keywordSuggestions, trimmed])
                                            }
                                            setMediaTriggerOverrides((prev) => ({ ...prev, [mediaId]: trimmed }))
                                            setNewCustomKeyword("")
                                            setIsAddingCustomForMedia(null)
                                          }
                                        }}
                                        className="p-1 hover:bg-accent-yellow/20 text-accent-yellow rounded cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setIsAddingCustomForMedia(null)}
                                        className="p-1 hover:bg-destructive/20 text-muted-foreground rounded cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsAddingCustomForMedia(mediaId)
                                        setNewCustomKeyword("")
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-accent-yellow hover:text-accent-yellow/80 hover:bg-accent-yellow/10 border border-dashed border-accent-yellow/40 flex items-center gap-1 cursor-pointer transition-colors"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add keyword</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                </div>
              )}
            </div>

            {/* 3. CONFIGURE REPLY */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground tracking-tight">3. Configure Reply</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize your private DM message and optional public comment replies.</p>
                </div>
              </div>

            {/* Multi-Post Horizontal Reply Selector Bar */}
            {selectedMedia.length > 1 && (
              <div className="bg-muted/25 border border-border/80 rounded-xl p-3 sm:p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-accent-yellow/15 flex items-center justify-center text-accent-yellow shrink-0">
                      <Sliders className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        Configure Reply for {selectedMedia.length} {triggerSource === "story" ? "Stories" : "Reels"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedReplyTarget === "all"
                          ? "Editing shared reply template. Click any reel to configure its unique response."
                          : `Editing unique response for Reel #${previewMediaIndex + 1}.`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Horizontal Selector: "Same for all" button + Each Post button */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar">
                  {/* Button 1: Same for all */}
                  <button
                    type="button"
                    onClick={() => handleSelectReplyTarget("all")}
                    className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedReplyTarget === "all"
                        ? "border-accent-yellow bg-accent-yellow text-black font-bold shadow-xs ring-2 ring-accent-yellow/50"
                        : "border-border/80 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedReplyTarget === "all" ? "bg-black/20 text-black" : "bg-accent-yellow/15 text-accent-yellow"
                    }`}>
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 pr-1">
                      <p className={`text-xs font-bold leading-tight ${selectedReplyTarget === "all" ? "text-black" : "text-foreground"}`}>
                        Same for all
                      </p>
                      <p className={`text-[10px] font-mono-ui ${selectedReplyTarget === "all" ? "text-black/80" : "text-muted-foreground"}`}>
                        {selectedMedia.length} posts
                      </p>
                    </div>
                  </button>

                  {/* Buttons for each individual post */}
                  {selectedMedia.map((media: any, idx: number) => {
                    const mId = String(media.id)
                    const isSelected = selectedReplyTarget === mId
                    const cover = media.thumbnail_url || media.image_url || media.media_url || media.cover_url
                    const cleanCaption = (media.caption || "").replace(/[\r\n\t]+/g, " ").trim()
                    const hasCustomReply = Boolean(reelReplyConfigs[mId])

                    return (
                      <button
                        key={mId}
                        type="button"
                        onClick={() => handleSelectReplyTarget(mId)}
                        className={`shrink-0 flex items-center gap-2 p-1.5 pr-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-2 ring-accent-yellow/50 shadow-xs"
                            : "border-border/80 bg-card hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-border/60 overflow-hidden shrink-0 relative flex items-center justify-center">
                          {cover ? (
                            <img src={cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Film className="w-3.5 h-3.5 text-neutral-500" />
                          )}
                          <span className="absolute bottom-0 right-0 px-1 rounded-tl bg-black/80 text-[7px] font-mono-ui text-white">
                            #{idx + 1}
                          </span>
                        </div>
                        <div className="min-w-0 max-w-[130px]">
                          <p className="text-[11px] font-bold text-foreground truncate">
                            {cleanCaption || `Post #${idx + 1}`}
                          </p>
                          <div className="flex items-center gap-1 text-[9px] font-mono-ui">
                            {hasCustomReply ? (
                              <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                                <Check className="w-2.5 h-2.5 stroke-[3]" /> Custom reply
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Default reply</span>
                            )}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Status Indicator banner when editing a specific reel */}
                {selectedReplyTarget !== "all" && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-accent-yellow/10 border border-accent-yellow/30 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-accent-yellow shrink-0 animate-pulse" />
                      <span className="font-semibold text-foreground shrink-0">
                        Configuring Reel #{previewMediaIndex + 1}:
                      </span>
                      <span className="text-accent-yellow font-medium truncate">
                        {(selectedMedia[previewMediaIndex]?.caption || "").slice(0, 40) || `Post #${previewMediaIndex + 1}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (defaultReplyConfigRef.current) {
                          applyConfigToForm(defaultReplyConfigRef.current)
                        }
                        setReelReplyConfigs((prev) => {
                          const copy = { ...prev }
                          delete copy[selectedReplyTarget]
                          return copy
                        })
                        toast.info(`Reset Reel #${previewMediaIndex + 1} to match "Same for all"`)
                      }}
                      className="text-[11px] font-semibold text-accent-yellow hover:underline cursor-pointer shrink-0 ml-2"
                    >
                      Reset to &quot;Same for all&quot;
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Comment Flow Direction */}
            {triggerSource === "comment" && (
              <div className="space-y-1.5">
                <FieldLabel>Flow Direction</FieldLabel>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "both" as const, label: "Reply + DM", desc: "Public comment + Inbox" },
                    { key: "dm_only" as const, label: "DM only", desc: "Private inbox message" },
                    { key: "public_only" as const, label: "Reply only", desc: "Public comment only" },
                  ]).map(({ key, label, desc }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setReplyMode(key)
                        if (key === "public_only") {
                          setPhoneScreenMode("content")
                          setCommentSheetOpen(true)
                        } else {
                          setPhoneScreenMode("dm")
                          setCommentSheetOpen(false)
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        replyMode === key
                          ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card"
                      }`}
                    >
                      <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Public comment reply (1 reply per user) */}
            {triggerSource === "comment" && replyMode !== "dm_only" && (
              <div
                onClick={() => {
                  setPhoneScreenMode("content")
                  setCommentSheetOpen(true)
                }}
                onFocusCapture={() => {
                  setPhoneScreenMode("content")
                  setCommentSheetOpen(true)
                }}
                className="space-y-2.5 bg-muted/30 p-3.5 rounded-xl border border-border transition-colors hover:border-accent-yellow/40 focus-within:border-accent-yellow/50"
              >
                <div className="flex items-center justify-between">
                  <FieldLabel>Public comment reply</FieldLabel>
                  <span className="text-[10px] font-mono-ui text-accent-yellow font-semibold bg-accent-yellow/10 px-2 py-0.5 rounded-md border border-accent-yellow/30">
                    1 reply per user
                  </span>
                </div>
                {/* Customizable Reply Suggestions (Click sets the single reply) */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-accent-yellow" />
                      <span className="text-xs font-semibold text-foreground">Reply Suggestions</span>
                      <span className="text-[10px] text-muted-foreground font-mono-ui">({publicSuggestions.length}/4 max)</span>
                    </div>
                    {publicSuggestions.length < 4 && !isAddingPublic && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsAddingPublic(true)
                          setNewPublicInput("")
                        }}
                        className="text-[11px] font-semibold text-accent-yellow hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add suggestion
                      </button>
                    )}
                  </div>

                  {/* Suggestion Chips */}
                  <div className="flex flex-wrap items-center gap-2">
                    {publicSuggestions.map((text, idx) => {
                      const isSel = publicReply.trim() === text.trim()
                      const isEditingThis = editingPublicIndex === idx

                      if (isEditingThis) {
                        return (
                          <div key={idx} className="flex items-center gap-1 bg-card border border-accent-yellow/60 rounded-lg p-1 shadow-xs w-full sm:w-auto">
                            <input
                              type="text"
                              value={editingPublicText}
                              onChange={(e) => setEditingPublicText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault()
                                  handleSaveEditPublic(idx)
                                } else if (e.key === "Escape") {
                                  setEditingPublicIndex(null)
                                }
                              }}
                              autoFocus
                              className="bg-transparent text-xs text-foreground px-2 py-0.5 flex-1 min-w-[200px] outline-none font-medium"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditPublic(idx)}
                              className="p-1 hover:bg-accent-yellow/20 text-accent-yellow rounded cursor-pointer"
                              title="Save"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPublicIndex(null)}
                              className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-foreground rounded cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={text + idx}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                            isSel
                              ? "bg-accent-yellow text-black border-accent-yellow font-bold shadow-xs ring-1 ring-accent-yellow/50"
                              : "bg-card text-foreground border-border hover:border-foreground/30 hover:bg-muted/40"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePublicSuggestion(text)
                            }}
                            className="flex items-center gap-1 cursor-pointer text-left"
                            title={isSel ? "Active public reply (click to clear)" : "Click to select as public reply"}
                          >
                            <span>{text}</span>
                            {isSel && <Check className="w-3 h-3 text-black stroke-[3]" />}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartEditPublic(idx)
                            }}
                            className={`p-0.5 rounded cursor-pointer transition-colors ${
                              isSel ? "text-black/70 hover:text-black hover:bg-black/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                            title="Edit suggestion"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeletePublicSuggestion(idx)
                            }}
                            className={`p-0.5 rounded cursor-pointer transition-colors ${
                              isSel ? "text-black/70 hover:text-black hover:bg-black/10" : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            }`}
                            title="Delete suggestion"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )
                    })}

                    {isAddingPublic && (
                      <div className="flex items-center gap-1 bg-card border border-accent-yellow/60 rounded-lg p-1 shadow-xs w-full sm:w-auto">
                        <input
                          type="text"
                          value={newPublicInput}
                          onChange={(e) => setNewPublicInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              handleAddPublicSuggestion()
                            } else if (e.key === "Escape") {
                              setIsAddingPublic(false)
                            }
                          }}
                          placeholder='e.g. "Sent to your DM! 🚀"'
                          autoFocus
                          className="bg-transparent text-xs text-foreground px-2 py-0.5 flex-1 min-w-[200px] outline-none font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleAddPublicSuggestion}
                          className="p-1 hover:bg-accent-yellow/20 text-accent-yellow rounded cursor-pointer"
                          title="Add"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingPublic(false)}
                          className="p-1 hover:bg-destructive/20 text-muted-foreground hover:text-foreground rounded cursor-pointer"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* DM Message Configuration */}
            {replyMode !== "public_only" && (
              <div
                onClick={showPayloadStage}
                onFocusCapture={showPayloadStage}
                className="space-y-4 pt-1"
              >
                {/* Format Pills */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <FieldLabel>Direct Message Format</FieldLabel>
                    <span className="text-[10px] font-mono-ui text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 rounded border border-accent-yellow/20">
                      Live on simulator
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "text" as const, icon: <MessageCircle className="w-3.5 h-3.5" />, label: "Text Only" },
                      { key: "card" as const, icon: <Link2 className="w-3.5 h-3.5" />, label: "Card / Link" },
                      { key: "media" as const, icon: <ImageIcon className="w-3.5 h-3.5" />, label: "Rich Media" },
                    ]).map(({ key, icon, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setType(key)
                          showPayloadStage()
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          type === key
                            ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card"
                        }`}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text Only Editor */}
                {type === "text" && (
                  <div className="space-y-1.5">
                    <FieldLabel>DM Message Text</FieldLabel>
                    <textarea
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value)
                        showPayloadStage()
                      }}
                      onFocus={showPayloadStage}
                      rows={4}
                      maxLength={1000}
                      className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-3 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-accent-yellow/50 transition-colors"
                      placeholder="Type the message to send in DMs... (e.g. Hey! Here is the free guide you requested: https://...)"
                    />
                    <p className="font-mono-ui text-[10px] text-muted-foreground text-right">{messageText.length}/1000</p>
                  </div>
                )}

                {/* Card Editor */}
                {type === "card" && (
                  <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                    {/* 1. Card Basic Information */}
                    <div className="bg-muted/20 border border-border/80 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-accent-yellow" /> Card Details
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono-ui">Shown in Instagram DM</span>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-foreground block">
                            Card Title <span className="text-accent-yellow">*</span>
                          </label>
                          <TextField
                            value={cardTitle}
                            onChange={(val) => {
                              setCardTitle(val)
                              showPayloadStage()
                            }}
                            onFocus={showPayloadStage}
                            placeholder="e.g. Free Instagram Growth Blueprint"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-foreground block">
                            Subtitle Description (Optional)
                          </label>
                          <TextField
                            value={cardSubtitle}
                            onChange={(val) => {
                              setCardSubtitle(val)
                              showPayloadStage()
                            }}
                            onFocus={showPayloadStage}
                            placeholder="e.g. Tap below to download the step-by-step PDF guide"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 2. Card Cover Image (Upload or Web URL) */}
                    <div className="bg-muted/20 border border-border/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
                      <MediaUploadOrUrlInput
                        mediaType="image"
                        value={cardImage}
                        onChange={(url) => {
                          setCardImage(url)
                          showPayloadStage()
                        }}
                        label="Card Cover Image"
                        helperText="Strictly images (PNG, JPG, WEBP, GIF)"
                        userId={userId}
                      />
                    </div>

                    {/* 3. Interactive Buttons */}
                    <div className="bg-muted/20 border border-border/80 rounded-xl p-3.5 sm:p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/60 pb-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-foreground">Interactive Buttons</span>
                          <span className="text-[10px] text-muted-foreground font-mono-ui">({buttons.length}/3 max)</span>
                        </div>
                        <button
                          type="button"
                          onClick={addButton}
                          disabled={buttons.length >= 3}
                          className="text-xs font-semibold text-accent-yellow hover:underline disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add button
                        </button>
                      </div>

                      {buttons.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-1">
                          No buttons added yet. Click &quot;Add button&quot; to include clickable links in this card.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {buttons.map((btn, idx) => (
                            <div
                              key={btn.id}
                              className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-card p-2.5 rounded-lg border border-border"
                            >
                              <span className="text-[10px] font-mono-ui font-bold text-muted-foreground shrink-0 w-6">
                                #{idx + 1}
                              </span>
                              <input
                                value={btn.title}
                                onChange={(e) => updateButton(btn.id, "title", e.target.value)}
                                className="h-8 text-xs flex-1 bg-muted/40 border border-border/60 rounded px-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-yellow/50"
                                placeholder="Button label (e.g. Download Guide)"
                              />
                              <input
                                value={btn.url || ""}
                                onChange={(e) => updateButton(btn.id, "url", e.target.value)}
                                className="h-8 text-xs flex-1 bg-muted/40 border border-border/60 rounded px-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-yellow/50 font-mono-ui"
                                placeholder="https://yourlink.com"
                              />
                              <button
                                type="button"
                                onClick={() => removeButton(btn.id)}
                                className="self-end sm:self-center text-muted-foreground hover:text-red-400 p-1.5 transition-colors cursor-pointer rounded hover:bg-red-500/10"
                                title="Remove button"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Rich Media Editor */}
                {type === "media" && (
                  <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                    {/* Media Type Selector */}
                    <div className="space-y-2">
                      <FieldLabel>Select Rich Media Type</FieldLabel>
                      <div className="grid grid-cols-3 gap-2.5">
                        {([
                          { key: "image" as const, icon: <ImageIcon className="w-4 h-4" />, label: "Image", desc: "JPG, PNG, WEBP, GIF" },
                          { key: "video" as const, icon: <Film className="w-4 h-4" />, label: "Video", desc: "MP4, MOV, WebM" },
                          { key: "audio" as const, icon: <Music2 className="w-4 h-4" />, label: "Audio", desc: "MP3, WAV, Voice note" },
                        ]).map((item) => {
                          const isSelected = mediaType === item.key
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                setMediaType(item.key)
                                setMediaUrl("")
                                showPayloadStage()
                              }}
                              className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                                isSelected
                                  ? "border-accent-yellow bg-accent-yellow/15 text-foreground ring-1 ring-accent-yellow/40 shadow-xs"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-card"
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className={isSelected ? "text-accent-yellow" : "text-muted-foreground"}>{item.icon}</span>
                                <span className="text-xs font-bold">{item.label}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground font-mono-ui leading-tight">{item.desc}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Media Asset Uploader or Web URL */}
                    <div className="bg-muted/20 border border-border/80 rounded-xl p-3.5 sm:p-4 shadow-xs">
                      <MediaUploadOrUrlInput
                        key={mediaType}
                        mediaType={mediaType}
                        value={mediaUrl}
                        onChange={(url) => {
                          setMediaUrl(url)
                          showPayloadStage()
                        }}
                        label={`${mediaType.toUpperCase()} Payload`}
                        helperText="Upload your file or paste direct public URL"
                        userId={userId}
                      />
                    </div>

                    {/* Optional Accompanying Caption */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">Accompanying Caption (Optional)</label>
                        <span className="font-mono-ui text-[10px] text-muted-foreground">{messageText.length}/500</span>
                      </div>
                      <textarea
                        value={messageText}
                        onChange={(e) => {
                          setMessageText(e.target.value)
                          showPayloadStage()
                        }}
                        onFocus={showPayloadStage}
                        rows={2}
                        maxLength={500}
                        className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-accent-yellow/50 transition-colors"
                        placeholder={`Optional text caption sent alongside this ${mediaType}...`}
                      />
                    </div>
                  </div>
                )}

                {/* Quick Reply Chips */}
                {type !== "card" && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between border-b border-border pb-1.5">
                      <FieldLabel>Quick Reply chips ({quickReplies.length}/4)</FieldLabel>
                      <button
                        type="button"
                        onClick={addQuickReply}
                        disabled={quickReplies.length >= 4}
                        className="font-mono-ui text-[10px] text-accent-yellow hover:underline disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add chip
                      </button>
                    </div>
                    {quickReplies.length > 0 && (
                      <div className="space-y-1.5">
                        {quickReplies.map((q) => (
                          <div key={q.id} className="flex gap-2 items-center">
                            <input
                              value={q.title}
                              onChange={(e) => updateQuickReply(q.id, e.target.value)}
                              onFocus={showPayloadStage}
                              maxLength={20}
                              className="h-9 text-xs flex-1 bg-muted/30 border border-border rounded-lg px-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-yellow/50"
                              placeholder='e.g. "Send Details!"'
                            />
                            <button
                              type="button"
                              onClick={() => removeQuickReply(q.id)}
                              className="text-muted-foreground hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            </div>

            {/* 4. DELIVERY OPTIONS & PREFERENCES */}
            <div
              onClick={() => {
                setPhoneScreenMode("dm")
                setCommentSheetOpen(false)
                setSimStage(0)
              }}
              className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4 transition-colors"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground tracking-tight">4. Delivery Options & Preferences</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Configure initial greeting interaction, follower verification gating, and delivery options.</p>
                </div>
              </div>

              {/* A. INITIAL GREETING & REQUEST CARD (DEFAULT ACTIVATED) */}
              <div className="space-y-3.5 p-3.5 sm:p-4 rounded-xl border border-border/80 bg-muted/20 shadow-xs">
                <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-accent-yellow" /> Initial Greeting & Request Card
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Default Active
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Sent automatically as the initial private reply in Instagram DM to open the 24-hour messaging window upon commenter interaction.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPhoneScreenMode("dm")
                      setCommentSheetOpen(false)
                      setSimStage(0)
                      toast.info("Viewing Initial Greeting & Request Card in live preview")
                    }}
                    className="text-[10px] font-mono-ui text-accent-yellow bg-accent-yellow/10 hover:bg-accent-yellow/20 px-2 py-0.5 rounded border border-accent-yellow/20 shrink-0 cursor-pointer transition-colors"
                  >
                    View on simulator →
                  </button>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground font-medium">Greeting Card Title</label>
                      <span className={`text-[10px] font-mono-ui ${initialTitle.length > 80 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {initialTitle.length}/80
                      </span>
                    </div>
                    <input
                      value={initialTitle}
                      onChange={(e) => {
                        setInitialTitle(e.target.value)
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      onFocus={() => {
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      maxLength={80}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                      placeholder="Hey there! Thanks so much for your interest 😊"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground font-medium">Greeting Card Subtitle</label>
                      <span className={`text-[10px] font-mono-ui ${initialSubtitle.length > 80 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {initialSubtitle.length}/80
                      </span>
                    </div>
                    <input
                      value={initialSubtitle}
                      onChange={(e) => {
                        setInitialSubtitle(e.target.value)
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      onFocus={() => {
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      maxLength={80}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                      placeholder="Click below and I'll send you the link in just a sec ✨"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-muted-foreground font-medium">Request Button Label</label>
                      <span className={`text-[10px] font-mono-ui ${initialButtonText.length > 20 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                        {initialButtonText.length}/20
                      </span>
                    </div>
                    <input
                      value={initialButtonText}
                      onChange={(e) => {
                        setInitialButtonText(e.target.value)
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      onFocus={() => {
                        setPhoneScreenMode("dm")
                        setSimStage(0)
                      }}
                      maxLength={20}
                      className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                      placeholder="Send me the link"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Commenter taps this to trigger delivery &amp; open the 24-hour messaging window.
                    </p>
                  </div>
                </div>
              </div>

              {/* B. NON-FOLLOWER GATE (OPTIONAL GATEWAY) */}
              <div className="space-y-3.5 p-3.5 sm:p-4 rounded-xl border border-border/80 bg-muted/20 shadow-xs">
                <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-2.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-accent-yellow" /> Non-Follower Gate
                      </span>
                      <span className="text-[10px] font-mono-ui text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                        Optional
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Require commenters to follow your Instagram profile before unlocking the payload. Non-followers get a follow challenge card first.
                    </p>
                  </div>
                </div>

                <ToggleRow
                  icon={<Lock className="w-4 h-4" />}
                  title="Enable Follow Gate"
                  sub="When enabled, commenters who don't follow you yet receive a follow prompt before unlocking the payload."
                  on={checkFollow}
                  onToggle={() => {
                    const next = !checkFollow
                    setCheckFollow(next)
                    setPhoneScreenMode("dm")
                    setCommentSheetOpen(false)
                    setSimStage(0)
                  }}
                />

                {checkFollow ? (
                  <div className="space-y-3.5 p-3.5 rounded-xl border border-accent-yellow/30 bg-accent-yellow/5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between border-b border-accent-yellow/20 pb-2">
                      <div>
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Sliders className="w-3.5 h-3.5 text-accent-yellow" /> Non-Follower Gate Customization
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Configure the challenge card shown to non-followers when they tap &quot;{initialButtonText}&quot;.
                        </p>
                      </div>
                      <span className="text-[10px] font-mono-ui text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 rounded border border-accent-yellow/20">
                        Live on simulator
                      </span>
                    </div>

                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-muted-foreground font-medium">Follow Gate Title</label>
                          <span className={`text-[10px] font-mono-ui ${followGateTitle.length > 80 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                            {followGateTitle.length}/80
                          </span>
                        </div>
                        <input
                          value={followGateTitle}
                          onChange={(e) => {
                            setFollowGateTitle(e.target.value)
                            setPhoneScreenMode("dm")
                            setSimStage(1)
                          }}
                          onFocus={() => {
                            setPhoneScreenMode("dm")
                            setSimStage(1)
                          }}
                          maxLength={80}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                          placeholder="Oh no! It seems you're not following me 👀"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-muted-foreground font-medium">Follow Gate Subtitle / Instructions</label>
                          <span className={`text-[10px] font-mono-ui ${followGateSubtitle.length > 80 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                            {followGateSubtitle.length}/80
                          </span>
                        </div>
                        <input
                          value={followGateSubtitle}
                          onChange={(e) => {
                            setFollowGateSubtitle(e.target.value)
                            setPhoneScreenMode("dm")
                            setSimStage(1)
                          }}
                          onFocus={() => {
                            setPhoneScreenMode("dm")
                            setSimStage(1)
                          }}
                          maxLength={80}
                          className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                          placeholder="Follow my profile first, then tap below to get your link! ✨"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Tip: Use &#123;username&#125; to automatically insert your Instagram handle.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-muted-foreground font-medium">Profile Button</label>
                            <span className={`text-[10px] font-mono-ui ${followGateButtonFollow.length > 20 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                              {followGateButtonFollow.length}/20
                            </span>
                          </div>
                          <input
                            value={followGateButtonFollow}
                            onChange={(e) => {
                              setFollowGateButtonFollow(e.target.value)
                              setPhoneScreenMode("dm")
                              setSimStage(1)
                            }}
                            onFocus={() => {
                              setPhoneScreenMode("dm")
                              setSimStage(1)
                            }}
                            maxLength={20}
                            className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                            placeholder="Visit Profile"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-muted-foreground font-medium">Unlock Button</label>
                            <span className={`text-[10px] font-mono-ui ${followGateButtonUnlock.length > 20 ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                              {followGateButtonUnlock.length}/20
                            </span>
                          </div>
                          <input
                            value={followGateButtonUnlock}
                            onChange={(e) => {
                              setFollowGateButtonUnlock(e.target.value)
                              setPhoneScreenMode("dm")
                              setSimStage(1)
                            }}
                            onFocus={() => {
                              setPhoneScreenMode("dm")
                              setSimStage(1)
                            }}
                            maxLength={20}
                            className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-accent-yellow transition-colors"
                            placeholder="I'm following ✅"
                          />
                        </div>
                      </div>

                      <MediaUploadOrUrlInput
                        mediaType="image"
                        label="Hero / Teaser Media (Optional)"
                        helperText="Upload or paste an image URL displayed on top of the follow gate card."
                        value={followGateImageUrl}
                        onChange={(url) => {
                          setFollowGateImageUrl(url)
                          setPhoneScreenMode("dm")
                          setSimStage(1)
                        }}
                        userId={userId}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-border/60 bg-card/60 text-[11px] text-muted-foreground flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>Non-follower gate is disabled. Commenters will receive your payload directly upon tapping &quot;{initialButtonText}&quot;.</span>
                  </div>
                )}
              </div>

              {/* Delivery Preferences */}
              <div className="space-y-2.5 pt-1">
                <FieldLabel>Delivery preferences</FieldLabel>
                <ToggleRow
                icon={<Eye className="w-4 h-4" />}
                title="Mimic active typing status"
                sub="Displays authentic typing bubbles inside Instagram DM to look organic."
                on={typingIndicator}
                onToggle={() => {
                  const next = !typingIndicator
                  setTypingIndicator(next)
                  setPhoneScreenMode("dm")
                  setCommentSheetOpen(false)
                }}
              />

              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center border border-border">
                    <Timer className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Delivery Delay</p>
                    <p className="text-[10px] text-muted-foreground">Simulate natural human response time.</p>
                  </div>
                </div>
                <select
                  value={delaySeconds}
                  onChange={(e) => {
                    const sec = Number(e.target.value)
                    setDelaySeconds(sec)
                    setPhoneScreenMode("dm")
                    setCommentSheetOpen(false)
                  }}
                  className="bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none hover:border-foreground/40 transition-all cursor-pointer"
                >
                  <option value={0}>Send Immediately</option>
                  <option value={3}>3s delay</option>
                  <option value={5}>5s delay</option>
                  <option value={10}>10s delay</option>
                  <option value={30}>30s delay</option>
                </select>
              </div>
            </div>
          </div>

            <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Sparkles className="w-4 h-4 text-accent-yellow" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-accent-yellow">Automation Summary</h3>
              </div>

              {/* Natural language summary */}
              <div className="p-3 rounded-xl bg-accent-yellow/10 border border-accent-yellow/30 text-xs text-foreground/90 leading-relaxed">
                When <span className="font-semibold text-foreground underline decoration-accent-yellow/50">{summary.who}</span>, we will <span className="font-bold text-accent-yellow">{summary.what}</span>.
              </div>

              {/* Visual Breakdown Tags */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground text-[11px]">Channel:</span>
                  <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">{triggerSource}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground text-[11px]">
                    {triggerSource === "story" ? "Target Story:" : triggerSource === "dm" ? "Target Inbox:" : "Target Reel / Post:"}
                  </span>
                  <span className="font-semibold text-[11px] text-foreground truncate max-w-[170px]">
                    {selectedMedia.length > 1
                      ? `${selectedMedia.length} ${triggerSource === "story" ? "Stories" : "Posts / Reels"}`
                      : selectedReel
                        ? (selectedReel.caption || (triggerSource === "story" ? "Specific Story" : "Specific Reel / Post"))
                        : (triggerSource === "story" ? "All Stories" : "All Reels & Posts")}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground text-[11px]">Keywords:</span>
                  <span className="font-semibold text-[11px] text-accent-yellow">
                    {customOverrideCount > 0
                      ? `${triggers.length > 0 ? triggers.join(", ") : commentMatchAll ? "All comments" : "Default"} (${customOverrideCount} custom)`
                      : triggers.length > 0
                        ? triggers.join(", ")
                        : commentMatchAll
                          ? "Every Comment (All)"
                          : "None"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground text-[11px]">Payload:</span>
                  <span className="font-semibold text-[11px] capitalize text-foreground">{type}</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-border/60">
                  <span className="text-muted-foreground text-[11px]">Greeting Card:</span>
                  <span className="font-semibold text-[11px] text-emerald-400">Default Active</span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground text-[11px]">Follow Gate:</span>
                  <span className="font-semibold text-[11px] text-foreground">{checkFollow ? "Active" : "Disabled (Optional)"}</span>
                </div>
              </div>
            </div>

            {/* Large Publish Button Box */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-xs">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSave || saving}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 stroke-[2.5] text-black" />
                )}
                <span>
                  {saving
                    ? "Saving..."
                    : isEditing
                      ? "Save Workflow"
                      : !isEditing && selectedMedia.length > 1
                        ? `Publish ${selectedMedia.length} Workflows`
                        : "Publish Workflow"}
                </span>
              </button>

              {validationHint && (
                <p className="text-[11px] text-amber-500/90 text-center font-mono-ui leading-tight">
                  {validationHint}
                </p>
              )}
            </div>
          </div>

        {/* ── RIGHT COLUMN (5 cols): PERSISTENT FIXED LIVE PHONE SIMULATOR ── */}
        <div className="lg:col-span-5 hidden lg:flex flex-col items-center justify-start lg:sticky lg:top-0 lg:h-[calc(100vh-140px)] dark select-none">
          {/* Prominent Screen View Switcher */}
          <div className="w-[305px] xl:w-[325px] 2xl:w-[340px] flex items-center justify-between p-1 bg-neutral-900 border border-zinc-800 rounded-xl mb-2.5 shadow-md">
            <button
              type="button"
              onClick={() => {
                setPhoneScreenMode("content")
                setCommentSheetOpen(false)
              }}
              className={`flex-1 py-1 px-2 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                phoneScreenMode === "content"
                  ? "bg-accent-yellow text-black font-bold shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>{triggerSource === "comment" ? "Post & Comments" : "Story View"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPhoneScreenMode("dm")
                setCommentSheetOpen(false)
              }}
              className={`flex-1 py-1 px-2 text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                phoneScreenMode === "dm"
                  ? "bg-accent-yellow text-black font-bold shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Direct Message (DM)</span>
            </button>
          </div>

          <div className="w-full flex justify-center">
            {/* iPhone Outer Frame */}
            <div className="w-[305px] xl:w-[325px] 2xl:w-[340px] h-[610px] xl:h-[650px] 2xl:h-[675px] max-h-[calc(100vh-160px)] rounded-[2.8rem] border-[8px] border-[#1f1f1e] bg-black shadow-2xl relative flex flex-col overflow-hidden ring-1 ring-white/10">
              {/* Dynamic Island Speaker Notch */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-50 flex items-center justify-center pointer-events-none">
                <div className="w-2 h-2 rounded-full bg-muted border border-neutral-800 ml-auto mr-2" />
              </div>

              {/* Instagram In-App Dropdown Push Notification Banner */}
              {simNotification?.visible && (
                <div
                  onClick={() => {
                    setPhoneScreenMode("dm")
                    setCommentSheetOpen(false)
                    setSimStage(0)
                    setSimNotification(null)
                  }}
                  className="absolute top-7 inset-x-2.5 z-50 bg-[#1f1f23]/95 backdrop-blur-md border border-zinc-700/80 rounded-2xl p-2.5 shadow-2xl flex items-center gap-2.5 cursor-pointer animate-in slide-in-from-top-6 duration-300 hover:scale-[1.02] transition-transform select-none"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-600 shrink-0 bg-neutral-900 shadow-sm relative">
                    <img
                      src={creatorProfilePic}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                      }}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-[6px] text-white shadow-xs">
                      💬
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-white truncate">{simNotification.title}</span>
                      <span className="text-[8px] text-zinc-400">now</span>
                    </div>
                    <p className="text-[9px] text-zinc-300 truncate mt-0.5">{simNotification.body}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </div>
              )}

              {/* ────────── VIEW 1: INSTAGRAM POST VIEW (Matches Screenshot 1) ────────── */}
              {phoneScreenMode === "content" && triggerSource === "comment" ? (
                <div className="flex-1 flex flex-col justify-between bg-black text-white font-sans overflow-hidden select-none relative">
                  {/* Status Bar */}
                  <div className="h-7 bg-black flex items-end justify-between px-5 pb-1 text-[9px] text-white/90 font-mono-ui z-40">
                    <span className="font-semibold tracking-tight">2:56</span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <div className="flex items-end gap-[1px] h-2.5">
                        <div className="w-[2px] h-1 bg-white rounded-2xs" />
                        <div className="w-[2px] h-1.5 bg-white rounded-2xs" />
                        <div className="w-[2px] h-2 bg-white rounded-2xs" />
                        <div className="w-[2px] h-2.5 bg-white rounded-2xs" />
                      </div>
                      <span className="text-[8px] font-bold">5G</span>
                      <div className="w-3.5 h-1.5 border border-white/60 rounded-xs p-[1px] flex items-center">
                        <div className="w-2 h-full bg-white rounded-2xs" />
                      </div>
                    </div>
                  </div>

                  {/* Navigation Header */}
                  <div className="h-9 bg-black flex items-center justify-between px-3 border-b border-zinc-900 sticky top-0 z-30">
                    <button
                      type="button"
                      onClick={() => setPhoneScreenMode("dm")}
                      className="p-1 text-white hover:text-zinc-300 transition-colors cursor-pointer"
                      title="Open DM Sequence"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <div className="text-center leading-tight">
                      <p className="text-[8px] uppercase tracking-wider text-zinc-400 font-semibold font-mono-ui">
                        {creatorUsername.toUpperCase()}
                      </p>
                      <p className="text-xs font-bold text-white tracking-tight">Posts</p>
                    </div>
                    <div className="w-4" />
                  </div>

                  {/* Scrollable Post Body (Non-scrolling fit) */}
                  <div className="flex-1 overflow-y-auto scrollbar-none space-y-2">
                    {/* Author Row */}
                    <div className="h-10 bg-black flex items-center justify-between px-3">
                      <div className="flex items-center gap-2">
                        {/* Circular Gold MK monogram Badge */}
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 shadow-sm bg-neutral-900">
                          <img
                            src={creatorProfilePic}
                            alt={creatorUsername}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-white tracking-tight">
                          {creatorUsername || "creator"}
                        </span>
                      </div>
                      <button type="button" className="text-white hover:text-zinc-300">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Main Post Media */}
                    <div className="w-full aspect-square max-h-[290px] xl:max-h-[320px] bg-neutral-900 relative overflow-hidden group">
                      {selectedPostMedia ? (
                        selectedPostMedia.includes(".mp4") ? (
                          <video
                            src={selectedPostMedia}
                            playsInline
                            muted
                            autoPlay
                            loop
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        ) : (
                          <img
                            src={selectedPostMedia}
                            alt="Post Media"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = "none"
                            }}
                          />
                        )
                      ) : (
                        <div className="w-full h-full bg-neutral-900/60 flex items-center justify-center text-neutral-600">
                          <Film className="w-8 h-8" />
                        </div>
                      )}
                    </div>

                    {/* Engagement Actions */}
                    <div className="h-8 bg-black flex items-center justify-between px-3 text-white">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setPostLiked((v) => !v)}
                          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                        >
                          <Heart className={`w-4 h-4 ${postLiked ? "fill-red-500 text-red-500" : "text-white"}`} />
                          <span className="text-xs font-bold font-sans">{postLiked ? 31 : 30}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCommentSheetOpen(true)}
                          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                          title="Open Instagram Comments"
                        >
                          <MessageCircle className="w-4 h-4 text-white" />
                          <span className="text-xs font-bold font-sans">1</span>
                        </button>
                        <button type="button" className="hover:opacity-80 transition-opacity">
                          <Send className="w-4 h-4 text-white -rotate-12" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPostSaved((v) => !v)}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      >
                        <Bookmark className={`w-4 h-4 ${postSaved ? "fill-white text-white" : "text-white"}`} />
                      </button>
                    </div>

                    {/* Comments & Automation Interaction */}
                    <div className="px-3 pb-2 space-y-2 text-xs text-white">
                      {/* Alex Design organic comment */}
                      <p className="leading-snug">
                        <span className="font-bold text-white mr-1.5">alex_design</span>
                        <span className="text-zinc-200">Is there a download link or tutorial for this setup?</span>
                      </p>

                      {/* Dynamic user comments for each trigger keyword + creator public replies */}
                      {simKeywordComments.slice(0, 3).map((item) => (
                        <div key={item.id} className="space-y-1 animate-in fade-in duration-200">
                          <p className="leading-snug">
                            <span className="font-bold text-white mr-1.5">@{item.username}</span>
                            <span className="text-zinc-200 whitespace-pre-wrap">{item.text}</span>
                          </p>

                          {/* Creator Auto Reply for this keyword comment */}
                          {replyMode !== "dm_only" && (
                            <div
                              onClick={() => setCommentSheetOpen(true)}
                              className="pl-3 border-l-2 border-[#d4af37]/60 space-y-0.5 cursor-pointer hover:bg-white/5 rounded-r-md transition-colors"
                              title="Click to open comments pop-up"
                            >
                              <p className="leading-snug text-zinc-300">
                                <span className="font-bold text-white mr-1.5">
                                  {creatorHandle}
                                </span>
                                <span className="text-zinc-200">{liveAutoReplyText}</span>
                                <span className="ml-1.5 text-[8px] font-mono-ui font-semibold text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                                  Auto Reply
                                </span>
                              </p>
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => setCommentSheetOpen(true)}
                        className="text-[11px] text-zinc-400 hover:text-white cursor-pointer block pt-0.5 font-medium transition-colors"
                      >
                        View all {Math.max(simKeywordComments.length + 1, simComments.length + 1)} comments • Tap to test typing
                      </button>
                      <p className="text-[9px] text-zinc-500 font-sans">30 Aug, 2026</p>
                    </div>
                  </div>

                  {/* Bottom Instagram Navigation Bar */}
                  <div className="h-10 bg-black border-t border-zinc-900 flex items-center justify-between px-6 text-white mt-auto">
                    <Home className="w-4 h-4 text-white" />
                    <Search className="w-4 h-4 text-zinc-400" />
                    <PlusSquare className="w-4 h-4 text-zinc-400" />
                    <Film className="w-4 h-4 text-zinc-400" />
                    <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 bg-neutral-900">
                      <img
                        src={creatorProfilePic}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                        }}
                      />
                    </div>
                  </div>

                  {/* Instagram Comments Bottom Sheet Modal with Authentic Slide-Up Animation */}
                  {commentSheetOpen && (
                    <div className="absolute inset-0 z-50 flex flex-col justify-end overflow-hidden">
                      {/* Dark Backdrop */}
                      <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
                        onClick={() => setCommentSheetOpen(false)}
                      />

                      {/* Sliding Drawer Container */}
                      <div className="relative z-10 w-full bg-[#1c1c1e] text-white rounded-t-[24px] border-t border-zinc-800 shadow-2xl flex flex-col max-h-[82%] h-[80%] animate-in slide-in-from-bottom duration-300 ease-out">
                        {/* Drawer Drag Pill & Header */}
                        <div className="pt-2 px-3 pb-2 border-b border-zinc-800/80 shrink-0">
                          <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-2" />
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={handleResetSim}
                              className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                              title="Reset comments thread"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span className="text-[9px]">Reset</span>
                            </button>
                            <span className="text-xs font-bold text-white tracking-tight">Comments</span>
                            <button
                              type="button"
                              onClick={() => setCommentSheetOpen(false)}
                              className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
                              title="Close comments"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Comments Thread Area */}
                        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-none font-sans text-xs">
                          {/* Live Mode & Trigger Indicator Banner */}
                          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 text-[10px] font-mono-ui">
                            <span className="flex items-center gap-1 text-accent-yellow font-semibold truncate max-w-[200px]">
                              <Sparkles className="w-3 h-3 shrink-0" />
                              {commentMatchAll
                                ? "Trigger: Any comment"
                                : liveTriggerDisplay ? `Trigger: ${liveTriggerDisplay}` : "Trigger: (none)"}
                            </span>
                            <span className="text-[8px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.2 rounded-full border border-emerald-500/30 shrink-0">
                              Live Interactive
                            </span>
                          </div>

                          {/* 1. Alex Design (Root Comment - preserved exactly as designed) */}
                          <div className="space-y-2">
                            <div className="flex items-start gap-2.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 bg-zinc-700 text-white">
                                A
                              </div>
                              <div className="flex-1 space-y-0.5">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-bold text-[10px] text-white">alex_design</span>
                                  <span className="text-[8px] text-zinc-400">2h</span>
                                </div>
                                <p className="text-[11px] text-zinc-100 font-medium leading-snug break-words">
                                  Is there a download link or tutorial for this setup?
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 2. Dynamic Trigger Keyword Comments - Each keyword has a distinct random user & public reply */}
                          {simKeywordComments.map((item) => (
                            <div key={item.id} className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 bg-gradient-to-tr ${item.gradient} text-white shadow-xs ring-1 ring-white/10`}>
                                  {item.initial}
                                </div>
                                <div className="flex-1 space-y-0.5">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-bold text-[10px] text-white">@{item.username}</span>
                                    <span className="text-[8px] text-zinc-400">{item.time}</span>
                                    <span className="text-[7px] font-mono-ui font-semibold text-accent-yellow bg-accent-yellow/15 border border-accent-yellow/30 px-1 rounded-full">
                                      {commentMatchAll ? "Comment Match" : `Keyword: "${item.text}"`}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-zinc-100 font-medium leading-snug break-words whitespace-pre-wrap">
                                    {item.text || <span className="text-zinc-500 italic">typing comment...</span>}
                                  </p>
                                </div>
                              </div>

                              {/* Nested Creator Auto Reply */}
                              {replyMode !== "dm_only" && (
                                <div className="flex items-start gap-2.5 pl-6 relative animate-in fade-in slide-in-from-top-1 duration-200">
                                  <div className="absolute left-2.5 -top-2 w-3.5 h-5 border-l-2 border-b-2 border-zinc-700/80 rounded-bl-lg pointer-events-none" />
                                  <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700/80 shrink-0 bg-neutral-900 shadow-xs ring-1 ring-emerald-500/30">
                                    <img
                                      src={creatorProfilePic}
                                      alt={creatorUsername}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1 space-y-0.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="font-bold text-[10px] text-white">
                                        {creatorHandle}
                                      </span>
                                      <span className="text-[7px] font-mono-ui font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1 rounded-full">
                                        Auto Reply
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-100 leading-snug break-words">
                                      {liveAutoReplyText}
                                    </p>
                                    {replyMode !== "public_only" && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCommentSheetOpen(false)
                                          setPhoneScreenMode("dm")
                                          setSimStage(0)
                                        }}
                                        className="text-[9px] text-accent-yellow hover:underline cursor-pointer flex items-center gap-0.5 font-mono-ui pt-0.5"
                                      >
                                        <span>Open DM chat</span>
                                        <ChevronRight className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Extra user comments tested interactively */}
                          {simComments.filter((c) => c.isUser && c.id !== "c_root_1").map((c) => (
                            <div key={c.id} className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                              <div className="flex items-start gap-2.5">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 bg-gradient-to-tr ${c.gradient || "from-purple-500 to-indigo-500"} text-white shadow-xs`}>
                                  {c.initial || c.username.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex-1 space-y-0.5">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="font-bold text-[10px] text-white">@{c.username}</span>
                                    <span className="text-[8px] text-zinc-400">{c.time}</span>
                                    {c.matched ? (
                                      <span className="text-[7px] font-mono-ui font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1 rounded-full">
                                        Matched
                                      </span>
                                    ) : (
                                      <span className="text-[7px] font-mono-ui font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 rounded-full">
                                        No Match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-100 font-medium leading-snug break-words">
                                    {c.text}
                                  </p>
                                  {!c.matched && (
                                    <div className="mt-1 flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300">
                                      <Info className="w-2.5 h-2.5 shrink-0" />
                                      <span className="leading-tight">
                                        No keyword match. No auto-reply sent.
                                      </span>
                                      {triggers.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleSimPostComment(triggers[0])}
                                          className="ml-auto underline font-semibold text-accent-yellow hover:text-white cursor-pointer shrink-0"
                                        >
                                          Try "{triggers[0]}"
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Nested Creator Auto Reply for matched interactive comment */}
                              {c.hasReply && replyMode !== "dm_only" && (
                                <div className="flex items-start gap-2.5 pl-6 relative animate-in fade-in slide-in-from-top-1 duration-200">
                                  <div className="absolute left-2.5 -top-2 w-3.5 h-5 border-l-2 border-b-2 border-zinc-700/80 rounded-bl-lg pointer-events-none" />
                                  <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700/80 shrink-0 bg-neutral-900 shadow-xs ring-1 ring-emerald-500/30">
                                    <img
                                      src={creatorProfilePic}
                                      alt={creatorUsername}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1 space-y-0.5">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="font-bold text-[10px] text-white">
                                        {creatorHandle}
                                      </span>
                                      <span className="text-[7px] font-mono-ui font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1 rounded-full">
                                        Auto Reply
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-100 leading-snug break-words">
                                      {c.replyText || liveAutoReplyText}
                                    </p>
                                    {replyMode !== "public_only" && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setCommentSheetOpen(false)
                                          setPhoneScreenMode("dm")
                                          setSimStage(0)
                                        }}
                                        className="text-[9px] text-accent-yellow hover:underline cursor-pointer flex items-center gap-0.5 font-mono-ui pt-0.5"
                                      >
                                        <span>Open DM chat</span>
                                        <ChevronRight className="w-2.5 h-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Quick-fill Trigger Keyword Chips */}
                        <div className="border-t border-zinc-800/60 px-2.5 py-1.5 bg-[#141416] shrink-0">
                          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                            <span className="text-[9px] text-zinc-400 font-mono-ui shrink-0">Tap to test:</span>
                            {commentMatchAll ? (
                              <button
                                type="button"
                                onClick={() => handleSimPostComment("Love this! Tell me more")}
                                className="px-2 py-0.5 rounded-full bg-accent-yellow/20 hover:bg-accent-yellow/30 text-accent-yellow text-[9px] font-semibold border border-accent-yellow/30 shrink-0 cursor-pointer transition-colors"
                              >
                                + "Love this!" (Any comment)
                              </button>
                            ) : triggers.length > 0 ? (
                              triggers.map((kw) => (
                                <button
                                  key={kw}
                                  type="button"
                                  onClick={() => handleSimPostComment(kw)}
                                  className="px-2 py-0.5 rounded-full bg-accent-yellow/20 hover:bg-accent-yellow/30 text-accent-yellow text-[9px] font-semibold border border-accent-yellow/30 shrink-0 cursor-pointer transition-colors"
                                >
                                  + "{kw}"
                                </button>
                              ))
                            ) : (
                              ["price", "link", "send"].map((kw) => (
                                <button
                                  key={kw}
                                  type="button"
                                  onClick={() => handleSimPostComment(kw)}
                                  className="px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] font-medium border border-zinc-700 shrink-0 cursor-pointer transition-colors"
                                >
                                  + "{kw}"
                                </button>
                              ))
                            )}
                            <button
                              type="button"
                              onClick={() => handleSimPostComment("Hello there, great video")}
                              className="px-2 py-0.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-[9px] border border-zinc-700/60 shrink-0 cursor-pointer transition-colors"
                              title="Test non-matching comment"
                            >
                              + "Random" (Test Mismatch)
                            </button>
                          </div>
                        </div>

                        {/* Bottom Instagram Comment Input & Emojis */}
                        <div className="border-t border-zinc-800/80 p-2 bg-[#171719] shrink-0 space-y-1.5">
                          <div className="flex items-center justify-between px-1 text-xs select-none">
                            {["❤️", "🙌", "🔥", "👏", "😢", "😍", "😮", "😂"].map((emoji) => (
                              <span
                                key={emoji}
                                onClick={() => setSimInputText((prev) => prev + emoji)}
                                className="cursor-pointer hover:scale-125 transition-transform text-xs"
                              >
                                {emoji}
                              </span>
                            ))}
                          </div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              handleSimPostComment()
                            }}
                            className="flex items-center gap-2 bg-[#262628] rounded-full px-2.5 py-1.5 border border-zinc-700/50 focus-within:border-accent-yellow/60 transition-colors"
                          >
                            <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-neutral-900">
                              <img
                                src={creatorProfilePic}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                }}
                              />
                            </div>
                            <input
                              type="text"
                              value={simInputText}
                              onChange={(e) => setSimInputText(e.target.value)}
                              placeholder={
                                commentMatchAll
                                  ? "Type any comment to test..."
                                  : triggers.length > 0
                                    ? `Type "${triggers[0]}" to test trigger...`
                                    : "Add a comment..."
                              }
                              className="bg-transparent text-[10px] text-white placeholder-zinc-500 focus:outline-none flex-1 min-w-0"
                            />
                            <button
                              type="submit"
                              disabled={!simInputText.trim()}
                              className="text-[10px] font-bold text-accent-yellow hover:text-accent-yellow/80 disabled:opacity-30 disabled:hover:text-accent-yellow cursor-pointer transition-opacity"
                            >
                              Post
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : phoneScreenMode === "content" && triggerSource === "story" ? (
                /* ────────── VIEW 2: INSTAGRAM STORY VIEW (Matches Screenshot 2) ────────── */
                <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-neutral-950 font-sans select-none">
                  {/* Full-Height Background Media */}
                  {selectedStoryMedia ? (
                    <img
                      src={selectedStoryMedia}
                      alt="Story Background"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = "none"
                      }}
                    />
                  ) : null}

                  {/* Gradient Overlays for Readability */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/85 pointer-events-none" />

                  {/* Top Section: Progress Bar & Header */}
                  <div className="relative z-20 p-2.5 space-y-2">
                    {/* Segmented Line Progress */}
                    <div className="flex items-center gap-1 w-full pt-1">
                      <div className="h-[2px] flex-1 bg-white rounded-full shadow-xs" />
                      <div className="h-[2px] flex-1 bg-white/40 rounded-full" />
                      <div className="h-[2px] flex-1 bg-white/40 rounded-full" />
                    </div>

                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden border border-white/60 shrink-0 shadow-sm bg-neutral-900">
                          <img
                            src={creatorProfilePic}
                            alt={creatorUsername}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                            }}
                          />
                        </div>
                        <div className="leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white drop-shadow-sm">
                              {creatorUsername || "creator"}
                            </span>
                            <span className="text-[10px] text-zinc-300 font-sans">14h</span>
                          </div>
                          <div className="flex items-center gap-1 text-[9px] text-zinc-200 mt-0.5">
                            <Music2 className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate max-w-[125px]">Sayuri Hayashi Egnell · Low Battery Mode</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-white">
                        <VolumeX className="w-3.5 h-3.5 drop-shadow-sm cursor-pointer" />
                        <Play className="w-3.5 h-3.5 fill-white drop-shadow-sm cursor-pointer" />
                        <MoreHorizontal className="w-3.5 h-3.5 drop-shadow-sm cursor-pointer" />
                      </div>
                    </div>
                  </div>

                  {/* Bottom Interaction Bar */}
                  <div className="relative z-20 p-2.5 space-y-1.5">
                    {/* Quick Reaction Emojis */}
                    <div className="flex items-center justify-between px-2 text-xs select-none bg-black/40 backdrop-blur-md rounded-full py-1 border border-white/20">
                      {["🔥", "❤️", "👏", "😍", "😮", "😂"].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleSimStoryInteract({ type: "reaction", value: emoji })}
                          className="hover:scale-125 transition-transform text-xs cursor-pointer p-0.5"
                          title={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          handleSimStoryInteract({ type: "reply", value: simStoryInputText })
                        }}
                        className="flex-1 h-8 rounded-full bg-black/50 border border-white/40 backdrop-blur-md px-3 flex items-center gap-2 shadow-md focus-within:border-accent-yellow transition-colors"
                      >
                        <input
                          type="text"
                          value={simStoryInputText}
                          onChange={(e) => setSimStoryInputText(e.target.value)}
                          placeholder={`Reply to ${creatorHandle}...`}
                          className="bg-transparent text-[10px] text-white placeholder-white/70 focus:outline-none flex-1 min-w-0"
                        />
                        <button
                          type="submit"
                          disabled={!simStoryInputText.trim()}
                          className="text-white hover:text-accent-yellow disabled:opacity-30 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5 -rotate-12" />
                        </button>
                      </form>

                      <button
                        type="button"
                        onClick={() => {
                          setStoryLiked((v) => !v)
                          handleSimStoryInteract({ type: "reaction", value: "❤️" })
                        }}
                        className="p-1 text-white hover:scale-110 transition-transform cursor-pointer"
                        title="Like Story"
                      >
                        <Heart className={`w-5 h-5 ${storyLiked ? "fill-red-500 text-red-500" : "text-white"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ────────── VIEW 3: INSTAGRAM DIRECT MESSAGE SEQUENCE ────────── */
                <div className="flex-1 flex flex-col justify-between bg-black font-sans overflow-hidden select-none">
                  {/* Status Bar */}
                  <div className="h-7 bg-neutral-950 flex items-end justify-between px-5 pb-1 text-[9px] text-foreground/80 font-mono-ui z-40 select-none">
                    <span>9:41</span>
                    <div className="flex items-center gap-1">
                      <span>5G</span>
                      <div className="w-3.5 h-1.5 border border-white/40 rounded-xs p-[1px] flex items-center"><div className="w-1.5 h-full bg-white rounded-2xs" /></div>
                    </div>
                  </div>

                  {/* Instagram DM Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40">
                    <div className="flex items-center gap-2">
                      {triggerSource !== "dm" && (
                        <button
                          type="button"
                          onClick={() => setPhoneScreenMode("content")}
                          className="p-0.5 text-foreground hover:text-accent-yellow transition-colors cursor-pointer"
                          title="Back to Post / Story View"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <div className="relative">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#8a3ab9] via-[#e95950] to-[#fccc63] p-[1.5px] shrink-0">
                          <div className="w-full h-full rounded-full overflow-hidden bg-black">
                            <img
                              src={creatorProfilePic}
                              alt={creatorUsername}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                              }}
                            />
                          </div>
                        </div>
                        <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-neutral-950" />
                      </div>
                      <div className="leading-tight">
                        <p className="text-[10px] font-semibold text-foreground truncate max-w-[90px]">{creatorHandle}</p>
                        <p className="text-[7px] text-green-500 font-medium">Active now</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-foreground">
                      <button
                        type="button"
                        onClick={handleResetSim}
                        className="text-[9px] font-mono-ui text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer bg-neutral-900 border border-zinc-800 px-1.5 py-0.5 rounded hover:border-zinc-700 transition-colors"
                        title="Reset simulation to initial state"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>Replay</span>
                      </button>
                      <Info className="w-3 h-3 text-zinc-400" />
                    </div>
                  </div>

                  {/* Interactive Simulation Switcher (Pinned Header Bar) */}
                  <div className="shrink-0 px-2.5 py-1.5 bg-neutral-900 border-b border-zinc-800 flex items-center justify-between text-[9px] font-mono-ui z-10">
                    <div className="flex items-center gap-1">
                      <span className="text-accent-yellow flex items-center gap-0.5 mr-0.5 font-bold">
                        <Zap className="w-2.5 h-2.5" /> Stage:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSimStage(0)}
                        className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition-colors cursor-pointer ${
                          simStage === 0
                            ? "bg-accent-yellow text-black font-bold shadow-xs"
                            : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                        }`}
                      >
                        1. Greeting
                      </button>
                      {checkFollow ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setSimStage(1)}
                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition-colors cursor-pointer ${
                              simStage === 1
                                ? "bg-accent-yellow text-black font-bold shadow-xs"
                                : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                            }`}
                          >
                            2. Gate
                          </button>
                          <button
                            type="button"
                            onClick={() => setSimStage(2)}
                            className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition-colors cursor-pointer ${
                              simStage >= 2
                                ? "bg-emerald-500 text-white font-bold shadow-xs"
                                : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                            }`}
                          >
                            3. Payload
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSimStage(1)}
                          className={`px-1.5 py-0.5 rounded text-[8.5px] font-medium transition-colors cursor-pointer ${
                            simStage >= 1
                              ? "bg-emerald-500 text-white font-bold shadow-xs"
                              : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                          }`}
                        >
                          2. Payload
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSimStage(0)}
                      className="text-zinc-400 hover:text-white cursor-pointer flex items-center gap-0.5 text-[8.5px] hover:underline"
                      title="Restart simulation from stage 1"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Reset
                    </button>
                  </div>

                  {/* Screen Body */}
                  <div ref={chatScrollRef} className="flex-1 bg-black px-3 py-2.5 space-y-2.5 overflow-y-auto font-sans flex flex-col">
                    <div className="flex-1 min-h-0" />

                    {/* Subtle Top Post Reference Context */}
                    <div className="text-center pb-1">
                      <p className="text-[8px] text-zinc-500 font-sans leading-tight">
                        {creatorUsername} messaged you about a comment that you made on their post. <span className="text-zinc-400 font-semibold cursor-pointer">See post</span>
                      </p>
                    </div>

                    {/* Incoming Comment/Story Trigger Bubble (Follower side, on LEFT) */}
                    <div className="flex justify-start items-end gap-1.5 animate-in fade-in duration-200">
                      <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 text-white flex items-center justify-center text-[8px] font-bold shrink-0 self-end mb-0.5">
                        U
                      </div>
                      <div className="bg-[#262628] text-white rounded-2xl rounded-bl-xs px-3 py-1.5 text-[10px] max-w-[75%] shadow-md">
                        {simActiveTriggerText
                          ? (triggerSource === "comment"
                              ? `Commented "${simActiveTriggerText}" on your post`
                              : triggerSource === "story"
                                ? (["🔥", "❤️", "👏", "😍", "😮", "😂"].includes(simActiveTriggerText)
                                    ? `Reacted ${simActiveTriggerText} to your story`
                                    : `Story reply: "${simActiveTriggerText}"`)
                                : `"${simActiveTriggerText}"`)
                          : incomingMsg(triggerSource, triggers, commentMatchAll, currentTriggerDraft)}
                      </div>
                    </div>

                    {/* ── STAGE 0: INITIAL GREETING & REQUEST CARD (DEFAULT ACTIVATED) ── */}
                    <div className="flex justify-start items-end gap-1.5 animate-in fade-in duration-200">
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 self-end mb-0.5 bg-neutral-900 shadow-sm">
                        <img
                          src={creatorProfilePic}
                          alt={creatorUsername}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                          }}
                        />
                      </div>
                      <div className="w-full max-w-[215px] bg-[#1c1c1e] text-white rounded-2xl rounded-bl-xs p-3 border border-zinc-800 shadow-2xl space-y-2.5 font-sans">
                        <div>
                          <h5 className="text-[11px] font-bold text-white tracking-tight leading-snug">
                            {initialTitle || "Hey there! Thanks so much for your interest 😊"}
                          </h5>
                          <p className="text-[9px] text-zinc-400 mt-1 leading-relaxed">
                            {initialSubtitle || "Click below and I'll send you the link in just a sec ✨"}
                          </p>
                        </div>
                        <div className="pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (simStage >= 1) {
                                setSimStage(0);
                                setTimeout(() => {
                                  setSimStage(1);
                                  if (checkFollow) {
                                    toast.info("Checking follow status... Non-follower detected, Gate triggered!");
                                  } else {
                                    toast.success("Request received! Payload delivered 🎉");
                                  }
                                }, 150);
                                return;
                              }
                              setSimStage(1);
                              if (checkFollow) {
                                toast.info("Checking follow status... Non-follower detected, Gate triggered!");
                              } else {
                                toast.success("Request received! Payload delivered 🎉");
                              }
                            }}
                            className={`w-full h-7 text-white text-[10px] font-semibold rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                              simStage >= 1
                                ? "bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/40"
                                : "bg-[#2c2c2e] hover:bg-[#38383a] hover:scale-[1.01] active:scale-95"
                            }`}
                          >
                            {simStage >= 1 ? (
                              <span className="flex items-center gap-1 text-emerald-300 font-mono-ui">
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                {initialButtonText || "Send me the link"}
                              </span>
                            ) : (
                              <span>{initialButtonText || "Send me the link"}</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* ── SUBSEQUENT STAGES: FOLLOW GATE FLOW OR DIRECT PAYLOAD ── */}
                    {checkFollow ? (
                      <>
                        {/* ── STAGE 1: FOLLOWER TAPS 'Send me the link' (ON RIGHT, PURPLE PILL) ── */}
                        {simStage >= 1 && (
                          <>
                            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <div className="bg-[#5942d9] text-white rounded-2xl rounded-br-xs px-3.5 py-1.5 text-[11px] font-medium shadow-md">
                                {initialButtonText || "Send me the link"}
                              </div>
                            </div>

                            {/* ── STAGE 1 (CREATOR): FOLLOWER GATE CARD (ON LEFT, WITH CREATOR PROFILE PIC) ── */}
                            <div className="flex justify-start items-end gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                              <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 self-end mb-0.5 bg-neutral-900 shadow-sm">
                                <img
                                  src={creatorProfilePic}
                                  alt={creatorUsername}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                  }}
                                />
                              </div>
                              <div className="w-full max-w-[215px] bg-[#1c1c1e] text-white rounded-2xl rounded-bl-xs p-3 border border-zinc-800 shadow-2xl space-y-2.5 font-sans">
                                {followGateImageUrl && (
                                  <div className="w-full h-20 rounded-xl overflow-hidden -mt-0.5 mb-1.5 border border-white/5 bg-black/40">
                                    <img src={followGateImageUrl} alt="Cover" className="w-full h-full object-cover" />
                                  </div>
                                )}
                                <div>
                                  <h5 className="text-[11px] font-bold text-white tracking-tight leading-snug">
                                    {followGateTitle || "Oh no! It seems you're not following me 👀"}
                                  </h5>
                                  <p className="text-[9px] text-zinc-400 mt-1 leading-relaxed">
                                    {(followGateSubtitle || "Follow my profile first, then tap below to get your link! ✨").replace(/{username}/g, creatorUsername)}
                                  </p>
                                </div>
                                <div className="space-y-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => toast.info(`Simulated: Opening ${creatorHandle}'s Instagram profile`)}
                                    className="w-full h-7 bg-[#2c2c2e] hover:bg-[#38383a] text-white text-[10px] font-semibold rounded-xl flex items-center justify-center transition-colors cursor-pointer"
                                  >
                                    <span>{followGateButtonFollow || "Visit Profile"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSimStage(2);
                                      toast.success("Follower verified! Resource unlocked 🎉");
                                    }}
                                    className="w-full h-7 bg-[#2c2c2e] hover:bg-emerald-600 text-white text-[10px] font-semibold rounded-xl flex items-center justify-center gap-1 transition-all cursor-pointer"
                                  >
                                    <span>{followGateButtonUnlock || "I'm following ✅"}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* ── STAGE 2: FOLLOWER TAPS 'I'm following ✅' (ON RIGHT, PURPLE PILL) ── */}
                        {simStage >= 2 && (
                          <>
                            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <div className="bg-[#5942d9] text-white rounded-2xl rounded-br-xs px-3.5 py-1.5 text-[11px] font-medium shadow-md">
                                {followGateButtonUnlock || "I'm following ✅"}
                              </div>
                            </div>

                            {/* ── STAGE 2 (CREATOR): UNLOCKED RESOURCE CARD (ON LEFT) ── */}
                            {renderPayloadMessage(false, "🎁 Unlocked Payload")}
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* ── DIRECT PAYLOAD FLOW (NO GATE): WHEN USER TAPS REQUEST BUTTON ── */}
                        {simStage >= 1 && (
                          <>
                            <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <div className="bg-[#5942d9] text-white rounded-2xl rounded-br-xs px-3.5 py-1.5 text-[11px] font-medium shadow-md">
                                {initialButtonText || "Send me the link"}
                              </div>
                            </div>

                            {/* Delivered Payload */}
                            {renderPayloadMessage(false, "🎁 Delivered Payload")}
                          </>
                        )}
                      </>
                    )}

                    {/* Simulated Delivery Delay Indicator */}
                    {delaySeconds > 0 && (
                      <div className="flex justify-center my-0.5 animate-in fade-in duration-200">
                        <span className="text-[8px] font-mono-ui text-zinc-400 bg-neutral-900/90 border border-zinc-800 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                          <Timer className="w-2.5 h-2.5 text-accent-yellow" />
                          Simulated delay: {delaySeconds}s
                        </span>
                      </div>
                    )}

                    {/* Authentic Instagram Animated Typing Indicator */}
                    {typingIndicator && (
                      <div className="flex items-end gap-1.5 animate-in fade-in duration-200">
                        <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-neutral-900 border border-zinc-700/60 shadow-xs">
                          <img
                            src={creatorProfilePic}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                            }}
                          />
                        </div>
                        <div className="bg-[#262628] rounded-2xl rounded-bl-xs px-2.5 py-2 flex items-center gap-1 shadow-md">
                          <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                        </div>
                      </div>
                    )}

                    {/* Quick Reply Pills */}
                    {type !== "card" && quickReplies.filter((q) => q.title.trim()).length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-end pt-1">
                        {quickReplies.filter((q) => q.title.trim()).map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => toast.info(`Simulated Quick Reply: "${q.title}"`)}
                            className="border border-[#3797f0] hover:bg-[#3797f0]/20 text-[#3797f0] rounded-full px-2 py-0.5 text-[9px] font-bold cursor-pointer transition-colors"
                          >
                            {q.title}
                          </button>
                        ))}
                      </div>
                    )}

                    <div ref={chatBottomRef} />
                  </div>

                  {/* iPhone Footer */}
                  <div className="h-10 bg-neutral-950 border-t border-border flex items-center justify-between px-4 text-muted-foreground">
                    <Camera className="w-3.5 h-3.5" />
                    <div className="flex-1 max-w-[130px] h-6 bg-muted border border-border rounded-full px-2.5 flex items-center justify-between text-[8px] text-muted-foreground">
                      <span>Message...</span>
                      <Smile className="w-2.5 h-2.5" />
                    </div>
                    <Mic className="w-3.5 h-3.5" />
                    <PicIcon className="w-3.5 h-3.5" />
                  </div>

                  {/* iPhone Bottom Bar Indicator */}
                  <div className="h-4 bg-neutral-950 flex items-center justify-center pb-1">
                    <div className="w-20 h-1 bg-white/40 rounded-full" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Live Preview Helper Badge */}
          <div className="mt-3 flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-card border border-border/80 shadow-xs max-w-[340px] text-center">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <p className="text-[11px] text-muted-foreground leading-snug">
              <strong className="text-foreground font-semibold">Interactive Live Preview</strong> — Click post, comments, switches, and buttons on the phone to test in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Mobile Live Simulator Modal Drawer */}
      {mobilePreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in lg:hidden">
          <div className="relative w-full max-w-sm max-h-[95vh] overflow-y-auto bg-neutral-950 border border-neutral-800 rounded-3xl p-4 shadow-2xl space-y-3 dark">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-accent-yellow" />
                <span className="text-xs font-bold text-white">Live Phone Simulator</span>
              </div>
              <button
                type="button"
                onClick={() => setMobilePreviewOpen(false)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="mx-auto w-[290px] h-[580px] rounded-[2.5rem] border-[7px] border-[#1f1f1e] bg-black shadow-2xl relative flex flex-col overflow-hidden">
                {/* Mobile Simulator Dropdown Push Notification Banner */}
                {simNotification?.visible && (
                  <div
                    onClick={() => {
                      setPhoneScreenMode("dm")
                      setCommentSheetOpen(false)
                      setSimStage(0)
                      setSimNotification(null)
                    }}
                    className="absolute top-6 inset-x-2 z-50 bg-[#1f1f23]/95 backdrop-blur-md border border-zinc-700/80 rounded-xl p-2 shadow-2xl flex items-center gap-2 cursor-pointer animate-in slide-in-from-top-4 duration-300 select-none"
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-600 shrink-0 bg-neutral-900 relative">
                      <img
                        src={creatorProfilePic}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                        }}
                      />
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-gradient-to-tr from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-[5px] text-white">
                        💬
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 leading-tight">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-white truncate">{simNotification.title}</span>
                        <span className="text-[7px] text-zinc-400">now</span>
                      </div>
                      <p className="text-[8px] text-zinc-300 truncate">{simNotification.body}</p>
                    </div>
                    <ChevronRight className="w-3 h-3 text-zinc-400 shrink-0" />
                  </div>
                )}

                {phoneScreenMode === "content" && triggerSource === "comment" ? (
                  <div className="flex-1 flex flex-col justify-between bg-black text-white font-sans overflow-hidden select-none relative">
                    <div className="h-6 bg-black flex items-end justify-between px-4 pb-0.5 text-[8px] text-white font-mono-ui">
                      <span>2:56</span>
                      <span>5G</span>
                    </div>
                    <div className="h-8 bg-black flex items-center justify-between px-2.5 border-b border-zinc-900">
                      <button type="button" onClick={() => setPhoneScreenMode("dm")} className="p-0.5 text-white">
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <div className="text-center leading-tight">
                        <p className="text-[7px] uppercase tracking-wider text-zinc-400 font-semibold font-mono-ui">
                          {creatorUsername.toUpperCase()}
                        </p>
                        <p className="text-[11px] font-bold text-white tracking-tight">Posts</p>
                      </div>
                      <div className="w-3" />
                    </div>
                    <div className="flex-1 overflow-y-auto scrollbar-none space-y-1.5">
                      <div className="h-9 bg-black flex items-center justify-between px-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 bg-neutral-900">
                            <img
                              src={creatorProfilePic}
                              alt={creatorUsername}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-white">
                            {creatorUsername || "creator"}
                          </span>
                        </div>
                        <MoreHorizontal className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="w-full aspect-square max-h-[260px] bg-neutral-900 overflow-hidden">
                        {selectedPostMedia ? (
                          selectedPostMedia.includes(".mp4") ? (
                            <video
                              src={selectedPostMedia}
                              playsInline
                              muted
                              autoPlay
                              loop
                              className="w-full h-full object-cover pointer-events-none"
                            />
                          ) : (
                            <img
                              src={selectedPostMedia}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = "none"
                              }}
                            />
                          )
                        ) : (
                          <div className="w-full h-full bg-neutral-900/60 flex items-center justify-center text-neutral-600">
                            <Film className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div className="h-7 bg-black flex items-center justify-between px-2.5 text-white">
                        <div className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1 text-[10px] font-bold">
                            <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" /> 30
                          </span>
                          <button
                            type="button"
                            onClick={() => setCommentSheetOpen(true)}
                            className="flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-white" /> {simComments.length}
                          </button>
                          <Send className="w-3.5 h-3.5 text-white -rotate-12" />
                        </div>
                        <Bookmark className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="px-2.5 pb-2 text-[10px] space-y-1.5">
                        <p><span className="font-bold mr-1">alex_design</span>Is there a download link or tutorial for this setup?</p>

                        {/* Multi-Keyword comments & creator replies */}
                        {simKeywordComments.slice(0, 2).map((item) => (
                          <div key={item.id} className="space-y-0.5 animate-in fade-in duration-200">
                            <p><span className="font-bold mr-1">@{item.username}</span><span className="whitespace-pre-wrap">{item.text}</span></p>
                            {replyMode !== "dm_only" && (
                              <div
                                onClick={() => setCommentSheetOpen(true)}
                                className="pl-2 border-l-2 border-[#d4af37]/60 space-y-0.5 cursor-pointer"
                              >
                                <p className="leading-snug text-zinc-300">
                                  <span className="font-bold text-white mr-1">{creatorHandle}</span>
                                  <span className="text-zinc-200">{liveAutoReplyText}</span>
                                </p>
                              </div>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() => setCommentSheetOpen(true)}
                          className="text-zinc-400 text-[9px] hover:underline cursor-pointer block pt-0.5"
                        >
                          View all {Math.max(simKeywordComments.length + 1, simComments.length + 1)} comments • Tap to test
                        </button>
                      </div>
                    </div>
                    <div className="h-9 bg-black border-t border-zinc-900 flex items-center justify-between px-5 text-white">
                      <Home className="w-3.5 h-3.5 text-white" />
                      <Search className="w-3.5 h-3.5 text-zinc-400" />
                      <PlusSquare className="w-3.5 h-3.5 text-zinc-400" />
                      <Film className="w-3.5 h-3.5 text-zinc-400" />
                      <div className="w-4 h-4 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 bg-neutral-900">
                        <img
                          src={creatorProfilePic}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                          }}
                        />
                      </div>
                    </div>

                    {/* Instagram Comments Bottom Sheet Modal */}
                    {commentSheetOpen && (
                      <div className="absolute inset-0 z-50 flex flex-col justify-end overflow-hidden">
                        <div
                          className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-200"
                          onClick={() => setCommentSheetOpen(false)}
                        />
                        <div className="relative z-10 w-full bg-[#1c1c1e] text-white rounded-t-[20px] border-t border-zinc-800 shadow-2xl flex flex-col max-h-[82%] h-[80%] animate-in slide-in-from-bottom duration-300 ease-out">
                          <div className="pt-2 px-3 pb-1.5 border-b border-zinc-800/80 shrink-0">
                            <div className="w-8 h-1 bg-zinc-600 rounded-full mx-auto mb-1.5" />
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={handleResetSim}
                                className="text-[9px] text-zinc-400 hover:text-white flex items-center gap-0.5"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Reset</span>
                              </button>
                              <span className="text-[11px] font-bold text-white tracking-tight">Comments</span>
                              <button
                                type="button"
                                onClick={() => setCommentSheetOpen(false)}
                                className="p-1 text-zinc-400 hover:text-white"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2 scrollbar-none font-sans text-[11px]">
                            {/* Live Mode & Trigger Indicator Banner */}
                            <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 text-[9px] font-mono-ui">
                              <span className="flex items-center gap-1 text-accent-yellow font-semibold truncate max-w-[180px]">
                                <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                {commentMatchAll
                                  ? "Trigger: Any comment"
                                  : liveTriggerDisplay ? `Trigger: ${liveTriggerDisplay}` : "Trigger: (none)"}
                              </span>
                              <span className="text-[7px] bg-emerald-500/15 text-emerald-400 px-1 py-0.2 rounded-full border border-emerald-500/30 shrink-0">
                                Live Interactive
                              </span>
                            </div>

                            {/* 1. Alex Design (Root Comment - preserved exactly as designed) */}
                            <div className="space-y-1.5">
                              <div className="flex items-start gap-2">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 bg-zinc-700 text-white">
                                  A
                                </div>
                                <div className="flex-1 space-y-0.5">
                                  <div className="flex items-baseline gap-1">
                                    <span className="font-bold text-[10px] text-white">alex_design</span>
                                    <span className="text-[7px] text-zinc-400">2h</span>
                                  </div>
                                  <p className="text-[10px] text-zinc-200 leading-snug">
                                    Is there a download link or tutorial for this setup?
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* 2. Dynamic Trigger Keyword Comments - Each keyword has a distinct random user & public reply */}
                            {simKeywordComments.map((item) => (
                              <div key={item.id} className="space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-start gap-2">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 bg-gradient-to-tr ${item.gradient} text-white shadow-xs`}>
                                    {item.initial}
                                  </div>
                                  <div className="flex-1 space-y-0.5">
                                    <div className="flex items-baseline gap-1">
                                      <span className="font-bold text-[10px] text-white">@{item.username}</span>
                                      <span className="text-[7px] text-zinc-400">{item.time}</span>
                                      <span className="text-[6px] font-mono-ui font-semibold text-accent-yellow bg-accent-yellow/15 border border-accent-yellow/30 px-1 rounded-full">
                                        {commentMatchAll ? "Match" : `"${item.text}"`}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-zinc-200 leading-snug whitespace-pre-wrap">
                                      {item.text || <span className="text-zinc-500 italic">typing comment...</span>}
                                    </p>
                                  </div>
                                </div>

                                {/* Creator Reply */}
                                {replyMode !== "dm_only" && (
                                  <div className="flex items-start gap-1.5 pl-4 relative">
                                    <div className="w-4 h-4 rounded-full overflow-hidden border border-zinc-700/80 shrink-0 bg-neutral-900">
                                      <img
                                        src={creatorProfilePic}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1 space-y-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="font-bold text-[9px] text-white">
                                          {creatorHandle}
                                        </span>
                                        <span className="text-[6px] text-emerald-400 bg-emerald-500/15 px-1 rounded-full font-mono-ui">
                                          Auto Reply
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-zinc-100 leading-snug break-words">
                                        {liveAutoReplyText}
                                      </p>
                                      {replyMode !== "public_only" && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCommentSheetOpen(false)
                                            setPhoneScreenMode("dm")
                                          }}
                                          className="text-[8px] text-accent-yellow hover:underline cursor-pointer block pt-0.5"
                                        >
                                          View DM ➔
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Additional tested comments if any */}
                            {simComments.filter(c => c.isUser && c.id !== "c_root_1").map((c) => (
                              <div key={c.id} className="space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                <div className="flex items-start gap-2">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 bg-gradient-to-tr ${c.gradient || "from-purple-500 to-indigo-500"} text-white`}>
                                    {c.initial || c.username.slice(0, 1).toUpperCase()}
                                  </div>
                                  <div className="flex-1 space-y-0.5">
                                    <div className="flex items-baseline gap-1">
                                      <span className="font-bold text-[10px] text-white">@{c.username}</span>
                                      <span className="text-[7px] text-zinc-400">{c.time}</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-200 leading-snug">
                                      {c.text}
                                    </p>
                                    {!c.matched && (
                                      <div className="mt-0.5 flex items-center gap-1 p-1 rounded bg-amber-500/10 border border-amber-500/30 text-[8px] text-amber-300">
                                        <Info className="w-2 h-2 shrink-0" />
                                        <span>No match.</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {c.hasReply && replyMode !== "dm_only" && (
                                  <div className="flex items-start gap-1.5 pl-4 relative">
                                    <div className="w-4 h-4 rounded-full overflow-hidden border border-zinc-700/80 shrink-0 bg-neutral-900">
                                      <img
                                        src={creatorProfilePic}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                        }}
                                      />
                                    </div>
                                    <div className="flex-1 space-y-0.5">
                                      <div className="flex items-center gap-1">
                                        <span className="font-bold text-[9px] text-white">
                                          {creatorHandle}
                                        </span>
                                        <span className="text-[6px] text-emerald-400 bg-emerald-500/15 px-1 rounded-full font-mono-ui">
                                          Auto Reply
                                        </span>
                                      </div>
                                      <p className="text-[9px] text-zinc-100 leading-snug break-words">
                                        {c.replyText || liveAutoReplyText}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* Quick Chips in Mobile Sheet */}
                          <div className="border-t border-zinc-800/80 px-2 py-1 bg-[#141416] shrink-0">
                            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
                              {triggers.length > 0 ? (
                                triggers.map((kw) => (
                                  <button
                                    key={kw}
                                    type="button"
                                    onClick={() => handleSimPostComment(kw)}
                                    className="px-1.5 py-0.5 rounded-full bg-accent-yellow/20 text-accent-yellow text-[8px] font-semibold border border-accent-yellow/30 shrink-0"
                                  >
                                    + "{kw}"
                                  </button>
                                ))
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSimPostComment("link")}
                                  className="px-1.5 py-0.5 rounded-full bg-accent-yellow/20 text-accent-yellow text-[8px] font-semibold border border-accent-yellow/30 shrink-0"
                                >
                                  + "link"
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleSimPostComment("random")}
                                className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 text-[8px] border border-zinc-700 shrink-0"
                              >
                                + Mismatch
                              </button>
                            </div>
                          </div>

                          {/* Comment Input */}
                          <div className="border-t border-zinc-800/80 p-2 bg-[#171719] shrink-0">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault()
                                handleSimPostComment()
                              }}
                              className="flex items-center gap-1.5 bg-[#262628] rounded-full px-2 py-1 border border-zinc-700/50"
                            >
                              <input
                                type="text"
                                value={simInputText}
                                onChange={(e) => setSimInputText(e.target.value)}
                                placeholder="Type to test..."
                                className="bg-transparent text-[9px] text-white placeholder-zinc-500 focus:outline-none flex-1 min-w-0"
                              />
                              <button
                                type="submit"
                                disabled={!simInputText.trim()}
                                className="text-[9px] font-bold text-accent-yellow disabled:opacity-30"
                              >
                                Post
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : phoneScreenMode === "content" && triggerSource === "story" ? (
                  <div className="relative w-full h-full flex flex-col justify-between overflow-hidden bg-neutral-950 font-sans select-none">
                    {selectedStoryMedia ? (
                      <img
                        src={selectedStoryMedia}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none"
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/85 pointer-events-none" />
                    <div className="relative z-20 p-2 space-y-1.5">
                      <div className="flex items-center gap-1 w-full pt-1">
                        <div className="h-[2px] flex-1 bg-white rounded-full" />
                        <div className="h-[2px] flex-1 bg-white/40 rounded-full" />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full overflow-hidden border border-white/60 shrink-0 bg-neutral-900">
                            <img
                              src={creatorProfilePic}
                              alt={creatorUsername}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-white">
                            {creatorUsername || "creator"}
                          </span>
                          <span className="text-[9px] text-zinc-300">14h</span>
                        </div>
                        <VolumeX className="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div className="relative z-20 p-2 space-y-1">
                      <div className="flex items-center justify-between px-2 bg-black/40 backdrop-blur-md rounded-full py-0.5 border border-white/20 text-[10px]">
                        {["🔥", "❤️", "👏", "😍", "😮", "😂"].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleSimStoryInteract({ type: "reaction", value: emoji })}
                            className="hover:scale-125 transition-transform cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            handleSimStoryInteract({ type: "reply", value: simStoryInputText })
                          }}
                          className="flex-1 h-7 rounded-full bg-black/50 border border-white/40 backdrop-blur-md px-2.5 flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={simStoryInputText}
                            onChange={(e) => setSimStoryInputText(e.target.value)}
                            placeholder="Reply to story..."
                            className="bg-transparent text-[9px] text-white placeholder-white/70 focus:outline-none flex-1 min-w-0"
                          />
                          <button type="submit" disabled={!simStoryInputText.trim()} className="text-white">
                            <Send className="w-3 h-3 -rotate-12" />
                          </button>
                        </form>
                        <button
                          type="button"
                          onClick={() => {
                            setStoryLiked((v) => !v)
                            handleSimStoryInteract({ type: "reaction", value: "❤️" })
                          }}
                          className="p-1 text-white"
                        >
                          <Heart className={`w-4 h-4 ${storyLiked ? "fill-red-500 text-red-500" : "text-white"}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-between bg-black text-white">
                    <div className="h-6 bg-neutral-950 flex items-end justify-between px-4 pb-1 text-[8px] text-foreground/80 font-mono-ui select-none">
                      <span>9:41</span>
                      <span>5G</span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-neutral-950/80">
                      <div className="flex items-center gap-1.5">
                        {triggerSource !== "dm" && (
                          <button type="button" onClick={() => setPhoneScreenMode("content")} className="text-white hover:text-accent-yellow">
                            <ArrowLeft className="w-3 h-3" />
                          </button>
                        )}
                        <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#8a3ab9] via-[#e95950] to-[#fccc63] p-[1px]">
                          <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[7px] font-bold text-white">
                            {(creatorUsername || "C").substring(0, 1).toUpperCase()}
                          </div>
                        </div>
                        <span className="text-[9px] font-semibold text-white truncate max-w-[100px]">{creatorHandle}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetSim}
                        className="text-[8px] text-zinc-400 hover:text-white flex items-center gap-0.5 bg-neutral-900 border border-zinc-800 px-1 py-0.5 rounded"
                      >
                        <RotateCcw className="w-2 h-2" />
                        <span>Replay</span>
                      </button>
                    </div>
                    {/* Interactive Simulation Switcher (Mobile Pinned) */}
                    <div className="shrink-0 px-2 py-1 bg-neutral-900 border-b border-zinc-800 flex items-center justify-between text-[8px] font-mono-ui z-10">
                      <div className="flex items-center gap-1">
                        <span className="text-accent-yellow flex items-center gap-0.5 mr-0.5 font-bold">
                          <Zap className="w-2 h-2" /> Stage:
                        </span>
                        <button
                          type="button"
                          onClick={() => setSimStage(0)}
                          className={`px-1 py-0.5 rounded text-[8px] font-medium transition-colors cursor-pointer ${
                            simStage === 0
                              ? "bg-accent-yellow text-black font-bold shadow-xs"
                              : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                          }`}
                        >
                          1. Greeting
                        </button>
                        {checkFollow ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setSimStage(1)}
                              className={`px-1 py-0.5 rounded text-[8px] font-medium transition-colors cursor-pointer ${
                                simStage === 1
                                  ? "bg-accent-yellow text-black font-bold shadow-xs"
                                  : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                              }`}
                            >
                              2. Gate
                            </button>
                            <button
                              type="button"
                              onClick={() => setSimStage(2)}
                              className={`px-1 py-0.5 rounded text-[8px] font-medium transition-colors cursor-pointer ${
                                simStage >= 2
                                  ? "bg-emerald-500 text-white font-bold shadow-xs"
                                  : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                              }`}
                            >
                              3. Payload
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSimStage(1)}
                            className={`px-1 py-0.5 rounded text-[8px] font-medium transition-colors cursor-pointer ${
                              simStage >= 1
                                ? "bg-emerald-500 text-white font-bold shadow-xs"
                                : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                            }`}
                          >
                            2. Payload
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSimStage(0)}
                        className="text-zinc-400 hover:text-white cursor-pointer flex items-center gap-0.5 text-[8px] hover:underline"
                        title="Restart simulation from stage 1"
                      >
                        <RotateCcw className="w-2 h-2" /> Reset
                      </button>
                    </div>

                    <div ref={mobileChatScrollRef} className="flex-1 bg-black p-2.5 space-y-2 overflow-y-auto text-white flex flex-col">
                      <div className="flex-1 min-h-0" />

                      <div className="flex justify-start items-end gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 text-white flex items-center justify-center text-[7px] font-bold shrink-0 self-end mb-0.5">
                          U
                        </div>
                        <div className="bg-[#262628] text-white rounded-xl px-2.5 py-1 text-[10px]">
                          {simActiveTriggerText
                            ? (triggerSource === "comment"
                                ? `Commented "${simActiveTriggerText}" on your post`
                                : triggerSource === "story"
                                  ? (["🔥", "❤️", "👏", "😍", "😮", "😂"].includes(simActiveTriggerText)
                                      ? `Reacted ${simActiveTriggerText} to your story`
                                      : `Story reply: "${simActiveTriggerText}"`)
                                  : `"${simActiveTriggerText}"`)
                            : incomingMsg(triggerSource, triggers, commentMatchAll, currentTriggerDraft)}
                        </div>
                      </div>

                      {/* ── STAGE 0: INITIAL GREETING & REQUEST CARD (ON LEFT) ── */}
                      <div className="flex justify-start items-end gap-1.5">
                        <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 self-end mb-0.5 bg-neutral-900">
                          <img
                            src={creatorProfilePic}
                            alt={creatorUsername}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                            }}
                          />
                        </div>
                        <div className="w-full max-w-[195px] bg-[#1c1c1e] text-white rounded-xl p-2.5 border border-zinc-800 space-y-1.5">
                          <h5 className="text-[10px] font-bold leading-tight">{initialTitle || "Hey there!"}</h5>
                          <p className="text-[8px] text-zinc-400 leading-snug">{initialSubtitle}</p>
                          <button
                            type="button"
                            onClick={() => {
                              if (simStage >= 1) {
                                setSimStage(0);
                                setTimeout(() => {
                                  setSimStage(1);
                                  if (checkFollow) {
                                    toast.info("Checking follow status... Non-follower detected, Gate triggered!");
                                  } else {
                                    toast.success("Request received! Payload delivered 🎉");
                                  }
                                }, 150);
                                return;
                              }
                              setSimStage(1);
                              if (checkFollow) {
                                toast.info("Checking follow status... Non-follower detected, Gate triggered!");
                              } else {
                                toast.success("Request received! Payload delivered 🎉");
                              }
                            }}
                            className={`w-full py-1 text-[10px] font-semibold rounded-lg cursor-pointer transition-all ${
                              simStage >= 1
                                ? "bg-emerald-600/30 border border-emerald-500/40 text-emerald-300"
                                : "bg-[#2c2c2e] hover:bg-[#38383a]"
                            }`}
                          >
                            {simStage >= 1 ? (
                              <span className="flex items-center justify-center gap-1 text-emerald-300 font-mono-ui">
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                {initialButtonText || "Send me the link"}
                              </span>
                            ) : (
                              <span>{initialButtonText || "Send me the link"}</span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* ── SUBSEQUENT STAGES: FOLLOW GATE FLOW OR DIRECT PAYLOAD ── */}
                      {checkFollow ? (
                        <>
                          {simStage >= 1 && (
                            <>
                              {/* Step 2: User reply on RIGHT */}
                              <div className="flex justify-end">
                                <div className="bg-[#5942d9] text-white rounded-xl px-2.5 py-1 text-[10px]">
                                  {initialButtonText || "Send me the link"}
                                </div>
                              </div>
                              {/* Step 2: Gate on LEFT */}
                              <div className="flex justify-start items-end gap-1.5">
                                <div className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700/60 shrink-0 self-end mb-0.5 bg-neutral-900">
                                  <img
                                    src={creatorProfilePic}
                                    alt={creatorUsername}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).src = "/mock/creator_avatar_hd.jpg"
                                    }}
                                  />
                                </div>
                                <div className="w-full max-w-[195px] bg-[#1c1c1e] text-white rounded-xl p-2.5 border border-zinc-800 space-y-1.5">
                                  {followGateImageUrl && (
                                    <div className="w-full h-16 rounded-lg overflow-hidden border border-white/5 bg-black/40">
                                      <img src={followGateImageUrl} alt="Cover" className="w-full h-full object-cover" />
                                    </div>
                                  )}
                                  <h5 className="text-[10px] font-bold leading-tight">{followGateTitle || "Hold on!"}</h5>
                                  <p className="text-[8px] text-zinc-400 leading-snug">{followGateSubtitle.replace(/{username}/g, creatorUsername)}</p>
                                  <div className="space-y-1 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => toast.info(`Simulated: Opening ${creatorHandle}'s Instagram profile`)}
                                      className="w-full py-1 bg-[#2c2c2e] hover:bg-[#38383a] text-[9px] font-semibold rounded-lg text-center cursor-pointer"
                                    >
                                      {followGateButtonFollow || "Visit Profile"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSimStage(2);
                                        toast.success("Follower verified! Resource unlocked 🎉");
                                      }}
                                      className="w-full py-1 bg-emerald-600 hover:bg-emerald-500 text-[9px] font-semibold rounded-lg text-center cursor-pointer"
                                    >
                                      {followGateButtonUnlock || "I'm following ✅"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                          {simStage >= 2 && (
                            <>
                              {/* Step 3: User reply on RIGHT */}
                              <div className="flex justify-end">
                                <div className="bg-[#5942d9] text-white rounded-xl px-2.5 py-1 text-[10px]">
                                  {followGateButtonUnlock || "I'm following ✅"}
                                </div>
                              </div>
                              {/* Step 3: Unlocked Payload on LEFT */}
                              {renderPayloadMessage(true, "🎁 Unlocked Payload")}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {simStage >= 1 && (
                            <>
                              {/* User reply on RIGHT */}
                              <div className="flex justify-end">
                                <div className="bg-[#5942d9] text-white rounded-xl px-2.5 py-1 text-[10px]">
                                  {initialButtonText || "Send me the link"}
                                </div>
                              </div>
                              {/* Delivered Payload on LEFT */}
                              {renderPayloadMessage(true, "🎁 Delivered Payload")}
                            </>
                          )}
                        </>
                      )}

                      <div ref={mobileChatBottomRef} />
                    </div>
                  </div>
                )}
              </div>

              {/* Interactive Live Preview Indicator */}
              <div className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-center">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <p className="text-[10px] text-zinc-400">
                  <strong className="text-zinc-200">Interactive Preview</strong> — Click post, comments, and buttons on the phone to test live.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   Helper renders & string parsers
   ============================================================ */

function incomingMsg(triggerSource: string, triggers: string[], commentMatchAll?: boolean, draft?: string): string {
  const primaryKw = draft?.trim() || (triggers.length > 0 ? triggers[0] : null)
  if (triggerSource === "comment") {
    if (commentMatchAll) return 'Commented on your post'
    return primaryKw ? `Commented "${primaryKw}"` : 'Commented on your post'
  }
  if (triggerSource === "story") {
    return primaryKw ? `Story reply: "${primaryKw}"` : "Interacted with your Story"
  }
  return primaryKw ? `DMed keyword "${primaryKw}"` : "Hey! I'm interested"
}

function hasDMContent(type: string, messageText: string, cardTitle: string, mediaUrl: string, cardImage?: string): boolean {
  if (type === "text") return true
  if (type === "card") return true
  if (type === "media") return true
  return false
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-foreground mb-1.5">{children}</p>
}

function TextField({ value, onChange, onFocus, placeholder }: { value: string; onChange: (v: string) => void; onFocus?: () => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      placeholder={placeholder}
      className="w-full h-10 bg-muted/30 border border-border rounded-xl px-3.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent-yellow/50 transition-all"
    />
  )
}

function ToggleRow({
  icon, title, sub, on, onToggle,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full p-3.5 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
        on
          ? "border-border/80 bg-muted/20 hover:border-foreground/30 hover:bg-muted/30"
          : "border-border/60 bg-card hover:border-foreground/20 hover:bg-accent/30"
      }`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
        on ? "bg-accent-yellow/15 text-accent-yellow" : "bg-muted text-muted-foreground"
      }`}>
        {icon}
      </div>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-foreground">{title}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{sub}</span>
      </span>
      {/* High-contrast Switch Toggle */}
      <span
        className={`w-10 h-5 rounded-full relative transition-all shrink-0 p-0.5 border ${
          on
            ? "bg-accent-yellow border-accent-yellow"
            : "bg-neutral-800 dark:bg-neutral-800 border-neutral-600 dark:border-neutral-500"
        }`}
      >
        <span
          className={`block w-4 h-4 rounded-full shadow-md transition-all ${
            on
              ? "translate-x-5 bg-black"
              : "translate-x-0 bg-white"
          }`}
        />
      </span>
    </button>
  )
}
