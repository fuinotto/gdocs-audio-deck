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
- Converts standard sharing URLs to raw download streams:
  ```
  https://docs.google.com/uc?export=download&id=FILE_ID
  ```

### C. Linear Crossfade Engine

When the user triggers a track in the inactive slot while the active slot is playing:

- Volume of the **outgoing track** steps from `1.0 → 0.0` over 20 steps
- Volume of the **incoming track** steps from `0.0 → 1.0` over 20 steps
- **Duration:** controlled by the Fade Stepper in the UI (0–3 seconds, default 1s, step 0.5s)
- **Instant cut:** if fade duration is `0.0`, the interval loop is skipped entirely — the old track pauses and the new track starts at full volume immediately

### D. Audio Controls & Behaviors

- **Shared Loop:** one checkbox controls `audio.loop` for both slots simultaneously
- **End-of-track reset:** when `loop = false` and a track ends, the `ended` event fires, the playhead resets to `0`, and the slot button returns to **▶ PLAY**

---

## 3. UI/UX Architecture

The player is a fixed floating card pinned to the bottom-right of the viewport, styled to match Google's Material design palette. It is hidden until the first audio link is clicked.

| Element | Constraints | Behavior |
| :--- | :--- | :--- |
| **Main Panel** | Fixed 400px width, white bg, 16px rounded corners, drop shadow | Master container; hidden on load |
| **Top Control Bar** | "Audio Controller" label, Loop checkbox, Fade Stepper, Collapse button | Persistent; always visible |
| **Fade Stepper** | `[-]` / `[+]` buttons + number input; range strictly 0–3s, step 0.5s, default 1s | Adjusts crossfade duration |
| **Collapse Button** | `−` / `+` toggle | Hides slot cards, shows compact play button; panel shrinks to `width: auto` |
| **Compact Play Button** | Visible only when collapsed | Plays/pauses the active slot without expanding the panel |
| **Slot Cards (A & B)** | Rounded borders; background color switches based on slot state | Visualizes per-slot status |
| **Play/Pause Button** | Pill button; states: `EMPTY`, `▶ PLAY`, `⏸ PAUSE` | Triggers playback, pause, or crossfade |
| **Scrub Bar** | `<input type="range">`, accent color reflects active/inactive state | Manual scrubbing; real-time progress tracking |
| **Time Display** | Monospace, format `m:ss / m:ss` | Live progress; shows `--:--` for duration until metadata loads |

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
└── contentArea (hidden when collapsed)
    ├── slots.A.ui.card
    │   ├── tag ("SLOT A")
    │   ├── nameEl (track name)
    │   └── row
    │       ├── btn (EMPTY / ▶ PLAY / ⏸ PAUSE)
    │       ├── slider (<input type="range">)
    │       └── timeEl (m:ss / m:ss)
    └── slots.B.ui.card
        └── (same structure as A)
```

### UI Refresh Loop

The UI updates on a **shared `setInterval` timer running every 250ms**. It iterates over both slots and updates the scrub bar position and time display for any occupied, non-dragging slot.

### Collapse Mode

`toggleCollapse()` switches `isCollapsed` and conditionally shows/hides:
- `contentArea` (the two slot cards)
- `fadeWrapper` and `loopLabel`
- `compactPlayBtn` (a minimal play/pause icon, only shown when collapsed)
- Resizes the panel between `400px` and `auto` width

### Event Flow

```
[ User clicks Google Drive link in Doc ]
              │
              ▼
[ Extract FILE_ID from URL ]
              │
              ▼
[ Build stream URL: /uc?export=download&id=FILE_ID ]
              │
              ▼
[ Determine target slot (A or B) per selection rules ]
              │
              ▼
[ Assign src, load metadata, update slot name & UI ]
              │
              ▼
[ If first-ever track → play immediately ]
[ If crossfade triggered → start fade interval ]
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
