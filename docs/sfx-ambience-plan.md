# SFX & Ambience Expansion — Implementation Plan

**Status:** Implemented (v7.0, 2026-07-21)
**Target script:** `src/dual-slot-interactive-audio-player.js`
**Planned version bump:** 6.3 → 7.0

---

## User Intent (captured 2026-07-20)

| Question | Answer |
| :--- | :--- |
| SFX triggering | Dedicated SFX pad / button grid in the player UI |
| SFX playback model | Play on top of music; only one SFX plays at a time |
| Ambience model | Dedicated looping Ambience slot, always independent of A/B |
| Volume control | Independent volume for Ambience and SFX only; A/B music unchanged |
| UI approach | Separate expandable section / tab for SFX & Ambience |
| SFX source | Mix: pre-defined Drive File IDs in script header, overridable at runtime via Ctrl+click |
| SFX pad size | 9 buttons (3×3 grid) |
| Ambience loading | Same as A/B — click a Drive link in the doc (Alt+click to route to Ambience slot) |

---

## New Global State

```javascript
// ── Placed at the top of the IIFE, easy to edit ──────────────────────────
const SFX_PAD_CONFIG = [
    { id: null, label: "SFX 1" },
    { id: null, label: "SFX 2" },
    { id: null, label: "SFX 3" },
    { id: null, label: "SFX 4" },
    { id: null, label: "SFX 5" },
    { id: null, label: "SFX 6" },
    { id: null, label: "SFX 7" },
    { id: null, label: "SFX 8" },
    { id: null, label: "SFX 9" },
];
// Replace any id: null with a Google Drive File ID string to pre-fill that slot.

// ── Ambience slot — same shape as A/B slots ───────────────────────────────
const ambienceSlot = {
    id: null,
    name: "No Ambience",
    audio: document.createElement('audio'), // always loops; volume independent
    isUserDragging: false,
    ui: null  // filled during UI build
};

// ── SFX layer — single shared <audio>; only one SFX plays at a time ───────
const sfxAudio = document.createElement('audio');
const sfxPad = SFX_PAD_CONFIG.map(cfg => ({
    id: cfg.id,
    label: cfg.label,
    btn: null   // UI button ref, filled during UI build
}));

let armedPadIndex = null; // Index of pad button armed to receive a Drive link
```

---

## Link Interception: Modifier Key Routing

The existing `document.addEventListener('click', ...)` handler intercepts all Drive links and routes to A/B. It must branch **before** the A/B logic based on modifier keys:

| Modifier held on click | Routing target |
| :--- | :--- |
| *(none)* | Existing A/B slot selection logic — **unchanged** |
| **Alt** | Ambience slot |
| **Ctrl** | Armed SFX pad slot (if `armedPadIndex !== null`); otherwise ignored with a brief visual flash on the pad header |

### Armed Pad Assignment Flow

1. User clicks a pad button → it gains a highlighted blue-dashed border; `armedPadIndex` is set to its index.
2. User **Ctrl+clicks** a Drive link in the doc → `sfxPad[armedPadIndex]` receives the File ID and label; button updates; armed state clears (`armedPadIndex = null`).
3. Clicking the same pad button again while it is already armed → **disarms** it (toggle).
4. Clicking a different pad button while one is armed → arms the new one, disarms the old.

This avoids any secondary dialog or popover.

---

## New UI Section

Appended below `contentArea` (the A/B cards), toggled independently from the main collapse button:

```
expandableSection
├── sectionToggleBar  ("▾ AMBIENCE & SFX"  +  chevron toggle button)
└── sectionContent
    ├── ambienceCard
    │   ├── headerRow: "AMBIENCE" tag  +  volume slider (range 0–1, default 0.7)
    │   ├── nameEl  (track name or "Empty")
    │   └── controlRow: play/pause btn  +  scrub bar  +  time display
    ├── divider  (1px #e0e0e0)
    └── sfxPanel
        ├── headerRow: "SFX PAD" label  +  volume slider (range 0–1, default 0.8)
        └── padGrid  (CSS grid 3×3, 9 buttons)
            └── each button: label text; states listed below
```

### SFX Button Visual States

| State | Style |
| :--- | :--- |
| Empty | Dashed border, grey text |
| Loaded / idle | Solid border, white background, dark text |
| Armed (awaiting Drive link) | Blue dashed border (`#1a73e8`) |
| Playing | Highlighted solid border; reverts on `sfxAudio.ended` |

---

## Ambience Slot Behavior

- Identical to A/B slots **except**:
  - `audio.loop` is **always `true`** — not linked to the shared Loop checkbox.
  - Never touched by `crossfade()` or the A/B active-slot logic.
  - Has its own `<input type="range">` volume control (0–1); directly sets `ambienceSlot.audio.volume`.
  - Play/pause button uses its own handler, not `handleButtonClick()`.
- Scrub bar and time display feed into the **existing `setInterval` UI loop** — `ambienceSlot` is added to its iteration.

---

## SFX Pad Behavior

- `sfxAudio` is a single `<audio>` element shared by all 9 pads.
- Before playing a new SFX: `sfxAudio.pause(); sfxAudio.currentTime = 0;` (one SFX at a time).
- `sfxAudio.loop = false` always.
- `sfxAudio.volume` controlled by the SFX volume slider.
- Pre-filled slots: if `SFX_PAD_CONFIG[i].id` is non-null at script load, the pad is ready immediately without any Drive link click needed.
- No scrub bar — SFX are one-shot fire-and-forget.

---

## Changes to Existing Code

| Area | Change |
| :--- | :--- |
| `document.addEventListener('click', ...)` | Add `e.altKey` branch (→ Ambience) and `e.ctrlKey` branch (→ armed SFX pad) **before** the A/B routing block |
| `setInterval` UI refresh loop | Add `ambienceSlot` to the iteration |
| `toggleCollapse()` | The new expandable section is **not** hidden by the main collapse — it has its own independent toggle |
| Script `@version` | Bump to `7.0` |
| Script `@description` | Update to mention Ambience and SFX pad |
| `AGENTS.md` | Update sections 2, 3, 4 to document new slots, UI elements, state, and constraints |
| `README.md` | Add Ambience and SFX pad to feature list and usage instructions |
| `CHANGELOG.md` | Add `## [7.0]` entry |

---

## What Is NOT Changing

- A/B slot logic, crossfade engine, and Loop checkbox behavior are **untouched**.
- The existing collapse button only affects the A/B `contentArea`.
- The Ambience slot does **not** participate in the fade stepper.
- No new external dependencies — still a single IIFE.

---

## Engineering Constraints (additions to existing rules)

- **Ambience volume is independent:** never set `ambienceSlot.audio.volume` from the crossfade engine or Loop checkbox handler.
- **SFX does not block music controls:** the SFX pad buttons must never set `.disabled` on A/B or Ambience controls.
- **`armedPadIndex` must always be cleared** after a successful Ctrl+click assignment, and on any pad button disarm, to prevent phantom assignments.
- **Ctrl+click must still call `e.preventDefault()` and `e.stopPropagation()`** so Google Docs does not follow the link.
