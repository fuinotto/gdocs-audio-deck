# gdocs-audio-deck
Tampermonkey script to play google drive audio files in google docs

<img width="467" height="289" alt="image" src="https://github.com/user-attachments/assets/c1f53412-e360-4da1-9494-e71f55295431" />

# **Project Documentation: Google Docs Dual-Slot Audio Player**

This document serves as a comprehensive technical specification and functional guide for the **Google Docs Dual-Slot Interactive Audio Player** Tampermonkey script.  
If you want to modify, debug, or extend this project in the future, feed this entire markdown file to an AI assistant to give it instant, perfect context on how the system works.

## **1\. Project Goal & Overview**

The goal of this userscript is to provide Google Docs users with a seamless, built-in dual-track audio player. It targets Google Drive audio links embedded in a document, intercepts clicks on those links, and loads them into a compact, floating custom player interface.  
The key value proposition is **DJ-style seamless transitions**: instead of one track abruptly stopping when another is clicked, the script handles two audio slots simultaneously and crossfades between them.

## **2\. Core Functional Specifications**

### **A. Dual-Slot State Management**

* **The Slots:** The script maintains two static audio tracks: **Slot A** and **Slot B**.  
* **Target Selection Rules:**  
  1. If both slots are empty, the first clicked link loads into **Slot A**.  
  2. If Slot A is occupied but Slot B is empty, the next clicked link loads into **Slot B**.  
  3. If both slots are occupied, any newly clicked link will overwrite whichever slot is **not** currently playing. This ensures active audio is never cut off by a loading track.

### **B. Link Interception & Streaming**

* **Target Scope:** Matches any webpage under \[https://docs.google.com/document/\](https://docs.google.com/document/)\*.  
* **Capture Target:** Listens for clicks on standard anchor tags (\<a\>) or Google Docs "Rich Links" (.docs-richlink) containing Google Drive file paths.  
* **Stream Translation:** Converts standard sharing URLs into raw download streams using the format:  
  \[https://docs.google.com/uc?export=download\&id=\](https://docs.google.com/uc?export=download\&id=)\[FILE\_ID\]

### **C. Linear Crossfade Engine**

When a user triggers a track in an inactive slot while the active slot is playing, the player initiates a linear crossfade:

* **Steps:** The volume of the active track is lowered from 1.0 to 0.0 over 20 steps, while the incoming track's volume rises from 0.0 to 1.0.  
* **Duration:** Determined dynamically by the user via the UI Fade Stepper.  
* **Instant Cut:** If the fade duration is set to 0.0 seconds, the transition bypasses the interval loop entirely, performing an immediate hard swap (the old track pauses, the new track starts at full volume).

### **D. Audio Controls & Behaviors**

* **Shared Loop:** A single toggle switch controls the looping behavior for *both* audio elements.  
* **Automatic End-of-Track Reset:** If looping is disabled and a track finishes playing:  
  * The browser's native 'ended' event triggers.  
  * The playhead is reset to 0:00.  
  * The slot's UI button returns to the default "▶ PLAY" state.

## **3\. UI/UX Architecture**

The player interface is a floating, modern card pinned to the bottom-right of the viewport. It is styled to blend with Google's native Clean Material design palette.

| UI Element | Styling & Constraints | Behavior |
| :---- | :---- | :---- |
| **Main Panel** | Fixed width: 400px, white background, rounded corners (16px), drop shadow. Hidden until the first link is clicked. | Serves as the master container. |
| **Top Control Bar** | Displays "Audio Controller", a Shared Loop Checkbox, and a Fade Stepper. | Persistent global settings. |
| **Fade Stepper** | Consists of \[-\] button, numeric display, and \[+\] button. | Steps value by 0.5s. Constrained strictly between 0 and 3 seconds. Default value is 1 second. |
| **Slot Cards (A & B)** | Rounded borders, switching backgrounds depending on the slot state. | Visualizes the status of each audio slot. |
| **Play/Pause Button** | Custom pill button. Shows **"EMPTY"**, **"▶ PLAY"**, or **"⏸ PAUSE"**. | Triggers manual playback, pause, or crossfading. |
| **Scrub Bar** | Custom HTML Range Input (\<input type="range"\>). Accent color matches active/inactive states. | Allows manual timeline scrubbing. Tracks audio progress in real-time. |
| **Time Display** | Monospace text in format mm:ss/mm:ss (current/total). | Shows live progress. Displays \--:-- for duration if metadata hasn't buffered yet. |

## **4\. Technical Architecture & Flow**

The script is structured as a self-contained, immediately invoked function expression (IIFE).

### **Data Structure (The slots Object)**

JavaScript  
const slots \= {  
    A: {   
        id: null,               // Google Drive File ID  
        name: "Track Name",     // Display name parsed from document anchor text  
        audio: HTMLAudioElement,// Native \<audio\> element appended to body  
        ui: Object,             // Cached references to card elements (btn, slider, etc.)  
        isUserDragging: false   // Flag to prevent UI render from fighting user scrubbing  
    },  
    B: { ... }  
};

### **Event Flow Diagram**

\[ User Clicks Google Drive Link in Doc \]  
                 │  
                 ▼  
\[ Convert Link to Raw Stream URL \]  
                 │  
                 ▼  
\[ Determine Available Slot (A or B) \]  
                 │  
                 ▼  
\[ Load URL & Begin Preloading Metadata (Total Length) \]  
                 │  
                 ▼  
\[ Update UI state to "READY" \] ──► (If first track: Play immediately)

## **5\. Guidelines for Future AI Modification**

If you are an AI tasked with updating this code, adhere strictly to these engineering constraints:

1. **Do Not De-synchronize the UI Loop:** The UI updates via a shared interval timer running every 250 milliseconds. Never bind progress updates directly to the audio 'timeupdate' event, as it fires inconsistently and causes performance degradation in Google Docs.  
2. **Maintain isUserDragging Flag:** When a user interacts with the range slider (mousedown/touchstart), isUserDragging must be set to true to pause programmatic interval updates. If omitted, the seeker knob will stutter violently as the audio position fights the user's cursor.  
3. **Sanitize Track Names:** Google Docs link HTML can contain complex nested inline elements or newlines. Always strip newline characters (\\n) and leading/trailing whitespace when extracting the track name.  
4. **Protect Button Disabled State during Crossfade:** While a crossfade is active, the controls must temporarily set .disabled \= true on both play buttons to prevent a user from interrupting the volume loop and causing erratic gain values. Ensure sourceAudio.volume and targetAudio.volume are explicitly reset to 1.0 once the fade concludes.
