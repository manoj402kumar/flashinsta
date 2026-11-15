import React from "react"
import { Audio } from "@remotion/media"
import { staticFile, Sequence } from "remotion"

export interface SoundCue {
  from: number
  file: string
  volume?: number
  durationInFrames?: number
}

interface SoundEffectsProps {
  cues: SoundCue[]
}

export function SoundEffects({ cues }: SoundEffectsProps) {
  return (
    <>
      {cues.map((cue, index) => (
        <Sequence
          key={`${cue.file}-${cue.from}-${index}`}
          from={cue.from}
          durationInFrames={cue.durationInFrames || 45}
        >
          <Audio
            src={staticFile(cue.file)}
            volume={cue.volume ?? 0.6}
          />
        </Sequence>
      ))}
    </>
  )
}
