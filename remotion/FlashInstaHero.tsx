import React from "react"
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile,
} from "remotion"
import { Audio } from "@remotion/media"
import {
  Zap,
  CheckCircle2,
  ShieldCheck,
  Bot,
  Lock,
  ArrowRight,
  Sparkles,
  Instagram,
  Users,
  MessageCircle,
  Inbox,
  TrendingUp,
} from "lucide-react"
import { InstagramAutomationComposition } from "../components/video/InstagramAutomationComposition"

export const HERO_WIDTH = 1920
export const HERO_HEIGHT = 1080
export const HERO_FPS = 30
export const HERO_DURATION = 450 // 15 seconds @ 30fps

export interface FlashInstaHeroProps {
  enableAudio?: boolean
}

export function FlashInstaHero({ enableAudio = false }: FlashInstaHeroProps = {}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // -------------------------------------------------------------
  // 1. DYNAMIC VIRTUAL CAMERA RIG (3D Orbit, Zoom Punch & Lissajous Drift)
  // -------------------------------------------------------------

  // Subtle ambient camera breathing/drift (eliminates static/robotic feel)
  const driftX = Math.sin(frame * 0.03) * 6
  const driftY = Math.cos(frame * 0.025) * 5
  const driftRotZ = Math.sin(frame * 0.02) * 0.35

  // Scene 2 3D Camera Angles & Punch-ins (Frames 95 to 340)
  // Dynamic camera angle: rotates from -16deg to -8deg as interaction progresses
  const s2CamRotY = interpolate(frame, [95, 170, 260, 335], [-16, -10, -14, -6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const s2CamRotX = interpolate(frame, [95, 170, 260, 335], [8, 5, 7, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  // Zoom punch-in when typing starts (Frame 110-150) and pulls back
  const s2CamZoom = interpolate(frame, [95, 120, 155, 190, 330], [1.0, 1.15, 1.18, 1.05, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  // -------------------------------------------------------------
  // 2. TIMELINE PHASES & SPRING ENGINES
  // -------------------------------------------------------------

  // --- SCENE 1 (Frames 0 - 105: The Hook & Value Prop) ---
  const s1Badge = spring({ frame: frame - 6, fps, config: { damping: 11, stiffness: 150 } })
  const s1Word1 = spring({ frame: frame - 16, fps, config: { damping: 12, stiffness: 140 } })
  const s1Word2 = spring({ frame: frame - 22, fps, config: { damping: 12, stiffness: 140 } })
  const s1Word3 = spring({ frame: frame - 28, fps, config: { damping: 12, stiffness: 140 } })
  const s1Sub = spring({ frame: frame - 40, fps, config: { damping: 14, stiffness: 120 } })
  const s1Pill1 = spring({ frame: frame - 50, fps, config: { damping: 12, stiffness: 130 } })
  const s1Pill2 = spring({ frame: frame - 58, fps, config: { damping: 12, stiffness: 130 } })
  const s1Pill3 = spring({ frame: frame - 66, fps, config: { damping: 12, stiffness: 130 } })

  const s1Exit = interpolate(frame, [88, 105], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const s1ExitScale = interpolate(frame, [88, 105], [1, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // --- SCENE 2 (Frames 95 - 340: 3D Live Engine Showcase) ---
  const s2Enter = spring({ frame: frame - 95, fps, config: { damping: 14, stiffness: 110 } })
  const s2Exit = interpolate(frame, [325, 342], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  // Dynamic step cards activation in Scene 2
  const step1Active = frame >= 95 && frame < 170
  const step2Active = frame >= 170 && frame < 240
  const step3Active = frame >= 240 && frame < 335

  // --- SCENE 3 (Frames 325 - 450: Power Grid & High-Conversion CTA) ---
  const s3Enter = spring({ frame: frame - 330, fps, config: { damping: 14, stiffness: 120 } })
  const s3Card1 = spring({ frame: frame - 342, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card2 = spring({ frame: frame - 350, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card3 = spring({ frame: frame - 358, fps, config: { damping: 12, stiffness: 150 } })
  const s3Card4 = spring({ frame: frame - 366, fps, config: { damping: 12, stiffness: 150 } })
  const s3CtaSpring = spring({ frame: frame - 380, fps, config: { damping: 12, stiffness: 140 } })

  // Moving gradient border beam angle
  const beamAngle = (frame * 4) % 360

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
      {/* FULL SOUNDTRACK & AUDIO SFX LAYER (Disabled on Landing Page) */}
      {/* ----------------------------------------------------------- */}
      {enableAudio && (
        <>
          {/* 1. Looping Ambient Electronic Synth Beat (Continuous energy) */}
          <Audio src={staticFile("sfx/ambient-beat.wav")} volume={0.4} loop />

          {/* 2. Scene 1 Impact Hit */}
          <Sequence from={14} durationInFrames={35}>
            <Audio src={staticFile("sfx/bass-impact.wav")} volume={0.8} />
          </Sequence>

          {/* 3. Scene 1 to Scene 2 Camera Transition Sweep */}
          <Sequence from={88} durationInFrames={30}>
            <Audio src={staticFile("sfx/whoosh.wav")} volume={0.6} />
          </Sequence>

          {/* 4. Scene 2 to Scene 3 Transition Sweep */}
          <Sequence from={322} durationInFrames={30}>
            <Audio src={staticFile("sfx/whoosh.wav")} volume={0.65} />
          </Sequence>

          {/* 5. Scene 3 Card Reveal Pops */}
          <Sequence from={342} durationInFrames={15}>
            <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
          </Sequence>
          <Sequence from={350} durationInFrames={15}>
            <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
          </Sequence>
          <Sequence from={358} durationInFrames={15}>
            <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
          </Sequence>
          <Sequence from={366} durationInFrames={15}>
            <Audio src={staticFile("sfx/pop.wav")} volume={0.5} />
          </Sequence>

          {/* 6. Scene 3 Final CTA Impact */}
          <Sequence from={380} durationInFrames={40}>
            <Audio src={staticFile("sfx/bass-impact.wav")} volume={0.85} />
          </Sequence>
        </>
      )}

      {/* ----------------------------------------------------------- */}
      {/* ATMOSPHERIC BACKGROUND, GRID & FLOATING PARTICLES           */}
      {/* ----------------------------------------------------------- */}
      {/* Subtle Perspective Grid Pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, #000 60%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, #000 60%, transparent 100%)",
          transform: `translate(${driftX * 0.4}px, ${driftY * 0.4}px)`,
        }}
      />

      {/* Colored Ambient Volumetric Glow Lights */}
      <div
        style={{
          position: "absolute",
          top: "10%",
          left: "22%",
          width: 700,
          height: 700,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 225, 77, 0.09)",
          filter: "blur(150px)",
          transform: `translate(${driftX}px, ${driftY}px)`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "12%",
          right: "18%",
          width: 800,
          height: 800,
          borderRadius: "50%",
          backgroundColor: "rgba(56, 189, 248, 0.10)",
          filter: "blur(160px)",
          transform: `translate(${-driftX}px, ${-driftY}px)`,
          pointerEvents: "none",
        }}
      />

      {/* Floating 3D Sparkle Particles */}
      {[...Array(12)].map((_, i) => {
        const pX = (i * 153 + 120) % 1800
        const baseY = (i * 97 + 100) % 900
        const pY = baseY + Math.sin(frame * 0.04 + i) * 20
        const pOpacity = (Math.sin(frame * 0.05 + i * 1.5) + 1) * 0.35 + 0.1
        const pSize = (i % 3) + 2
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: pX,
              top: pY,
              width: pSize,
              height: pSize,
              borderRadius: "50%",
              backgroundColor: i % 2 === 0 ? "#ffe14d" : "#38bdf8",
              boxShadow: `0 0 ${pSize * 4}px ${i % 2 === 0 ? "#ffe14d" : "#38bdf8"}`,
              opacity: pOpacity,
              pointerEvents: "none",
            }}
          />
        )
      })}

      {/* Top Persistent Header Bar */}
      <div
        style={{
          position: "absolute",
          top: 36,
          left: 64,
          right: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: "#ffe14d",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 25px rgba(255, 225, 77, 0.45)",
            }}
          >
            <Zap size={24} color="#000000" fill="#000000" />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", color: "#ffffff" }}>
              flash<span style={{ color: "#ffe14d" }}>insta</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>
              Enterprise Instagram Automation
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 18px",
              borderRadius: 999,
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.35)",
              color: "#34d399",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#34d399", boxShadow: "0 0 10px #34d399" }} />
            Meta Graph API v24.0 Verified
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SCENE 1: KINETIC HOOK & VALUE PROPOSITION (0 - 105)        */}
      {/* ========================================================= */}
      {frame < 110 && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 120px",
            textAlign: "center",
            opacity: s1Exit,
            transform: `scale(${s1ExitScale}) translate(${driftX}px, ${driftY}px)`,
            zIndex: 20,
          }}
        >
          {/* Badge */}
          <div
            style={{
              transform: `scale(${s1Badge})`,
              opacity: Math.min(1, Math.max(0, s1Badge)),
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 20px",
              borderRadius: 999,
              backgroundColor: "rgba(255, 225, 77, 0.12)",
              border: "1px solid rgba(255, 225, 77, 0.35)",
              color: "#ffe14d",
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 26,
              boxShadow: "0 0 25px rgba(255, 225, 77, 0.18)",
            }}
          >
            <Sparkles size={16} />
            Stop Losing 98% of Comment Leads
          </div>

          {/* Kinetic Staggered Headline */}
          <h1
            style={{
              fontSize: 66,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.15,
              maxWidth: 1350,
              margin: 0,
              color: "#ffffff",
              textShadow: "0 10px 40px rgba(0, 0, 0, 0.8)",
            }}
          >
            <span style={{ display: "inline-block", transform: `translateY(${(1 - Math.min(1, s1Word1)) * 40}px)`, opacity: Math.min(1, s1Word1) }}>
              Turn Every Instagram Comment into an
            </span>{" "}
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - Math.min(1, s1Word2)) * 40}px)`,
                opacity: Math.min(1, s1Word2),
                background: "linear-gradient(135deg, #ffe14d 0%, #f59e0b 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Instant DM Lead
            </span>{" "}
            <span style={{ display: "inline-block", transform: `translateY(${(1 - Math.min(1, s1Word3)) * 40}px)`, opacity: Math.min(1, s1Word3) }}>
              in 1.2 Seconds.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              transform: `translateY(${(1 - Math.min(1, s1Sub)) * 30}px)`,
              opacity: Math.min(1, s1Sub),
              fontSize: 24,
              color: "#94a3b8",
              maxWidth: 980,
              marginTop: 26,
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            Autonomous comment-to-DM triggers, verified follow-gated unlock funnels, and Spintax anti-spam deliverability, fully compliant with Meta.
          </p>

          {/* Stat Pillars */}
          <div style={{ display: "flex", gap: 26, marginTop: 46 }}>
            {[
              { icon: Zap, label: "Response Speed", val: "< 1.2 Seconds", color: "#ffe14d", spring: s1Pill1 },
              { icon: Lock, label: "Follow-Gate Funnels", val: "3x More Followers", color: "#38bdf8", spring: s1Pill2 },
              { icon: ShieldCheck, label: "Spintax & Jitter", val: "Zero Spam Blocks", color: "#34d399", spring: s1Pill3 },
            ].map((stat, i) => {
              const Icon = stat.icon
              const scale = stat.spring
              const opacity = Math.min(1, Math.max(0, stat.spring))
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "rgba(18, 23, 34, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 22,
                    padding: "16px 28px",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    transform: `scale(${scale}) translateY(${(1 - scale) * 20}px)`,
                    opacity: opacity,
                    boxShadow: "0 12px 35px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: `${stat.color}20`,
                      color: stat.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                      {stat.label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff" }}>
                      {stat.val}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================= */}
      {/* SCENE 2: 3D VIRTUAL CAMERA RIG SHOWCASE (95 - 340)         */}
      {/* ========================================================= */}
      {frame >= 95 && frame < 345 && (
        <AbsoluteFill
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "90px 80px 40px 80px",
            opacity: s2Enter * s2Exit,
            zIndex: 25,
            perspective: 1400,
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              gridTemplateColumns: "560px 1fr",
              gap: 60,
              alignItems: "center",
            }}
          >
            {/* Left: 3D Angled iPhone Chassis with Glowing Border Beam */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                transform: `
                  rotateY(${s2CamRotY}deg)
                  rotateX(${s2CamRotX}deg)
                  rotateZ(${driftRotZ}deg)
                  scale(${s2CamZoom})
                  translate3d(${driftX}px, ${driftY}px, 0px)
                `,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Outer Glowing Border Beam Shell */}
              <div
                style={{
                  position: "relative",
                  width: 395,
                  height: 685,
                  borderRadius: 50,
                  padding: 4,
                  background: `conic-gradient(from ${beamAngle}deg, #ffe14d, #38bdf8, #34d399, transparent 65%, #ffe14d)`,
                  boxShadow: `
                    0 35px 90px -15px rgba(0, 0, 0, 0.95),
                    0 0 60px rgba(255, 225, 77, 0.22)
                  `,
                }}
              >
                {/* Inner Black Device Bezel */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    borderRadius: 46,
                    backgroundColor: "#000000",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <Sequence from={95} durationInFrames={250}>
                    <InstagramAutomationComposition enableAudio={true} enableCursor={true} loopFadeEnabled={false} />
                  </Sequence>
                </div>
              </div>
            </div>

            {/* Right: Dynamic Synchronized Feature Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#ffe14d", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Autonomous Execution Loop
                </span>
                <h2 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", margin: "6px 0 0 0", color: "#ffffff" }}>
                  From Comment to Customer in Seconds
                </h2>
              </div>

              {/* Step 1 Card */}
              <div
                style={{
                  backgroundColor: step1Active ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.45)",
                  border: step1Active ? "2px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 22,
                  padding: "20px 24px",
                  display: "flex",
                  gap: 18,
                  alignItems: "flex-start",
                  boxShadow: step1Active ? "0 10px 30px rgba(56, 189, 248, 0.25)" : "none",
                  transform: step1Active ? "scale(1.02) translateX(8px)" : "scale(1)",
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: step1Active ? "#38bdf8" : "#1e293b",
                    color: step1Active ? "#000000" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: step1Active ? "#38bdf8" : "#ffffff" }}>
                    Keyword Trigger &amp; Public Reply Deduplication
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>
                    Follower comments <strong style={{ color: "#ffffff" }}>&apos;GROW&apos;</strong>. The webhook fires immediately, posting an authentic public comment reply while guaranteeing single deduplication.
                  </div>
                </div>
              </div>

              {/* Step 2 Card */}
              <div
                style={{
                  backgroundColor: step2Active ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.45)",
                  border: step2Active ? "2px solid #ffe14d" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 22,
                  padding: "20px 24px",
                  display: "flex",
                  gap: 18,
                  alignItems: "flex-start",
                  boxShadow: step2Active ? "0 10px 30px rgba(255, 225, 77, 0.25)" : "none",
                  transform: step2Active ? "scale(1.02) translateX(8px)" : "scale(1)",
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: step2Active ? "#ffe14d" : "#1e293b",
                    color: step2Active ? "#000000" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: step2Active ? "#ffe14d" : "#ffffff" }}>
                    Instant iOS Push Notification &amp; Spintax Engine
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>
                    Within 1.2s, the user receives an authentic Instagram push notification. Randomized Spintax copy prevents spam penalties.
                  </div>
                </div>
              </div>

              {/* Step 3 Card */}
              <div
                style={{
                  backgroundColor: step3Active ? "rgba(30, 41, 59, 0.95)" : "rgba(15, 23, 42, 0.45)",
                  border: step3Active ? "2px solid #34d399" : "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 22,
                  padding: "20px 24px",
                  display: "flex",
                  gap: 18,
                  alignItems: "flex-start",
                  boxShadow: step3Active ? "0 10px 30px rgba(52, 211, 153, 0.25)" : "none",
                  transform: step3Active ? "scale(1.02) translateX(8px)" : "scale(1)",
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: step3Active ? "#34d399" : "#1e293b",
                    color: step3Active ? "#000000" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 900,
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: step3Active ? "#34d399" : "#ffffff" }}>
                    Follow-Gated Resource Delivery &amp; Conversion Card
                  </div>
                  <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4, lineHeight: 1.4 }}>
                    User opens the DM to find the rich link card with download CTA. Optional follow-gate requires following before unlocking download access.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </AbsoluteFill>
      )}

      {/* ========================================================= */}
      {/* SCENE 3: ENTERPRISE POWER MATRIX & CTA (325 - 450)        */}
      {/* ========================================================= */}
      {frame >= 325 && (
        <AbsoluteFill
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "90px 100px 40px 100px",
            textAlign: "center",
            opacity: Math.min(1, s3Enter),
            transform: `translate(${driftX * 0.5}px, ${driftY * 0.5}px)`,
            zIndex: 30,
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffe14d", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Enterprise Architecture
            </span>
            <h2 style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em", margin: "8px 0 0 0", color: "#ffffff" }}>
              Engineered for High-Growth Creators &amp; Brands
            </h2>
          </div>

          {/* 4 Feature Matrix Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 20,
              width: "100%",
              maxWidth: 1400,
              marginBottom: 44,
            }}
          >
            {[
              {
                icon: Users,
                title: "Multi-Account Fleet",
                desc: "Switch between multiple Instagram Creator & Business accounts with zero session desync.",
                color: "#ffe14d",
                spring: s3Card1,
              },
              {
                icon: Lock,
                title: "Follow-Gate Funnels",
                desc: "Turn commenters into verified followers before unlocking high-value content or lead magnets.",
                color: "#38bdf8",
                spring: s3Card2,
              },
              {
                icon: Bot,
                title: "Groq & OpenAI AI",
                desc: "Context-aware auto-replies with custom brand personas and realistic typing indicators.",
                color: "#a855f7",
                spring: s3Card3,
              },
              {
                icon: ShieldCheck,
                title: "Anti-Spam Safeguards",
                desc: "Spintax variations, human jitter timing, account warmup curves, and Meta rate limit sentinel.",
                color: "#34d399",
                spring: s3Card4,
              },
            ].map((f, i) => {
              const Icon = f.icon
              const scale = f.spring
              const opacity = Math.min(1, Math.max(0, f.spring))
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: "rgba(22, 27, 38, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 24,
                    padding: "28px 24px",
                    textAlign: "left",
                    transform: `scale(${scale}) translateY(${(1 - scale) * 30}px)`,
                    opacity: opacity,
                    boxShadow: "0 14px 35px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: `${f.color}20`,
                      color: f.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 18,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#ffffff", marginBottom: 8 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5 }}>
                    {f.desc}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Outro Call To Action Box */}
          <div
            style={{
              transform: `scale(${s3CtaSpring})`,
              opacity: Math.min(1, Math.max(0, s3CtaSpring)),
              display: "flex",
              alignItems: "center",
              gap: 24,
              backgroundColor: "rgba(30, 41, 59, 0.85)",
              border: "1px solid rgba(255, 225, 77, 0.45)",
              borderRadius: 999,
              padding: "12px 34px",
              boxShadow: "0 12px 40px rgba(0, 0, 0, 0.7), 0 0 35px rgba(255, 225, 77, 0.2)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff" }}>
              Ready to automate your Instagram growth?
            </div>
            <div
              style={{
                backgroundColor: "#ffe14d",
                color: "#000000",
                fontSize: 16,
                fontWeight: 900,
                padding: "11px 26px",
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 4px 15px rgba(255, 225, 77, 0.4)",
              }}
            >
              <span>Get Started Free</span>
              <ArrowRight size={18} />
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}
