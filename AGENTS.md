# AGENTS.md — Google Docs Dual-Slot Audio Player

This file is the authoritative technical reference for AI agents and developers working on this codebase. Feed this file to any AI assistant before modifying the script to provide instant, complete context.

**Maintainability Rule:** When modifying the script, update this file, [`README.md`](README.md), and [`CHANGELOG.md`](CHANGELOG.md) to reflect any changes to behavior, architecture, or constraints before closing the task.

---

## 1. Project Goal & Overview

This is a Tampermonkey userscript that gives Google Docs users a seamless, built-in dual-track audio player. It targets Google Drive audio links embedded in a document, intercepts clicks on those links, and loads them into a compact floating player interface.

The key value proposition is **DJ-style seamless transitions**: instead of one track abruptly stopping when another is clicked, the script manages two audio slots simultaneously and crossfades between them.

- **Entry point:** `src/dual-slot-interactive-audio-player.js`
- **Target pages:** `https://docs.google.com/document/*`
- **Structure:** Single IIFE (immediately invoked function expression), no external dependencies

---

## 2. Core Functional Specifications

### A. Dual-Slot State Management

The script maintains two static audio tracks: **Slot A** and **Slot B**.

**Target selection rules (in order):**
1. If both slots are empty → load into **Slot A**
2. If Slot A is occupied, Slot B is empty → load into **Slot B**
3. If both slots are occupied → overwrite whichever slot is **not** currently playing (never interrupt the active track)

### B. Link Interception & Streaming

- Listens for clicks on `<a>` tags or Google Docs Rich Links (`.docs-richlink`) containing Google Drive file paths
- Converts standard sharing URLs to raw download streams via `buildStreamUrl(fileId)`:
  ```
  https://docs.google.com/uc?export=download&id=FILE_ID
  ```
- **Modifier-key routing** (checked before A/B logic):

  | Modifier | Target |
  | :--- | :--- |
  | *(none)* | A/B slot selection — unchanged |
  | **Alt** | Ambience slot |
  | **Ctrl** | Armed SFX pad (if any); otherwise brief flash on SFX pad label |

### C. Linear Crossfade Engine

When the user triggers a track in the inactive slot while the active slot is playing:

- Volume of the **outgoing track** steps from `1.0 → 0.0` over 20 steps
- Volume of the **incoming track** steps from `0.0 → 1.0` over 20 steps
- **Duration:** controlled by the Fade Stepper in the UI (0–3 seconds, default 1s, step 0.5s)
- **Instant cut:** if fade duration is `0.0`, the interval loop is skipped entirely — the old track pauses and the new track starts at full volume immediately

### D. Audio Controls & Behaviors

- **Shared Loop:** one checkbox controls `audio.loop` for both A/B slots simultaneously. Does **not** affect the Ambience slot.
- **End-of-track reset:** when `loop = false` and a track ends, the `ended` event fires, the playhead resets to `0`, and the slot button returns to **▶ PLAY**

### E. Ambience Slot

- Independent looping audio slot; `audio.loop` is always `true` — not linked to the shared Loop checkbox.
- Loaded via **Alt+click** on a Drive link in the doc.
- Has its own volume slider (default 0.7) that directly sets `ambienceSlot.audio.volume`.
- Play/pause handled by `handleAmbienceClick()` — never calls `handleButtonClick()` or `crossfade()`.
- Scrub bar and time display are updated by the shared `setInterval` loop.

### F. SFX Pad

- 3×3 grid of 9 one-shot buttons; single shared `sfxAudio` element (`loop = false`).
- Before playing a new SFX: `sfxAudio.pause(); sfxAudio.currentTime = 0;`
- `sfxAudio.volume` is controlled by the SFX volume slider (default 0.8).
- **Pre-fill:** set `id` fields in `SFX_PAD_CONFIG` (top of IIFE) to load pads at script startup without any click.
- **Runtime assign:** click an empty pad to arm it → **Ctrl+click** a Drive link → pad receives the File ID. Clicking the armed pad again disarms it; clicking a different pad re-arms it.
- No scrub bar — SFX are fire-and-forget.

---

## 3. UI/UX Architecture

The player is a fixed floating card pinned to the bottom-right of the viewport, styled to match Google's Material design palette. It is hidden until the first audio link is clicked.

