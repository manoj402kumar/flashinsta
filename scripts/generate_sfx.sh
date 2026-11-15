#!/usr/bin/env bash
set -euo pipefail

SFX_DIR="/home/yenigandlamanojkumar/Desktop/Projects/flashinsta/public/sfx"
mkdir -p "$SFX_DIR"

# 1. Whoosh / Transition Sweep (bandpass filtered noise with frequency sweep)
ffmpeg -y -f lavfi -i "anoisesrc=d=0.35:c=white:r=44100:a=0.3" \
  -af "bandpass=f=1200:width_type=h:w=800,afade=t=in:st=0:d=0.08,afade=t=out:st=0.15:d=0.20,volume=1.2" \
  "$SFX_DIR/whoosh.wav"

# 2. Subtle Quick Whoosh (for fast card reveals)
ffmpeg -y -f lavfi -i "anoisesrc=d=0.2:c=white:r=44100:a=0.25" \
  -af "bandpass=f=1800:width_type=h:w=1200,afade=t=in:st=0:d=0.03,afade=t=out:st=0.08:d=0.12,volume=0.9" \
  "$SFX_DIR/quick-whoosh.wav"

# 3. Clean UI Bubble Pop (sine wave pitch envelope downwards)
ffmpeg -y -f lavfi -i "sine=f=600:d=0.12" \
  -af "asetrate=44100*1.8,aresample=44100,afade=t=out:st=0.02:d=0.08,volume=1.0" \
  "$SFX_DIR/pop.wav"

# 4. Mechanical Keyboard Keyclick (short impulse with high pass)
ffmpeg -y -f lavfi -i "sine=f=1800:d=0.04" \
  -af "afade=t=out:st=0.005:d=0.035,volume=0.7" \
  "$SFX_DIR/type-click.wav"

# 5. Crisp Tap / Button Click
ffmpeg -y -f lavfi -i "sine=f=950:d=0.07" \
  -af "afade=t=out:st=0.01:d=0.06,volume=0.85" \
  "$SFX_DIR/tap.wav"

# 6. iOS Notification Double Chime (Chord of E6 [1318 Hz] and B5 [987 Hz])
ffmpeg -y -f lavfi -i "sine=f=1318:d=0.45" -f lavfi -i "sine=f=987:d=0.45" \
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=first[mix];[mix]afade=t=in:st=0:d=0.01,afade=t=out:st=0.08:d=0.35,volume=0.95" \
  "$SFX_DIR/ios-chime.wav"

# 7. Cinematic Sub Bass Impact / Hit (65Hz sub drop)
ffmpeg -y -f lavfi -i "sine=f=75:d=0.6" \
  -af "afade=t=in:st=0:d=0.02,afade=t=out:st=0.1:d=0.5,volume=1.4" \
  "$SFX_DIR/bass-impact.wav"

# 8. Subtle Upbeat Modern Tech Rhythmic Beat (15s looping atmospheric synth pulse)
ffmpeg -y -f lavfi -i "sine=f=130:d=15" -f lavfi -i "anoisesrc=d=15:c=pink:r=44100:a=0.03" \
  -filter_complex "[0:a]tremolo=f=4:d=0.8,lowpass=f=220,volume=0.35[bass];[1:a]tremolo=f=8:d=0.9,bandpass=f=3500:w=2000,volume=0.25[hats];[bass][hats]amix=inputs=2:duration=first[track];[track]afade=t=in:st=0:d=0.5,afade=t=out:st=14.0:d=1.0[out]" \
  -map "[out]" "$SFX_DIR/ambient-beat.wav"

echo "All SFX assets generated successfully!"
