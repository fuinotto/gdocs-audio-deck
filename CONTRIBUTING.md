# Contributing

Thank you for your interest in improving this project!

---

## Development Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) in a Chromium-based browser
2. Open **Tampermonkey Dashboard → Create a new script**
3. Paste the contents of `src/dual-slot-interactive-audio-player.js` and save
4. Open any Google Doc containing Google Drive audio links to test

**Live editing tip:** Enable "Allow access to file URLs" in the Tampermonkey extension settings, then point the `@require` directive at a local copy of the script for instant reload without copy-pasting.

---

## Before You Code

Read [`AGENTS.md`](AGENTS.md) in full before making any changes. It documents the engineering constraints that are non-negotiable — violating them causes known bugs (stuttering scrubber, volume stuck at 0, broken crossfade state, etc.).

Key rules at a glance:
- **No `timeupdate` binding** — UI updates live in a single `setInterval` at 250ms
- **Always manage `isUserDragging`** — set on `mousedown`/`touchstart`, clear on `change`
- **Sanitize track names** — strip `\n` and trim whitespace from anchor text
- **Disable buttons during crossfade** — re-enable and reset volumes to `1.0` when done

---

## Making Changes

1. Keep the script as a **single IIFE** — no modules, no bundler, no external dependencies
2. Test all three slot-load scenarios: both empty, one occupied, both occupied
3. Test crossfade at 0s (instant cut) and at 1s+ (smooth fade)
4. Test the collapse/expand toggle with and without an active track
5. Verify the scrub bar does not stutter while dragging

---

## Documentation Requirements

Every PR or change **must** update the following files before being considered complete:

| File | What to update |
| :--- | :--- |
| [`AGENTS.md`](AGENTS.md) | Architecture, DOM hierarchy, data structures, engineering constraints |
| [`README.md`](README.md) | Feature list, if a user-visible feature was added or removed |
| [`CHANGELOG.md`](CHANGELOG.md) | A new versioned entry describing what changed |

Undocumented changes create drift that breaks future AI-assisted modifications.

---

## Code Style

- Vanilla JS only — no TypeScript, no frameworks
- Use `const`/`let`, never `var`
- Inline styles via `.style.*` (matches existing pattern; avoids CSP issues in Google Docs)
- Keep helper functions (`formatTime`, `styleStepperBtn`, etc.) near the top of the IIFE, before they are used
