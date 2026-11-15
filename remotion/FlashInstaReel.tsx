import React from "react"
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
  Easing,
} from "remotion"
import { Audio } from "@remotion/media"
import {
  Zap,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Bot,
  ArrowRight,
  Sparkles,
  Instagram,
  TrendingUp,
  Inbox,
  Clock,
} from "lucide-react"
import { InstagramAutomationComposition } from "../components/video/InstagramAutomationComposition"

export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
export const REEL_FPS = 30
export const REEL_DURATION = 450 // 15 seconds @ 30fps

export function FlashInstaReel() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // -------------------------------------------------------------
  // 1. DYNAMIC VIRTUAL CAMERA RIG & LISSAJOUS DRIFT
  // -------------------------------------------------------------
  const driftX = Math.sin(frame * 0.04) * 6
  const driftY = Math.cos(frame * 0.035) * 5
  const camRotY = Math.sin(frame * 0.02) * 4
  const camRotX = Math.cos(frame * 0.025) * 3

  // Dynamic zoom punch-in during DM notification in Scene 2 (Frames 130 to 220)
  const phoneZoomPunch = interpolate(
    frame,
    [52, 80, 135, 155, 195, 230],
    [1.0, 1.48, 1.48, 1.62, 1.62, 1.48],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  )

  // -------------------------------------------------------------
  // 2. TIMELINE SCENE CONTROLLERS
  // -------------------------------------------------------------

  // --- SCENE 1 (Frames 0 - 65: High-Impact Hook & Problem Staging) ---
  const s1Badge = spring({ frame: frame - 6, fps, config: { damping: 11, stiffness: 150 } })
  const s1Title = spring({ frame: frame - 16, fps, config: { damping: 12, stiffness: 140 } })
  const s1Sub = spring({ frame: frame - 26, fps, config: { damping: 12, stiffness: 130 } })
  const s1Pill1 = spring({ frame: frame - 36, fps, config: { damping: 12, stiffness: 140 } })
  const s1Pill2 = spring({ frame: frame - 44, fps, config: { damping: 12, stiffness: 140 } })
  const s1Exit = interpolate(frame, [50, 65], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const s1ExitScale = interpolate(frame, [50, 65], [1, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // --- SCENE 2 (Frames 52 - 325: Centered 3D Phone Simulator) ---
  const s2PhoneEnter = spring({ frame: frame - 52, fps, config: { damping: 13, stiffness: 120 } })
  const s2Exit = interpolate(frame, [310, 325], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // Synchronized contextual badges flying in during Scene 2
  const s2Badge1 = spring({ frame: frame - 68, fps, config: { damping: 12, stiffness: 150 } })
  const s2Badge2 = spring({ frame: frame - 142, fps, config: { damping: 12, stiffness: 150 } })
  const s2Badge3 = spring({ frame: frame - 195, fps, config: { damping: 12, stiffness: 150 } })

  // --- SCENE 3 (Frames 315 - 450: Feature Proof Matrix & High-Conversion CTA) ---
  const s3Enter = spring({ frame: frame - 318, fps, config: { damping: 13, stiffness: 130 } })
  const s3Card1 = spring({ frame: frame - 330, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card2 = spring({ frame: frame - 338, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card3 = spring({ frame: frame - 346, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card4 = spring({ frame: frame - 354, fps, config: { damping: 12, stiffness: 150 } })
  const s3CtaSpring = spring({ frame: frame - 368, fps, config: { damping: 12, stiffness: 140 } })

  // Rotating border beam angle
  const beamAngle = (frame * 4.5) % 360

  // Continuous subtle CTA pulse
  const pulse = Math.sin((frame / 12) * Math.PI) * 0.04 + 1

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#05070d",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, sans-serif",
        color: "#ffffff",
        overflow: "hidden",
      }}
    >
      {/* ----------------------------------------------------------- */}
      {/* 1. COMPREHENSIVE AUDIO SOUNDTRACK & SFX ENGINE             */}
      {/* ----------------------------------------------------------- */}
      {/* Looping Ambient Synth Groove */}
      <Audio src={staticFile("sfx/ambient-beat.wav")} volume={0.4} loop />

      {/* Scene 1 Bass Impact Hit */}
      <Sequence from={14} durationInFrames={35}>
        <Audio src={staticFile("sfx/bass-impact.wav")} volume={0.8} />
      </Sequence>

      {/* Scene 1 to Scene 2 Camera Transition Sweep */}
      <Sequence from={50} durationInFrames={30}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.6} />
      </Sequence>

      {/* Synchronized Pop Cues for Scene 2 Badges */}
      <Sequence from={68} durationInFrames={15}>
        <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={142} durationInFrames={20}>
        <Audio src={staticFile("sfx/ios-chime.wav")} volume={0.7} />
      </Sequence>
      <Sequence from={195} durationInFrames={15}>
        <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
      </Sequence>

      {/* Scene 2 to Scene 3 Transition Sweep */}
      <Sequence from={312} durationInFrames={30}>
        <Audio src={staticFile("sfx/quick-whoosh.wav")} volume={0.65} />
      </Sequence>

      {/* Scene 3 Final Impact Reveal */}
      <Sequence from={368} durationInFrames={35}>
        <Audio src={staticFile("sfx/bass-impact.wav")} volume={0.85} />
      </Sequence>

      {/* ----------------------------------------------------------- */}
      {/* 2. ATMOSPHERIC LIGHTING & VOLUMETRIC BACKGROUND             */}
      {/* ----------------------------------------------------------- */}
      {/* Grid Pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, #000 50%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 85% 75% at 50% 50%, #000 50%, transparent 100%)",
          transform: `translate(${driftX * 0.4}px, ${driftY * 0.4}px)`,
        }}
      />

      {/* Top Gold Ambient Flare */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "20%",
          width: 650,
          height: 650,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 225, 77, 0.12)",
          filter: "blur(140px)",
          transform: `translate(${driftX}px, ${driftY}px)`,
        }}
      />

      {/* Bottom Cyan Ambient Flare */}
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          right: "15%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          backgroundColor: "rgba(56, 189, 248, 0.12)",
          filter: "blur(150px)",
          transform: `translate(${-driftX}px, ${-driftY}px)`,
        }}
      />

      {/* Floating 3D Sparkle Particles with Depth */}
      {[
        { x: 120, y: 350, size: 8, color: "#ffe14d", speed: 0.04 },
        { x: 920, y: 480, size: 10, color: "#38bdf8", speed: 0.03 },
        { x: 180, y: 1200, size: 6, color: "#34d399", speed: 0.05 },
        { x: 890, y: 1350, size: 8, color: "#ffe14d", speed: 0.035 },
        { x: 500, y: 220, size: 12, color: "#ffe14d", speed: 0.025 },
        { x: 540, y: 1680, size: 9, color: "#38bdf8", speed: 0.04 },
      ].map((p, idx) => {
        const floatY = Math.sin(frame * p.speed + idx) * 18
        const floatX = Math.cos(frame * p.speed * 0.8 + idx) * 12
        const sparkleOpacity = (Math.sin(frame * 0.08 + idx * 1.5) + 1) * 0.4 + 0.2
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: p.x + floatX,
              top: p.y + floatY,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              backgroundColor: p.color,
              boxShadow: `0 0 16px ${p.color}, 0 0 30px ${p.color}`,
              opacity: sparkleOpacity,
              pointerEvents: "none",
              zIndex: 15,
            }}
          />
        )
      })}

      {/* ========================================================= */}
      {/* SCENE 1: HOOK & VALUE PROP (Frames 0 - 65)                 */}
      {/* ========================================================= */}
      {frame < 65 && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "80px 50px",
            textAlign: "center",
            opacity: s1Exit,
            transform: `scale(${s1ExitScale}) translate(${driftX * 0.5}px, ${driftY * 0.5}px)`,
            zIndex: 40,
          }}
        >
          {/* Logo Badge */}
          <div
            style={{
              transform: `scale(${s1Badge})`,
              opacity: Math.min(1, Math.max(0, s1Badge)),
              display: "flex",
              alignItems: "center",
              gap: 12,
              backgroundColor: "rgba(22, 27, 38, 0.92)",
              border: "1px solid rgba(255, 225, 77, 0.45)",
              padding: "10px 28px",
              borderRadius: 999,
              marginBottom: 32,
              boxShadow: "0 8px 30px rgba(0, 0, 0, 0.6), 0 0 25px rgba(255, 225, 77, 0.2)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                backgroundColor: "#ffe14d",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={20} color="#000000" fill="#000000" />
            </div>
            <span style={{ fontSize: 24, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.02em" }}>
              flash<span style={{ color: "#ffe14d" }}>insta</span>
            </span>
            <span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 700 }}>· Meta API v24.0</span>
          </div>

          {/* Attention-Grabbing Hook */}
          <div
            style={{
              transform: `scale(${s1Badge})`,
              opacity: Math.min(1, Math.max(0, s1Badge)),
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: 999,
              padding: "8px 24px",
              color: "#f87171",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 24,
            }}
          >
            ⚠️ Stop Losing 98% of Comment Leads
          </div>

          <h1
            style={{
              transform: `translateY(${(1 - Math.min(1, s1Title)) * 40}px)`,
              opacity: Math.min(1, Math.max(0, s1Title)),
              fontSize: 58,
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              maxWidth: 960,
              margin: "0 0 24px 0",
              textShadow: "0 4px 30px rgba(0, 0, 0, 0.9)",
            }}
          >
            Turn Every <span style={{ color: "#ffe14d" }}>&apos;GROW&apos;</span> Comment into an Instant DM
          </h1>

          <p
            style={{
              transform: `translateY(${(1 - Math.min(1, s1Sub)) * 30}px)`,
              opacity: Math.min(1, Math.max(0, s1Sub)),
              fontSize: 24,
              color: "#94a3b8",
              maxWidth: 820,
              margin: "0 0 44px 0",
              lineHeight: 1.45,
            }}
          >
            Deliver lead magnets, discounts, and links in <strong style={{ color: "#38bdf8" }}>1.2 seconds</strong> while users are actively scrolling.
          </p>

          {/* Value Proof Pills */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            <div
              style={{
                transform: `scale(${s1Pill1})`,
                opacity: Math.min(1, Math.max(0, s1Pill1)),
                backgroundColor: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                borderRadius: 16,
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 18,
                fontWeight: 800,
                color: "#ffffff",
              }}
            >
              <Clock size={20} color="#38bdf8" />
              <span>&lt; 1.2s Response Time</span>
            </div>

            <div
              style={{
                transform: `scale(${s1Pill2})`,
                opacity: Math.min(1, Math.max(0, s1Pill2)),
                backgroundColor: "rgba(30, 41, 59, 0.8)",
                border: "1px solid rgba(52, 211, 153, 0.4)",
                borderRadius: 16,
                padding: "12px 24px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 18,
                fontWeight: 800,
                color: "#ffffff",
              }}
            >
              <ShieldCheck size={20} color="#34d399" />
              <span>100% Meta Graph API Safe</span>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================= */}
      {/* SCENE 2: 3D INTERACTIVE PHONE DEMO (Frames 52 - 325)       */}
      {/* ========================================================= */}
      {frame >= 50 && frame < 325 && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: Math.min(1, Math.max(0, s2PhoneEnter)) * s2Exit,
            zIndex: 30,
            perspective: 1300,
          }}
        >
          {/* Top Persistent Mini Header */}
          <div
            style={{
              position: "absolute",
              top: 70,
              left: 40,
              right: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 35,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                backgroundColor: "rgba(15, 23, 42, 0.85)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                padding: "8px 20px",
                borderRadius: 999,
              }}
            >
              <Zap size={18} color="#ffe14d" />
              <span style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>
                flash<span style={{ color: "#ffe14d" }}>insta</span>
              </span>
            </div>

            <div
              style={{
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.35)",
                padding: "8px 18px",
                borderRadius: 999,
                color: "#34d399",
                fontSize: 14,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#34d399" }} />
              Live Meta Automation
            </div>
          </div>

          {/* 3D Phone Chassis with Dynamic Zoom Punch & Lissajous Tilt */}
          <div
            style={{
              transform: `
                rotateY(${camRotY}deg)
                rotateX(${camRotX}deg)
                scale(${phoneZoomPunch})
                translate3d(${driftX}px, ${driftY}px, 0px)
              `,
              transformStyle: "preserve-3d",
            }}
          >
            {/* Glowing Rotating Border Beam Shell */}
            <div
              style={{
                position: "relative",
                width: 395,
                height: 685,
                borderRadius: 50,
                padding: 4,
                background: `conic-gradient(from ${beamAngle}deg, #ffe14d, #38bdf8, #34d399, transparent 65%, #ffe14d)`,
                boxShadow: "0 40px 100px -20px rgba(0, 0, 0, 0.95), 0 0 60px rgba(255, 225, 77, 0.22)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: 46,
                  backgroundColor: "#000000",
                  overflow: "hidden",
                }}
              >
                {/* Embedded Phone Simulation Sequence */}
                <Sequence from={55} durationInFrames={270}>
                  <InstagramAutomationComposition
                    enableAudio={true}
                    enableCursor={true}
                    loopFadeEnabled={false}
                  />
                </Sequence>
              </div>
            </div>
          </div>

          {/* Synchronized Callout Badges Flanking the Phone */}
          {/* Badge 1: 1.2s Delivery Trigger (Left) */}
          <div
            style={{
              position: "absolute",
              top: 450,
              left: 40,
              transform: `scale(${s2Badge1}) translate(${driftX}px, ${driftY}px)`,
              opacity: Math.min(1, Math.max(0, s2Badge1)),
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(56, 189, 248, 0.5)",
              borderRadius: 20,
              padding: "12px 22px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 35,
              boxShadow: "0 12px 35px rgba(0, 0, 0, 0.8)",
            }}
          >
            <Zap size={22} color="#38bdf8" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>1.2s Trigger</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Webhook Instant Fired</div>
            </div>
          </div>

          {/* Badge 2: Rich DM Sent (Right) */}
          <div
            style={{
              position: "absolute",
              top: 680,
              right: 40,
              transform: `scale(${s2Badge2}) translate(${-driftX}px, ${driftY}px)`,
              opacity: Math.min(1, Math.max(0, s2Badge2)),
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255, 225, 77, 0.5)",
              borderRadius: 20,
              padding: "12px 22px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 35,
              boxShadow: "0 12px 35px rgba(0, 0, 0, 0.8)",
            }}
          >
            <Inbox size={22} color="#ffe14d" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Direct Inbound DM</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Rich Link Card Delivered</div>
            </div>
          </div>

          {/* Badge 3: Follow-Gate Funnel (Left Bottom) */}
          <div
            style={{
              position: "absolute",
              bottom: 260,
              left: 40,
              transform: `scale(${s2Badge3}) translate(${driftX}px, ${-driftY}px)`,
              opacity: Math.min(1, Math.max(0, s2Badge3)),
              backgroundColor: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(52, 211, 153, 0.5)",
              borderRadius: 20,
              padding: "12px 22px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 35,
              boxShadow: "0 12px 35px rgba(0, 0, 0, 0.8)",
            }}
          >
            <Lock size={22} color="#34d399" />
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>Follow-Gate Funnel</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>3x More Followers First</div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================= */}
      {/* SCENE 3: FEATURE MATRIX & HIGH-CONVERTING CTA (315 - 450)  */}
      {/* ========================================================= */}
      {frame >= 315 && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "90px 48px",
            textAlign: "center",
            opacity: Math.min(1, Math.max(0, s3Enter)),
            transform: `translate(${driftX * 0.3}px, ${driftY * 0.3}px)`,
            zIndex: 40,
          }}
        >
          {/* Section Header */}
          <div
            style={{
              backgroundColor: "rgba(255, 225, 77, 0.15)",
              border: "1px solid rgba(255, 225, 77, 0.4)",
              borderRadius: 999,
              padding: "8px 24px",
              color: "#ffe14d",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 20,
            }}
          >
            Built for Serious Instagram Creators
          </div>

          <h2
            style={{
              fontSize: 52,
              fontWeight: 900,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              maxWidth: 920,
              margin: "0 0 40px 0",
              color: "#ffffff",
              textShadow: "0 4px 30px rgba(0, 0, 0, 0.9)",
            }}
          >
            Never Leave a Comment Lead on Read Again
          </h2>

          {/* 4-Card Feature Proof Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              width: "100%",
              maxWidth: 960,
              marginBottom: 50,
            }}
          >
            {[
              {
                icon: Zap,
                title: "1.2s Delivery Speed",
                desc: "Triggered instantly via official Meta Graph API v24.0 webhooks.",
                color: "#ffe14d",
                spring: s3Card1,
              },
              {
                icon: Lock,
                title: "Follow-Gate Funnels",
                desc: "Check follower status before dispatching links to 3x follower gains.",
                color: "#38bdf8",
                spring: s3Card2,
              },
              {
                icon: ShieldCheck,
                title: "Anti-Spam Spintax",
                desc: "Natural human delay jitter and message spinning prevent rate limits.",
                color: "#34d399",
                spring: s3Card3,
              },
              {
                icon: Bot,
                title: "Groq AI Auto-Pilot",
                desc: "Understands user intent and replies with high-converting precision.",
                color: "#c084fc",
                spring: s3Card4,
              },
            ].map((card, i) => {
              const Icon = card.icon
              const cardScale = card.spring
              const cardOpacity = Math.min(1, Math.max(0, card.spring))
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "rgba(18, 24, 38, 0.9)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 24,
                    padding: "24px 22px",
                    textAlign: "left",
                    transform: `scale(${cardScale})`,
                    opacity: cardOpacity,
                    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
                  }}
                >
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 14,
                      backgroundColor: `${card.color}20`,
                      color: card.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff", marginBottom: 6 }}>
                    {card.title}
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.45 }}>
                    {card.desc}
                  </div>
                </div>
              )
            })}
          </div>

          {/* High-Conversion Bottom CTA */}
          <div
            style={{
              transform: `scale(${s3CtaSpring})`,
              opacity: Math.min(1, Math.max(0, s3CtaSpring)),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                transform: `scale(${pulse})`,
                backgroundColor: "#ffe14d",
                color: "#000000",
                fontSize: 24,
                fontWeight: 900,
                padding: "20px 56px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 14,
                boxShadow: "0 12px 40px rgba(255, 225, 77, 0.55)",
              }}
            >
              <span>Start Automating Free</span>
              <ArrowRight size={26} />
            </div>

            <div style={{ fontSize: 16, color: "#94a3b8", marginTop: 18, fontWeight: 700 }}>
              No Credit Card Required · Setup in Under 2 Minutes
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