| Element | Constraints | Behavior |
| :--- | :--- | :--- |
| **Main Panel** | Fixed 400px width, white bg, 16px rounded corners, drop shadow | Master container; hidden on load |
| **Top Control Bar** | "Audio Controller" label, Loop checkbox, Fade Stepper, Collapse button | Persistent; always visible |
| **Fade Stepper** | `[-]` / `[+]` buttons + number input; range strictly 0–3s, step 0.5s, default 1s | Adjusts crossfade duration |
| **Collapse Button** | `−` / `+` toggle | Hides A/B slot cards only; panel shrinks to `width: auto` |
| **Compact Play Button** | Visible only when collapsed | Plays/pauses the active slot without expanding the panel |
| **Slot Cards (A & B)** | Rounded borders; background color switches based on slot state | Visualizes per-slot status |
| **Play/Pause Button** | Pill button; states: `EMPTY`, `▶ PLAY`, `⏸ PAUSE` | Triggers playback, pause, or crossfade |
| **Scrub Bar** | `<input type="range">`, accent color reflects active/inactive state | Manual scrubbing; real-time progress tracking |
| **Time Display** | Monospace, format `m:ss / m:ss` | Live progress; shows `--:--` for duration until metadata loads |
| **Ambience & SFX Section** | Appended below A/B cards; own `▾`/`▸` toggle; NOT hidden by main collapse | Contains Ambience card and SFX pad |
| **Ambience Card** | Green accent (`#34a853`); AMBIENCE tag; volume slider (0–1, default 0.7) | Independent play/pause, scrub, time display |
| **SFX Pad** | 3×3 CSS grid; red accent (`#ea4335`); volume slider (0–1, default 0.8) | 9 one-shot buttons; arm/assign via click + Ctrl+click |

---

## 4. Technical Architecture

### Key Global State

```javascript
const slots = {
    A: {
        id: null,               // Google Drive File ID (null = empty)
        name: "No Track Loaded",// Display name, parsed from anchor text
        audio: HTMLAudioElement,// Native <audio> element appended to <body>
        ui: Object,             // Cached card element refs: { card, nameEl, btn, slider, timeEl, tag }
        isUserDragging: false   // Blocks interval UI updates while user is scrubbing
    },
    B: { /* same shape */ }
};

let activeSlotKey = null;   // 'A', 'B', or null
let isCollapsed = false;    // Tracks collapse state of the panel

// ── SFX_PAD_CONFIG — edit IDs here to pre-fill pads at script load ────────────
const SFX_PAD_CONFIG = [
    { id: null, label: "SFX 1" }, // ... 9 entries total
];

// Ambience slot — same shape as A/B; always loops; volume independent
const ambienceSlot = {
    id: null, name: "No Ambience",
    audio: HTMLAudioElement,  // loop always true
    isUserDragging: false,
    ui: Object  // { card, tag, nameEl, btn, slider, timeEl }
};

// SFX layer
const sfxAudio = HTMLAudioElement;        // single shared element, loop = false
const sfxPad = [ { id, label, btn } ];    // 9 entries, btn filled during UI build
let armedPadIndex = null;                 // pad waiting for a Ctrl+click Drive link
let playingPadIndex = null;               // for reverting style on sfxAudio.ended
let isSfxSectionExpanded = true;          // Ambience & SFX section visibility
```

### DOM Hierarchy

```
container (fixed panel)
├── topRow
│   ├── header ("Audio Controller" label)
│   └── settingsContainer
│       ├── loopLabel + loopCheckbox
│       ├── fadeWrapper ([-] input [+])
│       ├── compactPlayBtn (hidden unless collapsed)
│       └── collapseBtn (−/+)
├── contentArea (hidden when A/B collapsed)
│   ├── slots.A.ui.card
│   │   ├── tag ("SLOT A")
│   │   ├── nameEl (track name)
│   │   └── row
│   │       ├── btn (EMPTY / ▶ PLAY / ⏸ PAUSE)
│   │       ├── slider (<input type="range">)
│   │       └── timeEl (m:ss / m:ss)
│   └── slots.B.ui.card
│       └── (same structure as A)
└── expandableSection (NOT hidden by main collapse)
    ├── sectionToggleBar ("▾ Ambience & SFX" + chevron)
    └── sectionContent
        ├── ambienceCard
        │   ├── headerRow: "AMBIENCE" tag + volume slider
        │   ├── nameEl
        │   └── controlRow: btn + slider + timeEl
        ├── divider (1px #e0e0e0)
        └── sfxPanel
            ├── sfxHeaderRow: "SFX PAD" label + volume slider
            └── padGrid (CSS grid 3×3, 9 buttons)
```

### UI Refresh Loop

The UI updates on a **shared `setInterval` timer running every 250ms**. It iterates over both A/B slots **and** `ambienceSlot`, updating the scrub bar position and time display for any occupied, non-dragging slot.

### Collapse Mode

