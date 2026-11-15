import React from "react"
import { Composition } from "remotion"
import {
  InstagramAutomationComposition,
  COMPOSITION_WIDTH,
  COMPOSITION_HEIGHT,
  COMPOSITION_FPS,
  COMPOSITION_DURATION,
} from "../components/video/InstagramAutomationComposition"
import {
  FlashInstaHero,
  HERO_WIDTH,
  HERO_HEIGHT,
  HERO_FPS,
  HERO_DURATION,
} from "./FlashInstaHero"
import {
  FlashInstaReel,
  REEL_WIDTH,
  REEL_HEIGHT,
  REEL_FPS,
  REEL_DURATION,
} from "./FlashInstaReel"

export const RemotionRoot = () => {
  return (
    <>
      {/* 1. Mobile Phone Pure Simulator (395x685) */}
      <Composition
        id="InstagramAutomation"
        component={InstagramAutomationComposition}
        durationInFrames={COMPOSITION_DURATION}
        fps={COMPOSITION_FPS}
        width={COMPOSITION_WIDTH}
        height={COMPOSITION_HEIGHT}
      />

      {/* 2. Full HD 16:9 Landscape Product Showcase Video (1920x1080) */}
      <Composition
        id="FlashInstaHero"
        component={FlashInstaHero}
        durationInFrames={HERO_DURATION}
        fps={HERO_FPS}
        width={HERO_WIDTH}
        height={HERO_HEIGHT}
      />

      {/* 3. Full HD 9:16 Vertical Reel / TikTok / Shorts Video (1080x1920) */}
      <Composition
        id="FlashInstaReel"
        component={FlashInstaReel}
        durationInFrames={REEL_DURATION}
        fps={REEL_FPS}
        width={REEL_WIDTH}
        height={REEL_HEIGHT}
      />
    </>
  )
}
