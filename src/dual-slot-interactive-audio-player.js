// ==UserScript==
// @name         Google Docs Dual-Slot Interactive Audio Player
// @namespace    http://tampermonkey.net/
// @version      0.7.3
// @description  Plays Drive links in Docs using two static slots with crossfade, an independent Ambience looping slot (with name-based auto-routing), a 9-button SFX pad (per-pad preloaded audio, name-based auto-routing, stop and edit controls), and a collapsible UI.
// @author       You
// @match        https://docs.google.com/document/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const version = '0.7.3';

    // Core Slot Objects
    const slots = {
        A: { id: null, name: "No Track Loaded", audio: document.createElement('audio'), ui: null, isUserDragging: false },
        B: { id: null, name: "No Track Loaded", audio: document.createElement('audio'), ui: null, isUserDragging: false }
    };

    let activeSlotKey = null; // Current active slot key ('A' or 'B')
    let isCollapsed = false;  // Track collapsed state

    // ── SFX & Ambience: user-editable config ─────────────────────────────
    // Replace any id: null with a Google Drive File ID string to pre-fill that pad.
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

    // Ambience slot — same shape as A/B slots; always loops; volume independent
    const ambienceSlot = {
        id: null,
        name: "No Ambience",
        audio: document.createElement('audio'),
        isUserDragging: false,
        ui: null
    };

    // SFX layer — one <audio> element per pad for zero-latency preloading
    const sfxPad = SFX_PAD_CONFIG.map(cfg => ({ id: cfg.id, label: cfg.label, btn: null, audio: null }));

    let sfxVolume = 0.8;            // Shared volume applied to all pad audios
    let armedPadIndex = null;       // Pad button index waiting to receive a Drive link
    let playingPadIndex = null;     // Pad index currently playing (for ended-style revert)
    let isSfxSectionExpanded = true; // Whether the Ambience & SFX section is visible
    let isSfxEditMode = false;      // Whether SFX board is in delete-mode

    // Configure Audio defaults & event listeners
    for (let key in slots) {
        slots[key].audio.loop = true;
        document.body.appendChild(slots[key].audio);

        // Handle track ending (when loop is unchecked)
        slots[key].audio.addEventListener('ended', () => {
            slots[key].audio.currentTime = 0; // Reset playhead to start
            refreshUI();                      // Redraw UI to show "PLAY" state
        });
    }

    // Ambience audio setup — always looping, volume independent of A/B
    ambienceSlot.audio.loop = true;
    document.body.appendChild(ambienceSlot.audio);

    // SFX per-pad audio setup — preload any pre-filled IDs from SFX_PAD_CONFIG
    sfxPad.forEach(pad => {
        pad.audio = createSfxAudio(pad.id);
    });

    function createSfxAudio(fileId) {
        const el = document.createElement('audio');
        el.loop = false;
        el.volume = sfxVolume;
        if (fileId) {
            el.src = buildStreamUrl(fileId);
            el.preload = 'auto';
        }
        document.body.appendChild(el);
        return el;
    }

    // Main UI Panel
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '25px';
    container.style.right = '25px';
    container.style.zIndex = '999999';
    container.style.background = '#ffffff';
    container.style.padding = '16px';
    container.style.boxShadow = '0px 6px 24px rgba(0,0,0,0.15)';
    container.style.borderRadius = '16px';
    container.style.display = 'none';
    container.style.flexDirection = 'column';
    container.style.gap = '12px';
    container.style.border = '1px solid #e0e0e0';
    container.style.width = '400px';
    container.style.fontFamily = '"Google Sans", Roboto, Arial, sans-serif';
    container.style.userSelect = 'none';
    container.style.transition = 'all 0.3s ease';

    // Top Header / Settings Row
    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';

    const header = document.createElement('div');
    header.style.fontSize = '11px';
    header.style.fontWeight = 'bold';
    header.style.color = '#5f6368';
    header.style.textTransform = 'uppercase';
    header.innerText = "Audio Controller";
    header.title = `Audio Controller v${version}`;

    // Collapse button (to minimize panel)
    const collapseBtn = document.createElement('button');
    collapseBtn.innerText = '−';
    collapseBtn.style.border = '1px solid #dadce0';
    collapseBtn.style.background = '#f1f3f4';
    collapseBtn.style.borderRadius = '4px';
    collapseBtn.style.width = '24px';
    collapseBtn.style.height = '24px';
    collapseBtn.style.display = 'flex';
    collapseBtn.style.alignItems = 'center';
    collapseBtn.style.justifyContent = 'center';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.fontSize = '14px';
    collapseBtn.style.fontWeight = 'bold';
    collapseBtn.style.color = '#5f6368';
    collapseBtn.style.padding = '0';
    collapseBtn.title = 'Minimize player';
    collapseBtn.addEventListener('mouseenter', () => collapseBtn.style.background = '#e8eaed');
    collapseBtn.addEventListener('mouseleave', () => collapseBtn.style.background = '#f1f3f4');
    collapseBtn.addEventListener('click', toggleCollapse);

    // Right-aligned settings container (Loop & Fade Settings & Compact Controls)
    const settingsContainer = document.createElement('div');
    settingsContainer.style.display = 'flex';
    settingsContainer.style.alignItems = 'center';
    settingsContainer.style.gap = '12px';

    // Loop Switch
    const loopLabel = document.createElement('label');
    loopLabel.style.display = 'flex';
    loopLabel.style.alignItems = 'center';
    loopLabel.style.gap = '4px';
    loopLabel.style.fontSize = '12px';
    loopLabel.style.color = '#5f6368';
    loopLabel.style.cursor = 'pointer';

    const loopCheckbox = document.createElement('input');
    loopCheckbox.type = 'checkbox';
    loopCheckbox.checked = true;
    loopCheckbox.style.cursor = 'pointer';
    loopCheckbox.addEventListener('change', () => {
        slots.A.audio.loop = loopCheckbox.checked;
        slots.B.audio.loop = loopCheckbox.checked;
    });

    loopLabel.appendChild(loopCheckbox);
    loopLabel.appendChild(document.createTextNode('Loop'));

    // Fade Customizer Row (Stepper UI)
    const fadeWrapper = document.createElement('div');
    fadeWrapper.style.display = 'flex';
    fadeWrapper.style.alignItems = 'center';
    fadeWrapper.style.gap = '4px';
    fadeWrapper.style.fontSize = '12px';
    fadeWrapper.style.color = '#5f6368';

    const fadeLabel = document.createElement('span');
    fadeLabel.innerText = 'Fade:';

    const btnMinus = document.createElement('button');
    btnMinus.innerText = '-';
    styleStepperBtn(btnMinus);

    const fadeInput = document.createElement('input');
    fadeInput.type = 'number';
    fadeInput.value = '1';
    fadeInput.min = '0';
    fadeInput.max = '3';
    fadeInput.step = '0.5';
    fadeInput.style.width = '38px';
    fadeInput.style.textAlign = 'center';
    fadeInput.style.border = '1px solid #dadce0';
    fadeInput.style.borderRadius = '4px';
    fadeInput.style.fontSize = '11px';
    fadeInput.style.padding = '2px 0';
    fadeInput.style.mozAppearance = 'textfield';
    fadeInput.style.webkitAppearance = 'none';
    fadeInput.style.margin = '0';

    const btnPlus = document.createElement('button');
    btnPlus.innerText = '+';
    styleStepperBtn(btnPlus);

    // Compact Play/Pause button (only visible when collapsed)
    const compactPlayBtn = document.createElement('button');
    compactPlayBtn.style.border = '1px solid #dadce0';
    compactPlayBtn.style.background = '#e8f0fe';
    compactPlayBtn.style.borderRadius = '4px';
    compactPlayBtn.style.width = '24px';
    compactPlayBtn.style.height = '24px';
    compactPlayBtn.style.display = 'none';
    compactPlayBtn.style.alignItems = 'center';
    compactPlayBtn.style.justifyContent = 'center';
    compactPlayBtn.style.cursor = 'pointer';
    compactPlayBtn.style.fontSize = '14px';
    compactPlayBtn.style.fontWeight = 'bold';
    compactPlayBtn.style.color = '#1a73e8';
    compactPlayBtn.style.padding = '0';
    compactPlayBtn.title = 'Play/Pause active track';
    compactPlayBtn.innerText = '▶';
    compactPlayBtn.addEventListener('mouseenter', () => compactPlayBtn.style.background = '#d2e3fc');
    compactPlayBtn.addEventListener('mouseleave', () => {
        if (!activeSlotKey || slots[activeSlotKey].audio.paused) {
            compactPlayBtn.style.background = '#e8f0fe';
        } else {
            compactPlayBtn.style.background = '#1a73e8';
        }
    });
    compactPlayBtn.addEventListener('click', () => {
        if (!activeSlotKey) return;
        const slot = slots[activeSlotKey];
        if (slot.audio.paused) {
            slot.audio.play();
        } else {
            slot.audio.pause();
        }
        refreshUI();
    });

    // Style Helper for Stepper Buttons
    function styleStepperBtn(btn) {
        btn.style.border = '1px solid #dadce0';
        btn.style.background = '#f1f3f4';
        btn.style.borderRadius = '4px';
        btn.style.width = '24px';
        btn.style.height = '24px';
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.fontWeight = 'bold';
        btn.style.color = '#5f6368';
        btn.style.padding = '0';
        btn.addEventListener('mouseenter', () => btn.style.background = '#e8eaed');
        btn.addEventListener('mouseleave', () => btn.style.background = '#f1f3f4');
    }

    // Step adjustment handlers
    btnMinus.addEventListener('click', () => adjustFadeValue(-0.5));
    btnPlus.addEventListener('click', () => adjustFadeValue(0.5));

    function adjustFadeValue(step) {
        let val = parseFloat(fadeInput.value) + step;
        val = Math.max(0, Math.min(3, val)); // Constrain between 0 and 3 seconds
        fadeInput.value = val.toFixed(1);
    }

    // Direct text input validation
    fadeInput.addEventListener('change', () => {
        let val = parseFloat(fadeInput.value);
        if (isNaN(val)) val = 1.0;
        val = Math.max(0, Math.min(3, val));
        fadeInput.value = val;
    });

    fadeWrapper.appendChild(fadeLabel);
    fadeWrapper.appendChild(btnMinus);
    fadeWrapper.appendChild(fadeInput);
    fadeWrapper.appendChild(btnPlus);

    settingsContainer.appendChild(loopLabel);
    settingsContainer.appendChild(fadeWrapper);
    settingsContainer.appendChild(compactPlayBtn);
    settingsContainer.appendChild(collapseBtn);

    topRow.appendChild(header);
    topRow.appendChild(settingsContainer);
    container.appendChild(topRow);

    // Content area that will be hidden when collapsed
    const contentArea = document.createElement('div');
    contentArea.style.display = 'flex';
    contentArea.style.flexDirection = 'column';
    contentArea.style.gap = '12px';
    //contentArea.style.marginLeft = '12px';

    // Slot UI Card Generator
    function createSlotUI(key) {
        const card = document.createElement('div');
        card.style.borderRadius = '8px';
        card.style.padding = '10px 12px';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '6px';
        card.style.transition = 'all 0.25s ease';

        const tag = document.createElement('div');
        tag.style.fontSize = '10px';
        tag.style.fontWeight = 'bold';
        tag.innerText = `SLOT ${key}`;

        const nameEl = document.createElement('div');
        nameEl.style.fontSize = '13px';
        nameEl.style.fontWeight = '500';
        nameEl.style.whiteSpace = 'nowrap';
        nameEl.style.overflow = 'hidden';
        nameEl.style.textOverflow = 'ellipsis';
        nameEl.innerText = "Empty";

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '10px';

        const btn = document.createElement('button');
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.style.padding = '5px 10px';
        btn.style.fontSize = '11px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.flexShrink = '0';
        btn.innerText = "EMPTY";

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = '0';
        slider.style.flexGrow = '1';
        slider.style.cursor = 'pointer';
        slider.style.height = '4px';
        slider.style.accentColor = '#1a73e8';

        const timeEl = document.createElement('div');
        timeEl.style.fontSize = '11px';
        timeEl.style.color = '#70757a';
        timeEl.style.fontFamily = 'monospace';
        timeEl.style.flexShrink = '0';
        timeEl.innerText = "0:00/0:00";

        row.appendChild(btn);
        row.appendChild(slider);
        row.appendChild(timeEl);

        card.appendChild(tag);
        card.appendChild(nameEl);
        card.appendChild(row);

        slider.addEventListener('mousedown', () => slots[key].isUserDragging = true);
        slider.addEventListener('touchstart', () => slots[key].isUserDragging = true);

        slider.addEventListener('change', () => {
            const audio = slots[key].audio;
            if (audio.duration) {
                audio.currentTime = (slider.value / 100) * audio.duration;
            }
            slots[key].isUserDragging = false;
        });

        slider.addEventListener('input', () => {
            const audio = slots[key].audio;
            if (audio.duration) {
                const tempTime = (slider.value / 100) * audio.duration;
                timeEl.innerText = `${formatTime(tempTime)}/${formatTime(audio.duration)}`;
            }
        });

        btn.addEventListener('click', () => handleButtonClick(key));

        return { card, nameEl, btn, slider, timeEl, tag };
    }

    slots.A.ui = createSlotUI('A');
    slots.B.ui = createSlotUI('B');
    contentArea.appendChild(slots.A.ui.card);
    contentArea.appendChild(slots.B.ui.card);
    container.appendChild(contentArea);

    // ── AMBIENCE & SFX expandable section ──────────────────────────────────
    const expandableSection = document.createElement('div');
    expandableSection.style.display = 'flex';
    expandableSection.style.flexDirection = 'column';
    expandableSection.style.gap = '8px';

    // Section toggle bar
    const sectionToggleBar = document.createElement('div');
    sectionToggleBar.style.display = 'flex';
    sectionToggleBar.style.justifyContent = 'space-between';
    sectionToggleBar.style.alignItems = 'center';
    sectionToggleBar.style.cursor = 'pointer';
    sectionToggleBar.addEventListener('click', toggleSfxSection);

    const sectionLabel = document.createElement('div');
    sectionLabel.style.fontSize = '11px';
    sectionLabel.style.fontWeight = 'bold';
    sectionLabel.style.color = '#5f6368';
    sectionLabel.style.textTransform = 'uppercase';
    sectionLabel.style.letterSpacing = '0.3px';
    sectionLabel.innerText = '▾ Ambience & SFX';

    const sfxChevronBtn = document.createElement('button');
    styleStepperBtn(sfxChevronBtn);
    sfxChevronBtn.innerText = '−';
    sfxChevronBtn.title = 'Collapse Ambience & SFX';

    sectionToggleBar.appendChild(sectionLabel);
    sectionToggleBar.appendChild(sfxChevronBtn);

    // Section content (collapsible)
    const sectionContent = document.createElement('div');
    sectionContent.style.display = 'flex';
    sectionContent.style.flexDirection = 'column';
    sectionContent.style.gap = '12px';

    // ── Ambience card ──
    const ambienceCard = document.createElement('div');
    ambienceCard.style.borderRadius = '8px';
    ambienceCard.style.padding = '10px 12px';
    ambienceCard.style.display = 'flex';
    ambienceCard.style.flexDirection = 'column';
    ambienceCard.style.gap = '6px';
    ambienceCard.style.border = '1px dashed #dadce0';
    ambienceCard.style.background = '#fafafa';
    ambienceCard.style.transition = 'all 0.25s ease';

    const ambienceHeaderRow = document.createElement('div');
    ambienceHeaderRow.style.display = 'flex';
    ambienceHeaderRow.style.justifyContent = 'space-between';
    ambienceHeaderRow.style.alignItems = 'center';

    const ambienceTag = document.createElement('div');
    ambienceTag.style.fontSize = '10px';
    ambienceTag.style.fontWeight = 'bold';
    ambienceTag.style.color = '#70757a';
    ambienceTag.innerText = 'AMBIENCE';

    const ambienceVolWrapper = document.createElement('div');
    ambienceVolWrapper.style.display = 'flex';
    ambienceVolWrapper.style.alignItems = 'center';
    ambienceVolWrapper.style.gap = '4px';
    ambienceVolWrapper.style.fontSize = '10px';
    ambienceVolWrapper.style.color = '#5f6368';

    const ambienceVolLabel = document.createElement('span');
    ambienceVolLabel.innerText = 'Vol:';

    const ambienceVolSlider = document.createElement('input');
    ambienceVolSlider.type = 'range';
    ambienceVolSlider.min = '0';
    ambienceVolSlider.max = '1';
    ambienceVolSlider.step = '0.05';
    ambienceVolSlider.value = '0.7';
    ambienceVolSlider.style.width = '70px';
    ambienceVolSlider.style.cursor = 'pointer';
    ambienceVolSlider.style.height = '4px';
    ambienceVolSlider.style.accentColor = '#34a853';
    ambienceVolSlider.addEventListener('input', () => {
        ambienceSlot.audio.volume = parseFloat(ambienceVolSlider.value);
    });
    ambienceSlot.audio.volume = 0.7;

    ambienceVolWrapper.appendChild(ambienceVolLabel);
    ambienceVolWrapper.appendChild(ambienceVolSlider);
    ambienceHeaderRow.appendChild(ambienceTag);
    ambienceHeaderRow.appendChild(ambienceVolWrapper);

    const ambienceNameEl = document.createElement('div');
    ambienceNameEl.style.fontSize = '13px';
    ambienceNameEl.style.fontWeight = '500';
    ambienceNameEl.style.whiteSpace = 'nowrap';
    ambienceNameEl.style.overflow = 'hidden';
    ambienceNameEl.style.textOverflow = 'ellipsis';
    ambienceNameEl.style.color = '#70757a';
    ambienceNameEl.innerText = 'No Ambience';

    const ambienceControlRow = document.createElement('div');
    ambienceControlRow.style.display = 'flex';
    ambienceControlRow.style.alignItems = 'center';
    ambienceControlRow.style.justifyContent = 'space-between';
    ambienceControlRow.style.gap = '10px';

    const ambienceBtn = document.createElement('button');
    ambienceBtn.style.border = 'none';
    ambienceBtn.style.borderRadius = '6px';
    ambienceBtn.style.padding = '5px 10px';
    ambienceBtn.style.fontSize = '11px';
    ambienceBtn.style.fontWeight = 'bold';
    ambienceBtn.style.cursor = 'pointer';
    ambienceBtn.style.flexShrink = '0';
    ambienceBtn.style.background = '#f1f3f4';
    ambienceBtn.style.color = '#70757a';
    ambienceBtn.innerText = 'EMPTY';
    ambienceBtn.addEventListener('click', handleAmbienceClick);

    const ambienceSlider = document.createElement('input');
    ambienceSlider.type = 'range';
    ambienceSlider.min = '0';
    ambienceSlider.max = '100';
    ambienceSlider.value = '0';
    ambienceSlider.style.flexGrow = '1';
    ambienceSlider.style.cursor = 'pointer';
    ambienceSlider.style.height = '4px';
    ambienceSlider.style.accentColor = '#34a853';
    ambienceSlider.addEventListener('mousedown', () => { ambienceSlot.isUserDragging = true; });
    ambienceSlider.addEventListener('touchstart', () => { ambienceSlot.isUserDragging = true; });
    ambienceSlider.addEventListener('change', () => {
        if (ambienceSlot.audio.duration) {
            ambienceSlot.audio.currentTime = (ambienceSlider.value / 100) * ambienceSlot.audio.duration;
        }
        ambienceSlot.isUserDragging = false;
    });
    ambienceSlider.addEventListener('input', () => {
        if (ambienceSlot.audio.duration) {
            const t = (ambienceSlider.value / 100) * ambienceSlot.audio.duration;
            ambienceTimeEl.innerText = `${formatTime(t)}/${formatTime(ambienceSlot.audio.duration)}`;
        }
    });

    const ambienceTimeEl = document.createElement('div');
    ambienceTimeEl.style.fontSize = '11px';
    ambienceTimeEl.style.color = '#70757a';
    ambienceTimeEl.style.fontFamily = 'monospace';
    ambienceTimeEl.style.flexShrink = '0';
    ambienceTimeEl.innerText = '0:00/0:00';

    ambienceControlRow.appendChild(ambienceBtn);
    ambienceControlRow.appendChild(ambienceSlider);
    ambienceControlRow.appendChild(ambienceTimeEl);

    ambienceCard.appendChild(ambienceHeaderRow);
    ambienceCard.appendChild(ambienceNameEl);
    ambienceCard.appendChild(ambienceControlRow);

    // Store refs
    ambienceSlot.ui = { card: ambienceCard, tag: ambienceTag, nameEl: ambienceNameEl, btn: ambienceBtn, slider: ambienceSlider, timeEl: ambienceTimeEl };

    // ── Divider ──
    const sfxDivider = document.createElement('div');
    sfxDivider.style.borderTop = '1px solid #e0e0e0';

    // ── SFX Panel ──
    const sfxPanel = document.createElement('div');
    sfxPanel.style.display = 'flex';
    sfxPanel.style.flexDirection = 'column';
    sfxPanel.style.gap = '8px';

    const sfxHeaderRow = document.createElement('div');
    sfxHeaderRow.style.display = 'flex';
    sfxHeaderRow.style.justifyContent = 'space-between';
    sfxHeaderRow.style.alignItems = 'center';

    const sfxPadLabel = document.createElement('div');
    sfxPadLabel.style.fontSize = '10px';
    sfxPadLabel.style.fontWeight = 'bold';
    sfxPadLabel.style.color = '#5f6368';
    sfxPadLabel.style.textTransform = 'uppercase';
    sfxPadLabel.innerText = 'SFX Pad';

    const sfxVolWrapper = document.createElement('div');
    sfxVolWrapper.style.display = 'flex';
    sfxVolWrapper.style.alignItems = 'center';
    sfxVolWrapper.style.gap = '4px';
    sfxVolWrapper.style.fontSize = '10px';
    sfxVolWrapper.style.color = '#5f6368';

    const sfxVolLabel = document.createElement('span');
    sfxVolLabel.innerText = 'Vol:';

    const sfxVolSlider = document.createElement('input');
    sfxVolSlider.type = 'range';
    sfxVolSlider.min = '0';
    sfxVolSlider.max = '1';
    sfxVolSlider.step = '0.05';
    sfxVolSlider.value = '0.8';
    sfxVolSlider.style.width = '70px';
    sfxVolSlider.style.cursor = 'pointer';
    sfxVolSlider.style.height = '4px';
    sfxVolSlider.style.accentColor = '#ea4335';
    sfxVolSlider.addEventListener('input', () => {
        sfxVolume = parseFloat(sfxVolSlider.value);
        sfxPad.forEach(pad => { if (pad.audio) pad.audio.volume = sfxVolume; });
    });
    // Initial volume already set via createSfxAudio — no extra line needed

    sfxVolWrapper.appendChild(sfxVolLabel);
    sfxVolWrapper.appendChild(sfxVolSlider);

    // Stop SFX button
    const sfxStopBtn = document.createElement('button');
    sfxStopBtn.innerText = '■';
    sfxStopBtn.title = 'Stop SFX';
    sfxStopBtn.style.border = '1px solid #dadce0';
    sfxStopBtn.style.background = '#f1f3f4';
    sfxStopBtn.style.borderRadius = '4px';
    sfxStopBtn.style.width = '20px';
    sfxStopBtn.style.height = '20px';
    sfxStopBtn.style.display = 'flex';
    sfxStopBtn.style.alignItems = 'center';
    sfxStopBtn.style.justifyContent = 'center';
    sfxStopBtn.style.cursor = 'pointer';
    sfxStopBtn.style.fontSize = '9px';
    sfxStopBtn.style.fontWeight = 'bold';
    sfxStopBtn.style.color = '#ea4335';
    sfxStopBtn.style.padding = '0';
    sfxStopBtn.addEventListener('mouseenter', () => sfxStopBtn.style.background = '#fce8e6');
    sfxStopBtn.addEventListener('mouseleave', () => sfxStopBtn.style.background = '#f1f3f4');
    sfxStopBtn.addEventListener('click', () => {
        if (playingPadIndex !== null) {
            sfxPad[playingPadIndex].audio.pause();
            sfxPad[playingPadIndex].audio.currentTime = 0;
            applyPadStyle(playingPadIndex);
            playingPadIndex = null;
        }
    });

    // Edit mode toggle button
    const sfxEditBtn = document.createElement('button');
    sfxEditBtn.innerText = '✎';
    sfxEditBtn.title = 'Edit SFX pad (click a pad to remove its sound)';
    sfxEditBtn.style.border = '1px solid #dadce0';
    sfxEditBtn.style.background = '#f1f3f4';
    sfxEditBtn.style.borderRadius = '4px';
    sfxEditBtn.style.width = '20px';
    sfxEditBtn.style.height = '20px';
    sfxEditBtn.style.display = 'flex';
    sfxEditBtn.style.alignItems = 'center';
    sfxEditBtn.style.justifyContent = 'center';
    sfxEditBtn.style.cursor = 'pointer';
    sfxEditBtn.style.fontSize = '11px';
    sfxEditBtn.style.fontWeight = 'bold';
    sfxEditBtn.style.color = '#5f6368';
    sfxEditBtn.style.padding = '0';
    sfxEditBtn.addEventListener('mouseenter', () => {
        sfxEditBtn.style.background = isSfxEditMode ? '#fbbc04' : '#e8eaed';
    });
    sfxEditBtn.addEventListener('mouseleave', () => {
        sfxEditBtn.style.background = isSfxEditMode ? '#fef7e0' : '#f1f3f4';
    });
    sfxEditBtn.addEventListener('click', toggleSfxEditMode);

    const sfxLabelGroup = document.createElement('div');
    sfxLabelGroup.style.display = 'flex';
    sfxLabelGroup.style.alignItems = 'center';
    sfxLabelGroup.style.gap = '6px';
    sfxLabelGroup.appendChild(sfxPadLabel);
    sfxLabelGroup.appendChild(sfxStopBtn);
    sfxLabelGroup.appendChild(sfxEditBtn);
    sfxHeaderRow.appendChild(sfxLabelGroup);
    sfxHeaderRow.appendChild(sfxVolWrapper);

    // Flash target for Ctrl+click with no armed pad
    sfxHeaderRow.id = '__sfxHeaderRow';

    const padGrid = document.createElement('div');
    padGrid.style.display = 'grid';
    padGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    padGrid.style.gap = '6px';

    sfxPad.forEach((pad, i) => {
        const btn = document.createElement('button');
        btn.style.borderRadius = '6px';
        btn.style.padding = '8px 4px';
        btn.style.fontSize = '11px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'center';
        btn.style.overflow = 'hidden';
        btn.style.textOverflow = 'ellipsis';
        btn.style.whiteSpace = 'nowrap';
        btn.style.transition = 'all 0.15s ease';
        pad.btn = btn;
        // Wire ended event now that btn ref exists
        pad.audio.addEventListener('ended', () => {
            if (playingPadIndex === i) {
                applyPadStyle(i);
                playingPadIndex = null;
            }
        });
        applyPadStyle(i);
        btn.addEventListener('click', () => handlePadClick(i));
        padGrid.appendChild(btn);
    });

    sfxPanel.appendChild(sfxHeaderRow);
    sfxPanel.appendChild(padGrid);

    sectionContent.appendChild(ambienceCard);
    sectionContent.appendChild(sfxDivider);
    sectionContent.appendChild(sfxPanel);

    expandableSection.appendChild(sectionToggleBar);
    expandableSection.appendChild(sectionContent);

    container.appendChild(expandableSection);
    document.body.appendChild(container);

    // Toggle collapse function
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            // Hide content & fade controls, show compact play button
            contentArea.style.display = 'none';
            fadeWrapper.style.display = 'none';
            loopLabel.style.display = 'none';
            compactPlayBtn.style.display = 'flex';
            container.style.width = 'auto';
            container.style.padding = '12px';
            collapseBtn.innerText = '+';
            collapseBtn.title = 'Expand player';
            header._originalInnerText = header.innerText;
            header.innerText = '';
        } else {
            // Show content & fade controls, hide compact play button
            contentArea.style.display = 'flex';
            fadeWrapper.style.display = 'flex';
            loopLabel.style.display = 'flex';
            compactPlayBtn.style.display = 'none';
            container.style.width = '400px';
            container.style.padding = '16px';
            collapseBtn.innerText = '−';
            collapseBtn.title = 'Minimize player';
            header.innerText = header._originalInnerText ?? header.innerText;
        }
    }

    // Refresh UI parameters (Time & Progress bars)
    setInterval(() => {
        for (let key in slots) {
            const slot = slots[key];
            if (slot.id && !slot.isUserDragging) {
                const current = slot.audio.currentTime || 0;
                const total = slot.audio.duration;

                // Set Seek bar progress
                if (total) {
                    slot.ui.slider.value = (current / total) * 100;
                    slot.ui.timeEl.innerText = `${formatTime(current)}/${formatTime(total)}`;
                } else {
                    slot.ui.slider.value = 0;
                    slot.ui.timeEl.innerText = `${formatTime(current)}/--:--`;
                }
            }
        }
        // Ambience scrub & time update
        if (ambienceSlot.id && !ambienceSlot.isUserDragging && ambienceSlot.ui) {
            const cur = ambienceSlot.audio.currentTime || 0;
            const dur = ambienceSlot.audio.duration;
            if (dur) {
                ambienceSlot.ui.slider.value = (cur / dur) * 100;
                ambienceSlot.ui.timeEl.innerText = `${formatTime(cur)}/${formatTime(dur)}`;
            } else {
                ambienceSlot.ui.slider.value = 0;
                ambienceSlot.ui.timeEl.innerText = `${formatTime(cur)}/--:--`;
            }
        }
    }, 250);

    function formatTime(secs) {
        if (isNaN(secs) || secs === Infinity) return "0:00";
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    // Handles slot coloring and button states
    function refreshUI() {
        // Update compact play button state when collapsed
        if (activeSlotKey) {
            const slot = slots[activeSlotKey];
            if (slot.audio.paused) {
                compactPlayBtn.innerText = '▶';
                compactPlayBtn.style.background = '#e8f0fe';
                compactPlayBtn.style.color = '#1a73e8';
            } else {
                compactPlayBtn.innerText = '⏸';
                compactPlayBtn.style.background = '#1a73e8';
                compactPlayBtn.style.color = '#ffffff';
            }
        }

        for (let key in slots) {
            const slot = slots[key];
            if (!slot.id) {
                slot.ui.card.style.background = '#fafafa';
                slot.ui.card.style.border = '1px dashed #dadce0';
                slot.ui.tag.style.color = '#70757a';
                slot.ui.nameEl.style.color = '#70757a';
                slot.ui.nameEl.innerText = "Empty";
                slot.ui.btn.innerText = "EMPTY";
                slot.ui.btn.style.background = '#f1f3f4';
                slot.ui.btn.style.color = '#70757a';
                slot.ui.slider.disabled = true;
                continue;
            }

            slot.ui.nameEl.innerText = slot.name;
            slot.ui.slider.disabled = false;

            if (activeSlotKey === key && !slot.audio.paused) {
                slot.ui.card.style.background = '#f1f3f4';
                slot.ui.card.style.border = '1.5px solid #1a73e8';
                slot.ui.tag.style.color = '#1a73e8';
                slot.ui.tag.innerText = `SLOT ${key} — NOW PLAYING`;
                slot.ui.nameEl.style.color = '#202124';
                slot.ui.btn.innerText = "⏸ PAUSE";
                slot.ui.btn.style.background = '#1a73e8';
                slot.ui.btn.style.color = '#ffffff';
                slot.ui.slider.style.accentColor = '#1a73e8';
            } else {
                slot.ui.card.style.background = '#ffffff';
                slot.ui.card.style.border = '1px solid #dadce0';
                slot.ui.tag.style.color = '#5f6368';
                slot.ui.tag.innerText = `SLOT ${key} — READY`;
                slot.ui.nameEl.style.color = '#5f6368';
                slot.ui.btn.innerText = "▶ PLAY";
                slot.ui.btn.style.background = '#e8f0fe';
                slot.ui.btn.style.color = '#1a73e8';
                slot.ui.slider.style.accentColor = '#70757a';
            }
        }
    }

    // Dynamic Linear Crossfade Engine
    function crossfade(targetKey, sourceKey) {
        slots.A.ui.btn.disabled = true;
        slots.B.ui.btn.disabled = true;

        const targetAudio = slots[targetKey].audio;
        const sourceAudio = slots[sourceKey].audio;

        const fadeDuration = parseFloat(fadeInput.value) * 1000;

        if (fadeDuration <= 0) {
            sourceAudio.pause();
            sourceAudio.volume = 1.0;
            targetAudio.volume = 1.0;
            targetAudio.play();
            activeSlotKey = targetKey;
            slots.A.ui.btn.disabled = false;
            slots.B.ui.btn.disabled = false;
            refreshUI();
            return;
        }

        const steps = 20;
        const stepTime = fadeDuration / steps;
        let currentStep = 0;

        targetAudio.volume = 0;
        targetAudio.play();
        activeSlotKey = targetKey;
        refreshUI();

        const interval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            targetAudio.volume = progress;
            if (sourceAudio.volume > 0) sourceAudio.volume = Math.max(0, 1 - progress);

            if (currentStep >= steps) {
                clearInterval(interval);
                sourceAudio.pause();
                sourceAudio.volume = 1.0;
                targetAudio.volume = 1.0;

                slots.A.ui.btn.disabled = false;
                slots.B.ui.btn.disabled = false;
                refreshUI();
            }
        }, stepTime);
    }

    function handleButtonClick(key) {
        const slot = slots[key];
        if (!slot.id) return;

        if (activeSlotKey === key) {
            if (slot.audio.paused) {
                slot.audio.play();
            } else {
                slot.audio.pause();
            }
            refreshUI();
        } else {
            if (activeSlotKey && !slots[activeSlotKey].audio.paused) {
                crossfade(key, activeSlotKey);
            } else {
                activeSlotKey = key;
                slot.audio.play();
                refreshUI();
            }
        }
    }

    // ── Helper: build a Google Drive stream URL from a file ID ───────────────
    function buildStreamUrl(fileId) {
        return `https://docs.google.com/uc?export=download&id=${fileId}`;
    }

    // ── Helper: assign a file to a pad and preload its audio ─────────────────
    function assignSfxPad(i, fileId, trackName) {
        const pad = sfxPad[i];
        pad.id = fileId;
        pad.label = trackName.length > 14 ? trackName.slice(0, 13) + '…' : trackName;
        pad.audio.src = buildStreamUrl(fileId);
        pad.audio.preload = 'auto';
        pad.audio.volume = sfxVolume;
        pad.audio.load();
    }

    // ── Ambience Controls ─────────────────────────────────────────────────────
    function handleAmbienceClick() {
        if (!ambienceSlot.id) return;
        if (ambienceSlot.audio.paused) {
            ambienceSlot.audio.play();
        } else {
            ambienceSlot.audio.pause();
        }
        refreshAmbienceUI();
    }

    function refreshAmbienceUI() {
        const ui = ambienceSlot.ui;
        if (!ui) return;
        if (!ambienceSlot.id) {
            ui.card.style.background = '#fafafa';
            ui.card.style.border = '1px dashed #dadce0';
            ui.tag.style.color = '#70757a';
            ui.tag.innerText = 'AMBIENCE';
            ui.nameEl.style.color = '#70757a';
            ui.nameEl.innerText = 'No Ambience';
            ui.btn.innerText = 'EMPTY';
            ui.btn.style.background = '#f1f3f4';
            ui.btn.style.color = '#70757a';
            ui.slider.disabled = true;
        } else if (!ambienceSlot.audio.paused) {
            ui.card.style.background = '#f1f3f4';
            ui.card.style.border = '1.5px solid #34a853';
            ui.tag.style.color = '#34a853';
            ui.tag.innerText = 'AMBIENCE — PLAYING';
            ui.nameEl.style.color = '#202124';
            ui.nameEl.innerText = ambienceSlot.name;
            ui.btn.innerText = '⏸ PAUSE';
            ui.btn.style.background = '#34a853';
            ui.btn.style.color = '#ffffff';
            ui.slider.disabled = false;
        } else {
            ui.card.style.background = '#ffffff';
            ui.card.style.border = '1px solid #dadce0';
            ui.tag.style.color = '#5f6368';
            ui.tag.innerText = 'AMBIENCE — READY';
            ui.nameEl.style.color = '#5f6368';
            ui.nameEl.innerText = ambienceSlot.name;
            ui.btn.innerText = '▶ PLAY';
            ui.btn.style.background = '#e6f4ea';
            ui.btn.style.color = '#34a853';
            ui.slider.disabled = false;
        }
    }

    // ── SFX Pad Controls ──────────────────────────────────────────────────────
    function applyPadStyle(i) {
        const pad = sfxPad[i];
        const btn = pad.btn;
        if (!btn) return;
        if (isSfxEditMode && pad.id !== null) {
            // Edit mode: show delete affordance on loaded pads
            btn.innerText = '✕ ' + pad.label;
            btn.style.border = '2px dashed #ea4335';
            btn.style.background = '#fce8e6';
            btn.style.color = '#c5221f';
        } else if (isSfxEditMode) {
            // Edit mode: empty pad — dim it, not interactive
            btn.innerText = pad.label;
            btn.style.border = '1px dashed #dadce0';
            btn.style.background = '#fafafa';
            btn.style.color = '#c5c5c5';
        } else {
            btn.innerText = pad.label;
            if (i === armedPadIndex) {
                btn.style.border = '2px dashed #1a73e8';
                btn.style.background = '#e8f0fe';
                btn.style.color = '#1a73e8';
            } else if (i === playingPadIndex && pad.audio && !pad.audio.paused) {
                btn.style.border = '2px solid #ea4335';
                btn.style.background = '#fce8e6';
                btn.style.color = '#c5221f';
            } else if (pad.id !== null) {
                btn.style.border = '1.5px solid #dadce0';
                btn.style.background = '#ffffff';
                btn.style.color = '#202124';
            } else {
                btn.style.border = '1px dashed #dadce0';
                btn.style.background = '#fafafa';
                btn.style.color = '#9aa0a6';
            }
        }
    }

    function handlePadClick(i) {
        const pad = sfxPad[i];

        // Edit mode: clicking a loaded pad clears it
        if (isSfxEditMode) {
            if (pad.id !== null) {
                // Stop if currently playing
                if (playingPadIndex === i) {
                    pad.audio.pause();
                    pad.audio.currentTime = 0;
                    playingPadIndex = null;
                }
                // Reset to empty
                pad.audio.removeAttribute('src');
                pad.audio.load();
                pad.id = null;
                pad.label = SFX_PAD_CONFIG[i].label;
                applyPadStyle(i);
            }
            return;
        }

        // Toggle disarm if clicking already-armed pad
        if (armedPadIndex === i) {
            armedPadIndex = null;
            applyPadStyle(i);
            return;
        }

        // Disarm any previously armed pad
        if (armedPadIndex !== null) {
            const prev = armedPadIndex;
            armedPadIndex = null;
            applyPadStyle(prev);
        }

        // If pad is empty, arm it to receive a Drive link
        if (pad.id === null) {
            armedPadIndex = i;
            applyPadStyle(i);
            return;
        }

        // Pad is loaded — stop any currently playing pad, then play this one
        if (playingPadIndex !== null && playingPadIndex !== i) {
            sfxPad[playingPadIndex].audio.pause();
            sfxPad[playingPadIndex].audio.currentTime = 0;
            applyPadStyle(playingPadIndex);
        }
        pad.audio.currentTime = 0;
        pad.audio.volume = sfxVolume;
        pad.audio.play();
        playingPadIndex = i;
        applyPadStyle(i);
    }

    // ── SFX edit mode toggle ──────────────────────────────────────────────────
    function toggleSfxEditMode() {
        isSfxEditMode = !isSfxEditMode;
        if (isSfxEditMode) {
            // Exit arm mode when entering edit mode
            if (armedPadIndex !== null) {
                const prev = armedPadIndex;
                armedPadIndex = null;
                applyPadStyle(prev);
            }
            sfxEditBtn.style.background = '#fef7e0';
            sfxEditBtn.style.border = '1px solid #fbbc04';
            sfxEditBtn.style.color = '#e37400';
            sfxEditBtn.title = 'Exit edit mode';
        } else {
            sfxEditBtn.style.background = '#f1f3f4';
            sfxEditBtn.style.border = '1px solid #dadce0';
            sfxEditBtn.style.color = '#5f6368';
            sfxEditBtn.title = 'Edit SFX pad (click a pad to remove its sound)';
        }
        sfxPad.forEach((_, i) => applyPadStyle(i));
    }

    // ── SFX/Ambience section toggle ───────────────────────────────────────────
    function toggleSfxSection() {
        // Exit edit mode when collapsing section
        if (isSfxEditMode && isSfxSectionExpanded) toggleSfxEditMode();
        isSfxSectionExpanded = !isSfxSectionExpanded;
        if (isSfxSectionExpanded) {
            sectionContent.style.display = 'flex';
            sectionLabel.innerText = sectionLabel._originalInnerText ?? sectionLabel.innerText;
            sfxChevronBtn.innerText = '−';
            sfxChevronBtn.title = 'Collapse Ambience & SFX';
        } else {
            sectionContent.style.display = 'none';
            sectionLabel._originalInnerText = sectionLabel.innerText;
            sectionLabel.innerText = '';
            sfxChevronBtn.innerText = '+';
            sfxChevronBtn.title = 'Expand Ambience & SFX';
        }
    }

    // Click handler for Drive file link integration
    document.addEventListener('click', function(e) {
        let target = e.target;
        while (target && target.tagName !== 'A' && !target.classList?.contains('docs-richlink')) {
            target = target.parentNode;
        }
        if (!target) return;

        let url = target.getAttribute('data-url') || target.href;
        if (!url) return;

        const driveMatch = url.match(/\/file\/d\/([^\/? \n]+)/) || url.match(/id=([^& \n]+)/);
        if (!driveMatch || !driveMatch[1]) return;

        e.preventDefault();
        e.stopPropagation();

        const fileId = driveMatch[1];
        const trackName = (target.innerText || "Google Drive Track").replace(/\n/g, ' ').trim();

        // Ensure panel is visible and expanded
        if (isCollapsed) toggleCollapse();
        container.style.display = 'flex';

        // ── Alt+click → load into Ambience slot ──────────────────────────────
        if (e.altKey) {
            ambienceSlot.id = fileId;
            ambienceSlot.name = trackName;
            ambienceSlot.audio.src = buildStreamUrl(fileId);
            ambienceSlot.audio.preload = 'auto';
            ambienceSlot.audio.loop = true;
            if (!isSfxSectionExpanded) toggleSfxSection();
            ambienceSlot.audio.play();
            refreshAmbienceUI();
            return;
        }

        // ── Ctrl+click → assign to armed SFX pad ─────────────────────────────
        if (e.ctrlKey) {
            if (armedPadIndex !== null) {
                const idx = armedPadIndex;
                assignSfxPad(idx, fileId, trackName);
                armedPadIndex = null;
                applyPadStyle(idx);
            } else {
                // Flash the SFX pad header to signal no pad is armed
                sfxPadLabel.style.color = '#ea4335';
                setTimeout(() => { sfxPadLabel.style.color = '#5f6368'; }, 500);
                if (!isSfxSectionExpanded) toggleSfxSection();
            }
            return;
        }

        // ── Name-based SFX auto-route (name starts with "sfx" or "[sfx]") ────
        if (/^(\[sfx\]|sfx)/i.test(trackName)) {
            const targetPadIdx = armedPadIndex !== null
                ? armedPadIndex
                : sfxPad.findIndex(p => p.id === null);
            if (targetPadIdx !== -1) {
                const prevArmed = armedPadIndex;
                assignSfxPad(targetPadIdx, fileId, trackName);
                armedPadIndex = null;
                applyPadStyle(targetPadIdx);
                if (prevArmed !== null && prevArmed !== targetPadIdx) applyPadStyle(prevArmed);
            } else {
                // All pads full — flash SFX pad header
                sfxPadLabel.style.color = '#ea4335';
                setTimeout(() => { sfxPadLabel.style.color = '#5f6368'; }, 500);
            }
            if (!isSfxSectionExpanded) toggleSfxSection();
            return;
        }

        // ── Name-based Ambience auto-route (starts with "ambience", "[ambience]", or "[amb]") ──
        if (/^(\[ambience\]|\[amb\]|ambience)/i.test(trackName)) {
            ambienceSlot.id = fileId;
            ambienceSlot.name = trackName;
            ambienceSlot.audio.src = buildStreamUrl(fileId);
            ambienceSlot.audio.preload = 'auto';
            ambienceSlot.audio.loop = true;
            if (!isSfxSectionExpanded) toggleSfxSection();
            ambienceSlot.audio.play();
            refreshAmbienceUI();
            return;
        }

        // ── Default → A/B slot selection (unchanged logic) ───────────────────
        let targetKey = 'A';

        if (slots.A.id === null) {
            targetKey = 'A';
        } else if (slots.B.id === null) {
            targetKey = 'B';
        } else {
            targetKey = (activeSlotKey === 'A' && !slots.A.audio.paused) ? 'B' : 'A';
        }

        const selectedSlot = slots[targetKey];
        selectedSlot.id = fileId;
        selectedSlot.name = trackName;
        selectedSlot.audio.src = buildStreamUrl(fileId);
        selectedSlot.audio.preload = 'auto';
        selectedSlot.audio.loop = loopCheckbox.checked;

        if (activeSlotKey === null) {
            activeSlotKey = targetKey;
            selectedSlot.audio.play();
        }

        refreshUI();
    }, true);
})();
