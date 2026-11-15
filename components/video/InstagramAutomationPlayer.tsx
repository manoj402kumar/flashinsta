"use client"

import React, { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { Smartphone, Tv, Download, Sparkles, Film } from "lucide-react"
import {
  InstagramAutomationComposition,
  COMPOSITION_WIDTH,
  COMPOSITION_HEIGHT,
  COMPOSITION_FPS,
  COMPOSITION_DURATION,
} from "./InstagramAutomationComposition"
import {
  FlashInstaHero,
  HERO_WIDTH,
  HERO_HEIGHT,
  HERO_FPS,
  HERO_DURATION,
} from "../../remotion/FlashInstaHero"

// Dynamically import Player from @remotion/player with ssr: false for Next.js App Router
const Player = dynamic(
  () => import("@remotion/player").then((mod) => mod.Player),
  {
    ssr: false,
    loading: () => (
      <div className="w-full max-w-[395px] aspect-[395/685] bg-card border border-border rounded-[44px] flex items-center justify-center mx-auto">
        <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    ),
  }
)

export function InstagramAutomationPlayer() {
  const [isClient, setIsClient] = useState(false)
  const [activeTab, setActiveTab] = useState<"phone" | "showcase">("phone")

  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-4 space-y-6 w-full">
      {/* Video Mode Selector Pill & Download Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex items-center rounded-full bg-secondary/80 p-1 border border-border backdrop-blur-sm shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("phone")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "phone"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone className="size-4" />
            <span>Interactive Phone View</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("showcase")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "showcase"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Tv className="size-4" />
            <span>16:9 Product Video</span>
          </button>
        </div>

        {/* Direct MP4 Download Options */}
        <div className="flex items-center gap-2">
          <a
            href="/flashinsta-hero.mp4"
            download="flashinsta-product-showcase.mp4"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-card hover:bg-accent border border-border text-foreground transition-colors shadow-sm"
            title="Download Full HD 16:9 Video"
          >
            <Download className="size-3.5 text-amber-500" />
            <span>16:9 MP4</span>
          </a>
          <a
            href="/flashinsta-reel.mp4"
            download="flashinsta-social-reel.mp4"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-card hover:bg-accent border border-border text-foreground transition-colors shadow-sm"
            title="Download 9:16 Vertical Reel Video"
          >
            <Film className="size-3.5 text-sky-500" />
            <span>9:16 Reel MP4</span>
          </a>
        </div>
      </div>

      {/* Mode 1: Phone Chassis View */}
      {activeTab === "phone" && (
        <div className="relative w-full max-w-[380px] sm:max-w-[395px] aspect-[395/685] rounded-[44px] overflow-hidden border-[6px] border-[#222836] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.8),0_0_40px_rgba(255,225,77,0.12)] bg-black">
          {isClient && (
            <Player
              component={InstagramAutomationComposition}
              inputProps={{ enableAudio: false }}
              durationInFrames={COMPOSITION_DURATION}
              compositionWidth={COMPOSITION_WIDTH}
              compositionHeight={COMPOSITION_HEIGHT}
              fps={COMPOSITION_FPS}
              style={{
                width: "100%",
                height: "100%",
              }}
              controls={false}
              autoPlay
              loop
            />
          )}
        </div>
      )}

      {/* Mode 2: 16:9 Full Product Showcase View */}
      {activeTab === "showcase" && (
        <div className="relative w-full max-w-4xl aspect-[16/9] rounded-2xl overflow-hidden border border-border/80 shadow-[0_25px_70px_-15px_rgba(0,0,0,0.7),0_0_40px_rgba(56,189,248,0.12)] bg-[#070a10]">
          {isClient && (
            <Player
              component={FlashInstaHero}
              inputProps={{ enableAudio: false }}
              durationInFrames={HERO_DURATION}
              compositionWidth={HERO_WIDTH}
              compositionHeight={HERO_HEIGHT}
              fps={HERO_FPS}
              style={{
                width: "100%",
                height: "100%",
              }}
              controls
              autoPlay
              loop
            />
          )}
        </div>
      )}
    </div>
  )
}
