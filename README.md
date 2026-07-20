# gdocs-audio-deck

Tampermonkey userscript that plays Google Drive audio files in Google Docs via a compact, floating dual-track player with crossfade support.

<img width="467" height="289" alt="image" src="https://github.com/user-attachments/assets/c1f53412-e360-4da1-9494-e71f55295431" />

## Features

- **Dual-slot playback** — Load two tracks simultaneously (Slot A & Slot B)
- **Crossfade engine** — Linear crossfade between slots, configurable from 0 to 3 seconds
- **Seek bar + time display** — Per-slot scrub bar with live `mm:ss / mm:ss` readout
- **Shared loop toggle** — One switch controls looping for both slots
- **Collapsible UI** — Minimize to a compact header bar when not needed
- **Auto end-of-track reset** — Playhead resets and button returns to ▶ PLAY when a non-looping track ends

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Open the Tampermonkey Dashboard → **Create a new script**
3. Paste the contents of `src/dual-slot-interactive-audio-player.js`
4. Save and navigate to any Google Doc

## How It Works

1. Open a Google Doc containing Google Drive audio file links
2. Click any Drive audio link — it loads into Slot A and starts playing immediately
3. Click a second link to preload it into Slot B
4. Click Slot B's **▶ PLAY** button to trigger a crossfade from A into B

## Maintainability Note

**When modifying this script, update this file, [`AGENTS.md`](AGENTS.md), and [`CHANGELOG.md`](CHANGELOG.md) to reflect any changes to features, behavior, or architecture before closing the task.**