`toggleCollapse()` switches `isCollapsed` and conditionally shows/hides:
- `contentArea` (the two A/B slot cards only)
- `fadeWrapper` and `loopLabel`
- `compactPlayBtn` (a minimal play/pause icon, only shown when collapsed)
- Resizes the panel between `400px` and `auto` width
- **Does NOT affect `expandableSection`** — the Ambience & SFX section has its own `toggleSfxSection()` toggle.

### New Functions (v7.0)

| Function | Purpose |
| :--- | :--- |
| `buildStreamUrl(fileId)` | Returns the `uc?export=download` stream URL; shared helper |
| `handleAmbienceClick()` | Play/pause `ambienceSlot.audio`; calls `refreshAmbienceUI()` |
| `refreshAmbienceUI()` | Updates ambience card border, tag text, button text/style |
| `applyPadStyle(i)` | Sets SFX pad button border/color based on empty/loaded/armed/playing state |
| `handlePadClick(i)` | Arm/disarm an empty pad, or play a loaded SFX |
| `toggleSfxSection()` | Expand/collapse the Ambience & SFX section |

### Event Flow (updated)

```
[ User clicks Google Drive link in Doc ]
              │
              ▼
[ Extract FILE_ID; build streamUrl via buildStreamUrl() ]
              │
    ┌─────────┼─────────┐
    │ e.altKey │ e.ctrlKey │ (none)
    ▼          ▼           ▼
  Ambience    SFX pad    A/B slot
  slot        (if armed)  selection
              (else flash)
```

---

## 5. Engineering Constraints

These rules are **mandatory**. Violating them causes known, severe bugs.

### 1. Never bind UI updates to `timeupdate`
The UI refresh loop uses `setInterval` at 250ms. Do **not** attach progress updates to the audio `timeupdate` event — it fires at unpredictable rates and causes performance degradation inside Google Docs.

### 2. Maintain `isUserDragging` correctly
When the user touches the scrub bar (`mousedown` / `touchstart`), set `slots[key].isUserDragging = true`. Clear it on `change` (after scrub is committed). If this flag is missing or incorrectly managed, the seeker knob will stutter as the interval loop fights the user's cursor position.

### 3. Sanitize track names
Google Docs anchor HTML can contain nested inline elements and literal newline characters. Always `.trim()` and strip `\n` when extracting the display name from link text, or names will render with broken whitespace.

### 4. Protect controls during crossfade
While the crossfade interval is running, set `.disabled = true` on both slot play buttons. This prevents the user from triggering a second fade that would leave `sourceAudio.volume` and `targetAudio.volume` in an inconsistent state. Explicitly reset both volumes to `1.0` once the fade interval completes or is cleared.

### 5. Keep documentation updated
**Any modification to the script must be accompanied by updates to this file, [`README.md`](README.md), and [`CHANGELOG.md`](CHANGELOG.md).** If a feature is added, removed, or its behavior changes, update the relevant section here before the task is considered complete. Undocumented behavior creates drift that breaks future AI-assisted modifications.

### 6. Proactively detect documentation drift
When starting work on this codebase, compare the script's current `@version`, `@description`, and feature set against the content of this file, [`README.md`](README.md), and [`CHANGELOG.md`](CHANGELOG.md). If you find behavior or features in the script that are not reflected in the docs — or doc entries that no longer match the code — flag the discrepancies to the user and ask whether they want the documentation updated before proceeding.

### 7. Git hygiene
- Before making edits, check `git status --short` to understand the current working tree state
- After edits, re-check `git status --short` and confirm only intended files changed
- Stage only files relevant to the task — avoid bundling unrelated changes in a single commit
- Documentation updates (`AGENTS.md`, `README.md`, `CHANGELOG.md`) must be included in the **same commit** as the script change they describe

### 8. Ambience volume is independent
Never set `ambienceSlot.audio.volume` from the crossfade engine or the Loop checkbox handler. The ambience volume slider is the only permitted setter.

### 9. SFX pad buttons must not block music controls
The SFX pad buttons must never set `.disabled = true` on A/B or Ambience controls.

### 10. Always clear `armedPadIndex` after assignment or disarm
`armedPadIndex` must be set to `null` after a successful Ctrl+click assignment and after any pad button disarm, to prevent phantom assignments on subsequent clicks.

### 11. `toggleCollapse()` must not touch `expandableSection`
The main `−`/`+` collapse only affects `contentArea`, `fadeWrapper`, `loopLabel`, `compactPlayBtn`, and the panel width. The Ambience & SFX `expandableSection` has its own independent `toggleSfxSection()` toggle and must never be hidden or shown by `toggleCollapse()`.
