"use client"

import React from "react"
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion"
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  Music,
  CheckCircle2,
  ChevronLeft,
  Phone,
  Video,
  ArrowRight,
  Camera,
  Instagram,
} from "lucide-react"

export const COMPOSITION_WIDTH = 395
export const COMPOSITION_HEIGHT = 685
export const COMPOSITION_FPS = 30
export const COMPOSITION_DURATION = 240 // 8 seconds @ 30fps

export function InstagramAutomationComposition() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // -------------------------------------------------------------
  // ANIMATION TIMELINE MATH (Frames 0 to 240)
  // -------------------------------------------------------------

  // Comment sheet slides up at frame 15
  const commentSheetProgress = spring({
    frame: frame - 15,
    fps,
    config: { damping: 14, stiffness: 120 },
  })
  const commentSheetY = interpolate(commentSheetProgress, [0, 1], [420, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // Typing "GROW please! 🔥" between frames 22 and 48
  const fullText = "GROW please! 🔥"
  const typingProgress = interpolate(frame, [22, 48], [0, fullText.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const typedString = fullText.slice(0, Math.floor(typingProgress))
  const showCursor = frame >= 20 && frame < 52 && Math.floor(frame / 5) % 2 === 0

  // Post button tap spring at frame 50
  const postTapScale = spring({
    frame: frame - 50,
    fps,
    config: { damping: 10, mass: 0.4, stiffness: 220 },
  })

  // User Alex's comment appears at frame 52
  const alexCommentAppear = spring({
    frame: frame - 52,
    fps,
    config: { damping: 12, stiffness: 160 },
  })

  // Creator @ee.info public reply underneath at frame 70
  const creatorReplyAppear = spring({
    frame: frame - 70,
    fps,
    config: { damping: 13, stiffness: 160 },
  })

  // iOS Push Notification drops down at frame 82
  const pushNotificationProgress = spring({
    frame: frame - 82,
    fps,
    config: { damping: 15, mass: 0.8, stiffness: 130 },
  })
  const pushNotificationY = interpolate(pushNotificationProgress, [0, 1], [-130, 20])

  // Tap ripple at frame 112
  const tapRippleScale = spring({
    frame: frame - 112,
    fps,
    config: { damping: 12, stiffness: 220 },
  })

  // Screen transition: Reel -> DM Screen (Frames 116 to 132)
  const screenSwitchProgress = interpolate(frame, [116, 132], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  })

  // Inbound typing indicator in DM (Frames 128 to 142)
  const showDmTyping = frame >= 128 && frame < 144

  // Inbound DM message bubble appears at frame 144
  const dmBubbleAppear = spring({
    frame: frame - 144,
    fps,
    config: { damping: 13, stiffness: 160 },
  })

  // Rich link card appears at frame 156
  const richCardAppear = spring({
    frame: frame - 156,
    fps,
    config: { damping: 13, stiffness: 150 },
  })

  // Seamless loop fade out at the very end (Frames 234 to 240)
  const loopFade = interpolate(frame, [234, 240], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // Audio spinning disc rotation
  const discRotation = (frame * 3) % 360

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#000000",
        color: "#ffffff",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
        opacity: loopFade,
      }}
    >
      {/* iOS Dynamic Island & Status Bar (Edge-to-Edge inside Phone Canvas) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 42,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 60,
          fontSize: 13,
          fontWeight: 700,
          color: "#ffffff",
          pointerEvents: "none",
        }}
      >
        <span>9:41</span>
        {/* Dynamic Island Capsule */}
        <div
          style={{
            width: 96,
            height: 24,
            borderRadius: 20,
            backgroundColor: "#000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            border: "1px solid rgba(255, 255, 255, 0.12)",
          }}
        >
          <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#1e293b" }} />
          <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#0284c7" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700 }}>5G</span>
          <div
            style={{
              width: 20,
              height: 10,
              borderRadius: 3.5,
              border: "1.5px solid #ffffff",
              padding: 1,
              display: "flex",
            }}
          >
            <div style={{ width: "85%", height: "100%", backgroundColor: "#ffffff", borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SCREEN A: 100% REAL INSTAGRAM REEL FULL BLEED             */}
      {/* ========================================================= */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#000000",
          display: "flex",
          flexDirection: "column",
          transform: `translateX(-${screenSwitchProgress * 100}%)`,
          opacity: 1 - screenSwitchProgress,
        }}
      >
        {/* Full Bleed Reel Video Background (Cinematic Creator Aesthetic) */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #181528 0%, #2a2050 40%, #151125 75%, #05040a 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Ambient Video Light Flares */}
          <div
            style={{
              position: "absolute",
              top: "28%",
              width: 280,
              height: 280,
              borderRadius: "50%",
              backgroundColor: "rgba(255, 225, 77, 0.18)",
              filter: "blur(60px)",
            }}
          />

          {/* Reel Video Center Title */}
          <div
            style={{
              position: "relative",
              zIndex: 10,
              textAlign: "center",
              padding: "0 24px",
              transform: "translateY(-40px)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 999,
                backgroundColor: "rgba(255, 225, 77, 0.15)",
                border: "1px solid rgba(255, 225, 77, 0.4)",
                color: "#ffe14d",
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              ⚡ FREE DOWNLOAD
            </div>
            <h2
              style={{
                fontSize: 26,
                fontWeight: 900,
                lineHeight: 1.2,
                letterSpacing: "-0.03em",
                color: "#ffffff",
                textShadow: "0 4px 20px rgba(0, 0, 0, 0.8)",
                margin: 0,
              }}
            >
              2026 Creator &amp; Brand Growth Toolkit
            </h2>
            <div
              style={{
                marginTop: 14,
                fontSize: 13,
                fontWeight: 700,
                color: "#e2e8f0",
                backgroundColor: "rgba(0, 0, 0, 0.65)",
                padding: "8px 18px",
                borderRadius: 999,
                display: "inline-flex",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              Comment <strong style={{ color: "#ffe14d", margin: "0 4px" }}>&apos;GROW&apos;</strong> to get it in DMs!
            </div>
          </div>
        </div>

        {/* Top Reels App Bar */}
        <div
          style={{
            position: "absolute",
            top: 44,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            zIndex: 20,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.04em", color: "#ffffff" }}>
            Reels
          </span>
          <Camera size={22} color="#ffffff" />
        </div>

        {/* Real Instagram Right Action Column */}
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 85,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 18,
            zIndex: 20,
          }}
        >
          {/* Heart / Like */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <Heart size={26} color="#ffffff" strokeWidth={2.2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff" }}>48.2K</span>
          </div>

          {/* Comment */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <MessageCircle size={26} color="#ffffff" strokeWidth={2.2} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff" }}>1,492</span>
          </div>

          {/* Share */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <Send size={24} color="#ffffff" strokeWidth={2.2} style={{ transform: "rotate(-20deg)" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff" }}>9.1K</span>
          </div>

          {/* Bookmark */}
          <Bookmark size={24} color="#ffffff" strokeWidth={2.2} />

          {/* More Menu */}
          <MoreHorizontal size={22} color="#ffffff" />

          {/* Audio Vinyl Disc (Spinning) */}
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "linear-gradient(45deg, #111, #444, #111)",
              border: "2px solid #ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `rotate(${discRotation}deg)`,
              marginTop: 4,
            }}
          >
            <Music size={12} color="#ffffff" />
          </div>
        </div>

        {/* Real Instagram Bottom Info & Caption Overlay */}
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 24,
            right: 70,
            zIndex: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Creator Row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                padding: 2,
                display: "flex",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "50%",
                  backgroundColor: "#000000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 13,
                  color: "#ffe14d",
                }}
              >
                E
              </div>
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff" }}>ee.info</span>
            <CheckCircle2 size={15} color="#38bdf8" />
            <button
              type="button"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: 999,
                marginLeft: 2,
              }}
            >
              Follow
            </button>
          </div>

          {/* Reel Caption */}
          <div style={{ fontSize: 13, lineHeight: 1.4, color: "#ffffff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            Comment <strong>&apos;GROW&apos;</strong> to get the 2026 Growth Toolkit in your DMs in 2s flat! 🚀 <span style={{ color: "#93c5fd" }}>#creators #growth</span>
          </div>

          {/* Audio Track Ticker */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ffffff" }}>
            <Music size={12} />
            <span>ee.info · Original audio</span>
          </div>
        </div>

        {/* ======================================================= */}
        {/* REAL INSTAGRAM COMMENT BOTTOM SHEET (SLIDES UP)         */}
        {/* ======================================================= */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 440,
            backgroundColor: "rgba(18, 22, 31, 0.98)",
            backdropFilter: "blur(24px)",
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
            zIndex: 35,
            display: "flex",
            flexDirection: "column",
            transform: `translateY(${commentSheetY}px)`,
            boxShadow: "0 -10px 40px rgba(0, 0, 0, 0.8)",
          }}
        >
          {/* Sheet Drag Handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(255, 255, 255, 0.3)" }} />
          </div>

          {/* Sheet Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 18px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 800, color: "#ffffff" }}>
              Comments (1,492)
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>Most relevant ▾</span>
          </div>

          {/* Real Comment Feed Stream */}
          <div
            style={{
              flex: 1,
              padding: "12px 18px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              overflow: "hidden",
            }}
          >
            {/* Existing Follower Comment */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  backgroundColor: "#ec4899",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: "bold",
                }}
              >
                S
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>sarah.creates</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>2h</span>
                </div>
                <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 2 }}>
                  This is super helpful, love your playbooks! 🔥
                </div>
                <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>Reply</span>
              </div>
              <Heart size={14} color="#64748b" />
            </div>

            {/* Alex's Comment (Appears at Frame 52) */}
            {frame >= 52 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  transform: `scale(${Math.min(1, alexCommentAppear)})`,
                  opacity: Math.min(1, alexCommentAppear),
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      backgroundColor: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      fontWeight: "bold",
                      color: "#ffffff",
                    }}
                  >
                    A
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>alex.builds</span>
                      <span style={{ fontSize: 11, color: "#64748b" }}>Just now</span>
                    </div>
                    <div style={{ fontSize: 14, color: "#ffffff", fontWeight: 700, marginTop: 2 }}>
                      GROW please! 🔥
                    </div>
                    <span style={{ fontSize: 11, color: "#64748b", marginTop: 4, display: "block" }}>Reply</span>
                  </div>
                  <Heart size={14} color="#ef4444" fill="#ef4444" />
                </div>

                {/* Creator Automated Public Reply (Appears at Frame 70) */}
                {frame >= 70 && (
                  <div
                    style={{
                      marginLeft: 42,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      padding: "8px 12px",
                      borderRadius: 12,
                      transform: `scale(${Math.min(1, creatorReplyAppear)})`,
                      opacity: Math.min(1, creatorReplyAppear),
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: "#ffe14d",
                        color: "#000000",
                        fontWeight: 900,
                        fontSize: 11,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      E
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>ee.info</span>
                        <span
                          style={{
                            fontSize: 9,
                            backgroundColor: "rgba(16, 185, 129, 0.25)",
                            color: "#34d399",
                            padding: "1px 5px",
                            borderRadius: 4,
                            fontWeight: 700,
                          }}
                        >
                          Author · Auto Reply
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#ffffff", marginTop: 2 }}>
                        Sent to your DMs! Check your requests folder 🚀
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Real Comment Input Dock */}
          <div
            style={{
              padding: "10px 16px 16px 16px",
              borderTop: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              backgroundColor: "#0d1117",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: "#3b82f6",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              A
            </div>

            {/* Instagram Input Pill Bar */}
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                borderRadius: 999,
                padding: "8px 14px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
              }}
            >
              <div style={{ flex: 1, fontSize: 13, color: "#ffffff", display: "flex", alignItems: "center", fontWeight: 600 }}>
                <span>{typedString}</span>
                {showCursor && (
                  <span
                    style={{
                      width: 2,
                      height: 15,
                      backgroundColor: "#38bdf8",
                      marginLeft: 2,
                    }}
                  />
                )}
                {typedString.length === 0 && (
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Add a comment for ee.info...</span>
                )}
              </div>
              <div
                style={{
                  transform: `scale(${frame >= 50 && frame < 58 ? Math.max(0.75, postTapScale) : 1})`,
                  color: typedString.length > 0 ? "#38bdf8" : "#64748b",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                  paddingLeft: 6,
                }}
              >
                Post
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SCREEN B: 100% REAL INSTAGRAM DIRECT MESSAGE (DM) VIEW    */}
      {/* ========================================================= */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#0d1117",
          display: "flex",
          flexDirection: "column",
          transform: `translateX(${(1 - screenSwitchProgress) * 100}%)`,
          opacity: screenSwitchProgress,
        }}
      >
        {/* Real Instagram DM Top Navigation */}
        <div
          style={{
            paddingTop: 42,
            height: 94,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 14,
            paddingRight: 16,
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
            backgroundColor: "rgba(13, 17, 23, 0.95)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ChevronLeft size={26} color="#ffffff" />
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "#ffe14d",
                color: "#000000",
                fontWeight: 900,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                position: "relative",
              }}
            >
              E
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: "#34d399",
                  border: "2px solid #0d1117",
                }}
              />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>ee.info</span>
                <CheckCircle2 size={15} color="#38bdf8" />
              </div>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>Active now</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Phone size={20} color="#ffffff" />
            <Video size={22} color="#ffffff" />
          </div>
        </div>

        {/* DM Chat Message Stream */}
        <div
          style={{
            flex: 1,
            padding: "16px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            justifyContent: "flex-end",
            paddingBottom: 28,
          }}
        >
          {/* Outbound Message from Alex */}
          <div
            style={{
              alignSelf: "flex-end",
              backgroundColor: "#3b82f6",
              borderRadius: "20px 20px 4px 20px",
              padding: "11px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: "#ffffff",
              boxShadow: "0 3px 10px rgba(0, 0, 0, 0.3)",
            }}
          >
            GROW please! 🔥
          </div>

          {/* Instagram 3-Dot Typing Bubble */}
          {showDmTyping && (
            <div
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#1f2937",
                borderRadius: "18px 18px 18px 4px",
                padding: "10px 16px",
                display: "flex",
                gap: 5,
                alignItems: "center",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#94a3b8" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#94a3b8" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#94a3b8" }} />
            </div>
          )}

          {/* Inbound Automated DM Bubble from @ee.info */}
          {frame >= 144 && (
            <div
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#1e293b",
                borderRadius: "22px 22px 22px 4px",
                padding: "13px 18px",
                fontSize: 14,
                fontWeight: 500,
                maxWidth: "88%",
                lineHeight: 1.5,
                color: "#ffffff",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                transform: `scale(${Math.min(1, dmBubbleAppear)})`,
                opacity: Math.min(1, dmBubbleAppear),
                boxShadow: "0 6px 16px rgba(0, 0, 0, 0.4)",
              }}
            >
              Hey Alex! 🚀 Saw your comment on our Reel. Here is your private download link for the <strong>2026 Growth Toolkit</strong>:
            </div>
          )}

          {/* Real Instagram Rich Link Card Component */}
          {frame >= 156 && (
            <div
              style={{
                alignSelf: "flex-start",
                width: "92%",
                borderRadius: 20,
                backgroundColor: "#161d2b",
                border: "1px solid rgba(255, 225, 77, 0.45)",
                overflow: "hidden",
                boxShadow: "0 12px 35px rgba(0, 0, 0, 0.6)",
                transform: `scale(${Math.min(1, richCardAppear)})`,
                opacity: Math.min(1, richCardAppear),
              }}
            >
              <div
                style={{
                  padding: "14px 16px",
                  background: "linear-gradient(135deg, #1e1b4b, #312e81)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: "#ffe14d",
                    color: "#000000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                  }}
                >
                  ⚡
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: "#ffffff" }}>
                    Growth_Toolkit_2026.pdf
                  </div>
                  <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                    notion.so/ee-info · 12 MB
                  </div>
                </div>
              </div>

              <div style={{ padding: 14 }}>
                <div
                  style={{
                    backgroundColor: "#ffe14d",
                    color: "#000000",
                    fontWeight: 900,
                    fontSize: 14,
                    padding: "11px 16px",
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 4px 14px rgba(255, 225, 77, 0.4)",
                  }}
                >
                  <span>Download Free Toolkit</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* REAL iOS PUSH NOTIFICATION (DROPS DOWN AT FRAME 82)       */}
      {/* ========================================================= */}
      {frame >= 82 && frame <= 130 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 12,
            right: 12,
            transform: `translateY(${pushNotificationY}px) scale(${frame >= 112 ? Math.max(0.92, tapRippleScale) : 1})`,
            backgroundColor: "rgba(22, 27, 36, 0.98)",
            backdropFilter: "blur(25px)",
            border: "1px solid rgba(255, 225, 77, 0.5)",
            borderRadius: 22,
            padding: "12px 16px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            boxShadow: "0 18px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(255, 225, 77, 0.2)",
            zIndex: 70,
          }}
        >
          {/* Instagram App Icon */}
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              flexShrink: 0,
            }}
          >
            <Instagram size={22} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "#ffffff", letterSpacing: "0.02em" }}>
                INSTAGRAM · now
              </span>
              <span
                style={{
                  fontSize: 11,
                  backgroundColor: "rgba(16, 185, 129, 0.2)",
                  color: "#34d399",
                  padding: "2px 7px",
                  borderRadius: 999,
                  fontWeight: 800,
                }}
              >
                ⚡ 1.2s
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#e2e8f0", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <strong>ee.info:</strong> Hey Alex! Here is your 2026 Growth Toolkit...
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  )
}
