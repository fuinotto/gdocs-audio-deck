# Implementation Plan: Multi-Source Audio Support

## Goal

Extend the link interception logic to support audio sources beyond Google Drive,
using a pluggable resolver pattern that keeps the click handler clean and extensible.

---

## 1. Affected File

`src/dual-slot-interactive-audio-player.js`

---

## 2. New Architecture: Source Resolvers

Replace the current hard-coded Drive regex check with an ordered array of resolver
functions. Each resolver receives a URL string and returns either a result object
or `null` to pass to the next resolver.

### Resolver contract

```js
// (url: string) => { streamUrl: string, fallbackName?: string } | null
```

### Resolver list (evaluated top-to-bottom, first match wins)

| # | Source | Detection | Transform |
|---|--------|-----------|-----------|
| 1 | **Direct audio file** | URL ends with `.mp3 .ogg .wav .flac .aac .m4a` | Use URL as-is |
| 2 | **Google Drive** (existing) | `/file/d/<ID>` or `id=<ID>` | `/uc?export=download&id=<ID>` |
| 3 | **Dropbox** | `dropbox.com/s/` | Replace host with `dl.dropboxusercontent.com`, strip `?dl=0` |

---

## 3. Code Changes

### 3a. Add resolver array (insert before the click handler)

```js
const sourceResolvers = [
    // 1. Direct audio file URL
    (url) => {
        if (/\.(mp3|ogg|wav|flac|aac|m4a)(\?.*)?$/i.test(url)) {
            const fileName = url.split('/').pop().split('?')[0];
            return { streamUrl: url, fallbackName: decodeURIComponent(fileName) };
        }
        return null;
    },
    // 2. Google Drive
    (url) => {
        const m = url.match(/\/file\/d\/([^\/? \n]+)/) || url.match(/[?&]id=([^& \n]+)/);
        if (!m) return null;
        return { streamUrl: `https://docs.google.com/uc?export=download&id=${m[1]}` };
    },
    // 3. Dropbox
    (url) => {
        if (!/dropbox\.com\/s\//i.test(url)) return null;
        const streamUrl = url
            .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
            .replace(/[?&]dl=\d/, '');
        return { streamUrl };
    },
];
```

### 3b. Update the click handler

Replace this block:

```js
const driveMatch = url.match(/\/file\/d\/([^\/? \n]+)/) || url.match(/id=([^& \n]+)/);
if (!driveMatch || !driveMatch[1]) return;

e.preventDefault();
e.stopPropagation();

const fileId = driveMatch[1];
const trackName = (target.innerText || "Google Drive Track").replace(/\n/g, ' ').trim();
const streamUrl = `https://docs.google.com/uc?export=download&id=${fileId}`;
```

With:

```js
let resolved = null;
for (const resolver of sourceResolvers) {
    resolved = resolver(url);
    if (resolved) break;
}
if (!resolved) return;

e.preventDefault();
e.stopPropagation();

const streamUrl = resolved.streamUrl;
const trackName = (target.innerText || resolved.fallbackName || "Audio Track")
    .replace(/\n/g, ' ').trim();
```

### 3c. Update slot `id` field

The `id` field currently stores the Drive file ID. For non-Drive sources it should
store the stream URL itself (still serves as a non-null occupied sentinel):

```js
selectedSlot.id = streamUrl; // was: fileId
```

---

## 4. CORS Considerations

| Source | CORS | Notes |
|--------|------|-------|
| Google Drive `/uc?export=download` | ✅ Works | Existing behavior |
| Direct `.mp3` links | ⚠️ Host-dependent | Most CDNs allow it; private servers may not |
| Dropbox direct-download | ✅ Works | `dl.dropboxusercontent.com` sends permissive headers |

No `@grant` changes needed — all sources stream via `<audio src>` directly.

---

## 5. Documentation Updates Required

Per AGENTS.md constraint #5, the following docs must be updated in the same commit:

- **AGENTS.md §2.B** — update "Link Interception & Streaming" to list all three
  supported source types and the resolver pattern
- **README.md** — add a "Supported Audio Sources" section
- **CHANGELOG.md** — add a new entry under the next version bump

---

## 6. Testing Checklist

- [ ] Google Drive share link still loads and streams correctly
- [ ] Direct `.mp3` URL (e.g. from a CDN) loads into the correct slot
- [ ] Dropbox share link (`?dl=0`) resolves to the direct-download URL
- [ ] Non-audio links in the doc are still ignored (no false positives)
- [ ] Track name falls back to filename for direct links with no anchor text
- [ ] Crossfade, loop, scrub bar, and collapse all work unchanged with new sources
