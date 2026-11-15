import React from "react"
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion"

export interface CursorWaypoint {
  frame: number
  x: number
  y: number
  isTap?: boolean
}

interface TouchCursorProps {
  waypoints: CursorWaypoint[]
  startFrame?: number
  endFrame?: number
}

export function TouchCursor({ waypoints, startFrame = 0, endFrame = 240 }: TouchCursorProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (frame < startFrame || frame > endFrame || waypoints.length === 0) {
    return null
  }

  // Calculate current interpolated position
  const sortedWaypoints = [...waypoints].sort((a, b) => a.frame - b.frame)
  
  // Find surrounding waypoints
  let currentX = sortedWaypoints[0].x
  let currentY = sortedWaypoints[0].y
  let isTapping = false
  let tapFrame = 0

  for (let i = 0; i < sortedWaypoints.length - 1; i++) {
    const w1 = sortedWaypoints[i]
    const w2 = sortedWaypoints[i + 1]

    if (frame >= w1.frame && frame <= w2.frame) {
      const progress = interpolate(frame, [w1.frame, w2.frame], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
      currentX = interpolate(progress, [0, 1], [w1.x, w2.x], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
      currentY = interpolate(progress, [0, 1], [w1.y, w2.y], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
      break
    } else if (frame > sortedWaypoints[sortedWaypoints.length - 1].frame) {
      const last = sortedWaypoints[sortedWaypoints.length - 1]
      currentX = last.x
      currentY = last.y
    }
  }

  // Find if currently near a tap waypoint
  for (const wp of sortedWaypoints) {
    if (wp.isTap && frame >= wp.frame && frame < wp.frame + 12) {
      isTapping = true
      tapFrame = wp.frame
      break
    }
  }

  // Tap spring calculation
  const tapScale = isTapping
    ? spring({
        frame: frame - tapFrame,
        fps,
        config: { damping: 10, mass: 0.3, stiffness: 220 },
      })
    : 1

  const cursorScale = isTapping
    ? interpolate(tapScale, [0, 1], [0.72, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1

  // Ripple effect
  const rippleProgress = isTapping ? (frame - tapFrame) / 12 : 0
  const rippleScale = interpolate(rippleProgress, [0, 1], [0.8, 2.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
  const rippleOpacity = interpolate(rippleProgress, [0, 0.7, 1], [0.8, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })

  return (
    <div
      style={{
        position: "absolute",
        left: currentX,
        top: currentY,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 100,
      }}
    >
      {/* Expanding Ripple Ring */}
      {isTapping && (
        <div
          style={{
            position: "absolute",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "2px solid #ffe14d",
            transform: `translate(-50%, -50%) scale(${rippleScale})`,
            opacity: rippleOpacity,
            left: "50%",
            top: "50%",
          }}
        />
      )}

      {/* Main Touch Pointer (Glow Ring & Core Dot) */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 225, 77, 0.35)",
          border: "2px solid #ffe14d",
          boxShadow: "0 0 16px rgba(255, 225, 77, 0.8), 0 4px 12px rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${cursorScale})`,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#ffffff",
            boxShadow: "0 0 8px #ffffff",
          }}
        />
      </div>
    </div>
  )
}
