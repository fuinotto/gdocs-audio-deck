# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

**Maintainability Rule:** When modifying the script, add a new entry here (and update [`AGENTS.md`](AGENTS.md) and [`README.md`](README.md)) before closing the task.

---

## [7.1] — 2026-07-21 — Current

### Added
- **SFX name-based auto-routing** — Clicking a Drive link whose text starts with `sfx` or `[sfx]` (case-insensitive, no modifier key needed) automatically assigns it to the next empty SFX pad (or the currently armed pad). Expands the Ambience & SFX section if collapsed. If all pads are full, flashes the SFX pad header in red.
- **SFX Stop button** — A `■` button in the SFX pad header row immediately stops any playing SFX and resets the playing-pad highlight.

---

## [7.0] — 2026-07-21

### Added
- **Ambience slot** — Dedicated looping audio slot independent of A/B; always `loop = true`; has its own play/pause button, scrub bar, time display, and volume slider (default 0.7). Load via **Alt+click** on a Drive link in the doc.
- **SFX Pad** — 3×3 grid of 9 one-shot buttons; single shared `<audio>` element (only one SFX plays at a time); independent volume slider (default 0.8). Pads can be pre-filled via `SFX_PAD_CONFIG` in the script header or assigned at runtime via **Ctrl+click** after arming a pad button.
- **Armed pad assignment** — Click an empty pad to arm it (blue dashed border); then Ctrl+click a Drive link to assign that file to the pad. Clicking the armed pad again disarms it; clicking a different pad re-arms it.
- **`buildStreamUrl(fileId)` helper** — Extracted shared helper; replaces the previously inlined stream URL string in the click handler.
- **Ambience & SFX expandable section** — Appended below the A/B slot cards; has its own independent `▾`/`▸` collapse toggle. Not hidden by the main `−`/`+` panel collapse.
- **Modifier-key routing in link click handler** — `Alt+click` → Ambience slot; `Ctrl+click` → armed SFX pad (or orange flash on SFX pad header if no pad is armed); no modifier → existing A/B logic (unchanged).

### Changed
- `@description` updated to mention Ambience and SFX pad.
- `setInterval` UI refresh loop now also updates the Ambience scrub bar and time display.

---

## [6.3] — 2026-07-14

### Fixed
- Compact play button now correctly shows `▶` when paused and `⏸` when playing (was always showing `▶`)
- Added gap/spacing between compact play button and the collapse toggle button

### Changed
- Compact play button size and background/color styles adjusted to better match the control bar aesthetics

---

## [6.2] — 2026-07-14

### Added
- **Collapsible UI** — Panel can be minimized to a compact header bar via a `−`/`+` toggle button
- **Compact Play Button** — Visible only in collapsed mode; plays/pauses the active slot without expanding the panel
- Auto-expands the panel when a new Drive link is clicked while collapsed

### Changed
- Panel width shrinks to `auto` when collapsed; restores to `400px` on expand
- `loopLabel` and `fadeWrapper` are hidden in collapsed mode

---

## [6.1] — 2026-07-14

Initial release.

### Added
- **Dual-slot playback** — Two independent audio slots (A & B) with smart target selection
- **Linear crossfade engine** — Configurable 0–3 second crossfade between slots (20 volume steps)
- **Instant cut mode** — Fade duration of 0s performs a hard swap with no interval overhead
- **Seek bar** — Per-slot `<input type="range">` scrub bar with `isUserDragging` guard
- **Live time display** — Monospace `m:ss / m:ss` readout, updated by a shared 250ms `setInterval`
- **Shared loop toggle** — Single checkbox controls `audio.loop` for both slots simultaneously
- **Fade Stepper** — `[-]` / `[+]` UI control, range 0–3s, step 0.5s, default 1s
- **Auto end-of-track reset** — On `ended` event (loop off), playhead resets to `0` and button returns to ▶ PLAY
- **Link interception** — Captures clicks on `<a>` and `.docs-richlink` elements in Google Docs, converts Drive share URLs to raw stream URLs (`/uc?export=download&id=FILE_ID`)
- **Auto-play on first load** — First track loaded starts playing immediately
