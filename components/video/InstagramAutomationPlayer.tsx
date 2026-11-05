"use client"

import React, { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import {
  InstagramAutomationComposition,
  COMPOSITION_WIDTH,
  COMPOSITION_HEIGHT,
  COMPOSITION_FPS,
  COMPOSITION_DURATION,
} from "./InstagramAutomationComposition"

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

  useEffect(() => {
    setIsClient(true)
  }, [])

  return (
    <div className="flex justify-center items-center py-4">
      {/* Phone chassis precisely matching composition dimensions (395x685) - ZERO black side bars */}
      <div className="relative w-full max-w-[380px] sm:max-w-[395px] aspect-[395/685] rounded-[44px] overflow-hidden border-[6px] border-[#222836] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.8),0_0_40px_rgba(255,225,77,0.12)] bg-black">
        {isClient && (
          <Player
            component={InstagramAutomationComposition}
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
    </div>
  )
}
