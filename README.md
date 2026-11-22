# SparkFour

Four-bar live spark desk for bedroom producers and AI-music finishers. Live FluidR3 chairs add hat patterns, snare ghosts, bass fills, and piano stabs so a static loop has life and the track can finish. Distinct from AccentFour, DriveFour, PulseFour.

**Free.**

## Features

- User BPM (60–180) and key / 4-chord progression. Persisted in localStorage.
- Lookahead scheduler on AudioContext clock.
- Live changes apply on next step.
- Grid-perfect 48 kHz 24-bit stereo WAV (tail folded) + matching MIDI (one track per chair, tempo + time signature).
- Samples pinned to PreEight@d58301e4a494555f411a2afbc448b724136eee76.
- Missing sample detection. Peak ≤ −1 dBFS.
- Visibility change stops cleanly.

## Acceptance

Engine follows WorkinWithAI rules 1–4. Export length is exact. First downbeat at sample 0.

Deployed at https://sparkfour.vercel.app (when updated).
