/*
 * Copyright (c) 2025 [lorenzetti giuseppe www.pianohitech.com]
 * Distributed under the MIT License. See LICENSE.md for details.
 *
 * Pentagramma MIDI Scorrevole (Player)
 * Descrizione: Visualizzatore MIDI interattivo con VexFlow e Tone.js
 * Autore: [lorenzetti giuseppe]
 * Versione: 1.0 (o la versione attuale)
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Global Setup ---
    const VF = Vex.Flow;
    const scoreContainer = document.getElementById('score-container');
    const canvas = document.getElementById('score-canvas');
    const midiStatusDiv = document.getElementById('midi-status');
    const lastNoteDiv = document.getElementById('last-note');
    const fileInput = document.getElementById('midi-file-input');
    const fileStatusSpan = document.getElementById('file-status');
    const playbackTempoDiv = document.getElementById('playback-tempo');
    const speedSlider = document.getElementById('speed-slider');
    const bpmDisplay = document.getElementById('bpm-display');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const stopBtn = document.getElementById('stop-btn');
    const accuracyDisplay = document.getElementById('accuracy-display');
    const removalZoneX = 100; // Reference

    // Check essential elements
    if (!scoreContainer || !canvas || !midiStatusDiv || !lastNoteDiv || !fileInput || !fileStatusSpan || !playbackTempoDiv || !speedSlider || !bpmDisplay || !playBtn || !pauseBtn || !stopBtn || !accuracyDisplay) {
        console.error("FATAL Error: Essential HTML elements missing. Check IDs."); alert("Critical error: Cannot find necessary HTML elements."); return;
    }
    if (typeof Vex === 'undefined' || typeof Vex.Flow === 'undefined') { console.error("FATAL Error: VexFlow not loaded."); alert("Critical error: VexFlow library not found."); return; }
    if (typeof Midi === 'undefined') { console.error("FATAL Error: @tonejs/midi not loaded."); alert("Critical error: @tonejs/midi library not found."); return; }
    if (typeof Tone === 'undefined') { console.error("FATAL Error: Tone.js not loaded."); alert("Critical error: Tone.js library not found."); return; }

    // --- VexFlow Setup (Canvas) ---
    const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
    const context = renderer.getContext();
    let containerWidth = scoreContainer.clientWidth;
    let containerHeight = scoreContainer.clientHeight;
    renderer.resize(containerWidth, containerHeight);

    window.addEventListener('resize', () => {
        containerWidth = scoreContainer.clientWidth; containerHeight = scoreContainer.clientHeight;
        renderer.resize(containerWidth, containerHeight);
        staveWidth = containerWidth > 60 ? containerWidth - 40 : containerWidth;
        console.log("Canvas resized:", containerWidth, containerHeight);
        if (isPaused && !isDragging) { requestAnimationFrame(draw); }
    });

    // --- Tone.js Setup (Optional Audio) ---
    let synth = null; let toneJsStarted = false;
    async function initializeTone() {
        if (toneJsStarted) return;
        try {
            await Tone.start();
            console.log("Tone.js AudioContext started by user interaction.");
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 } }).toDestination();
            toneJsStarted = true; console.log("Tone.js synth created (Audio playback enabled)."); updateButtonStates();
        } catch (e) { console.error("Error starting Tone.js or creating synth:", e); alert("Could not start audio context or synth."); }
    }

    // --- Playback and Animation State Variables ---
    let animationId = null; let activeNotes = []; let noteCounter = 0;
    let parsedMidiData = null; let allNotesSorted = []; let fileOriginalBPM = 120;
    let currentVisualBPM = 100;
    let scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
    let isPlaying = false; let isPaused = false;
    let nextNoteIndexToAdd = 0;
    let highlightElement = null;
    const noteVisualSpacing = 120;
    const chordTimeTolerance = 0.05;
    // Accuracy Variables
    let notesAttempted = 0;
    let notesHitCorrectly = 0;
    let lastLeftmostNoteId = null;
    // Manual Scroll Variables
    let manualScrollOffset = 0; let isDragging = false; let lastDragX = 0;
    // Stave Variables
    let staveWidth = containerWidth > 60 ? containerWidth - 40 : containerWidth;
    const staveX = 20; const trebleY = 40; const bassY = 140;

    // --- Variabili Globali per Armatura Chiave ---
    let currentKeySignature = "C major"; // Default
    let keySignatureAccidentals = {}; // Mappa: { 'B': 'b', 'E': 'b', 'A': 'b' } per Eb major

    // --- Utility Functions ---

    // Mappa per convertire nomi note in indice (0=C, 1=C#, ..., 11=B)
    const noteNameToIndex = {
        'c': 0, 'c#': 1, 'db': 1, 'd': 2, 'd#': 3, 'eb': 3, 'e': 4, 'fb': 4, 'e#': 5,
        'f': 5, 'f#': 6, 'gb': 6, 'g': 7, 'g#': 8, 'ab': 8, 'a': 9, 'a#': 10, 'bb': 10,
        'b': 11, 'cb': 11, 'b#': 0
    };
    // Mappa inversa (solo naturali)
    const indexToNaturalName = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

    function midiNumberToNoteName(midiNumber, keyAccidentals = {}) {
        // keyAccidentals: Oggetto come { 'B': 'b', 'E': 'b', 'A': 'b' }
        if (midiNumber < 0 || midiNumber > 127) return null;
        const octave = Math.floor(midiNumber / 12) - 1;
        const noteIndex = midiNumber % 12; // 0-11

        // 1. Trova il nome della nota naturale corrispondente
        const naturalName = indexToNaturalName[noteIndex]; // Es. 'C', 'D', 'B'

        // 2. Controlla se l'armatura altera questa nota naturale
        const keyAccidental = keyAccidentals[naturalName]; // Es. 'b' per 'B' in Eb major, undefined altrimenti

        // 3. Determina il nome finale
        let finalName;
        if (keyAccidental) {
            // L'armatura altera questa nota. Costruisci il nome con l'alterazione dell'armatura.
            // Verifica che l'indice MIDI corrisponda all'alterazione suggerita dall'armatura.
            const expectedIndex = noteNameToIndex[naturalName.toLowerCase() + keyAccidental];
            if (noteIndex === expectedIndex) {
                finalName = naturalName.toLowerCase() + keyAccidental; // Es. "bb", "f#"
            }
        }

        // 4. Se l'armatura non ha determinato il nome, usa la convenzione standard (C#, Eb, F#, Ab, Bb)
        if (!finalName) {
            const commonNames = ["c", "c#", "d", "eb", "e", "f", "f#", "g", "ab", "a", "bb", "b"];
            finalName = commonNames[noteIndex];
        }

        return `${finalName}/${octave}`;
    }


    function mapSecondsToVexDuration(seconds, bpm) {
        if (seconds <= 0 || bpm <= 0) return 'q'; const qDur = 60.0 / bpm; const ratio = seconds / qDur;
        if (ratio >= 3.9) return 'w'; if (ratio >= 1.9) return 'h'; if (ratio >= 1.4) return 'hd';
        if (ratio >= 0.9) return 'q'; if (ratio >= 0.65) return 'qd'; if (ratio >= 0.45) return '8';
        if (ratio >= 0.30) return '8d'; if (ratio >= 0.22) return '16'; return '32';
    }

    function calculateScrollPixelsPerFrame(bpm) {
        // --- VALORI DI VELOCITÀ AUMENTATI ---
        // Aumentiamo i pixel minimi e massimi scrollati per frame (PPF)
        // Modifica ulteriormente questi valori se è ancora troppo lento o diventa troppo veloce.
        const minPPF = 1.0; // Precedentemente 0.5 - Velocità minima leggermente più alta
        const maxPPF = 10.0; // Precedentemente 4.0 - Velocità massima significativamente più alta
        // --- FINE VALORI DI VELOCITÀ AUMENTATI ---

        const minBPM = 20;  // L'impostazione BPM più bassa sullo slider (o minimo logico)
        const maxBPM = 300; // L'impostazione BPM più alta sullo slider (o massimo logico)
                            // IMPORTANTE: Assicurati che il tuo slider HTML (<input id="speed-slider">)
                            // abbia un attributo 'max' che corrisponda circa a questo (es. max="300")
                            // se vuoi che lo slider possa raggiungere la velocità visuale massima.

        if (bpm <= minBPM) return minPPF;
        if (bpm >= maxBPM) return maxPPF;

        // Interpolazione lineare: Mappa l'intervallo di BPM all'intervallo di PPF
        const bpmRange = maxBPM - minBPM; // Intervallo dei BPM
        const ppfRange = maxPPF - minPPF; // Intervallo dei Pixel Per Frame
        // Normalizza il BPM corrente all'interno del suo intervallo (un valore tra 0 e 1)
        const normalizedBpm = (bpmRange === 0) ? 0 : (bpm - minBPM) / bpmRange;

        // Calcola i pixel per frame corrispondenti usando il BPM normalizzato e l'intervallo PPF
        return minPPF + normalizedBpm * ppfRange;
    }

    // --- File Loading ---
    fileInput.addEventListener('change', handleFileSelect);
    function handleFileSelect(event) {
        const file = event.target.files[0]; if (!file) { fileStatusSpan.textContent = "No file selected."; return; }
        fileStatusSpan.textContent = `Loading: ${file.name}...`; stopAnimation();
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                parsedMidiData = new Midi(e.target.result); console.log("MIDI Parsed:", parsedMidiData);
                fileStatusSpan.textContent = `Loaded: ${file.name}`;
                // Processa MIDI e armatura PRIMA di resettare l'animazione
                processMidiDataAndScheduleAudio();
                currentVisualBPM = fileOriginalBPM; speedSlider.value = currentVisualBPM;
                bpmDisplay.textContent = `${Math.round(currentVisualBPM)} BPM`;
                scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
                updateButtonStates();
                resetAnimation(); // Ora resetAnimation può usare l'armatura
            } catch (error) { console.error("Error parsing MIDI:", error); alert(`Error reading MIDI file "${file.name}".`); fileStatusSpan.textContent = "Load Error."; resetAnimation(); }
        };
        reader.onerror = function(e) { console.error("File read error:", e); alert("Could not read file."); fileStatusSpan.textContent = "File Read Error."; resetAnimation(); };
        reader.readAsArrayBuffer(file);
    }

    // --- MIDI Data Processing & Audio Scheduling (Optional) ---
    function processMidiDataAndScheduleAudio() {
        if (!parsedMidiData) return; allNotesSorted = [];
        fileOriginalBPM = parsedMidiData.header.tempos[0]?.bpm || 120;
        playbackTempoDiv.textContent = `File Tempo: ${Math.round(fileOriginalBPM)} BPM`;

        // --- Leggi e processa l'armatura di chiave ---
        currentKeySignature = "C major"; // Default
        keySignatureAccidentals = {}; // Reset
        if (parsedMidiData.header.keySignatures.length > 0) {
            const ks = parsedMidiData.header.keySignatures[0];
            // Tenta di ottenere la tonalità completa (es. "Eb major")
            let keyName = ks.key;
            if (keyName) {
                 currentKeySignature = keyName + (ks.scale === "major" ? " major" : " minor");
                 console.log("Detected Key Signature:", currentKeySignature);

                 // Prova a usare VexFlow per ottenere le alterazioni specifiche per quella tonalità
                 const keySpec = VF.keySignature.keySpecs[keyName + (ks.scale === "major" ? "" : "m")];
                 if (keySpec && keySpec.accidental && keySpec.note) {
                     keySpec.accidental.forEach((acc, index) => {
                         const noteName = keySpec.note[index]; // Nota naturale (C, D, E...)
                         keySignatureAccidentals[noteName] = acc; // 'b' o '#'
                     });
                     console.log("Key Signature Accidentals Map (VexFlow):", keySignatureAccidentals);
                 } else {
                     console.warn("Could not find VexFlow keySpec for:", keyName + (ks.scale === "major" ? "" : "m"), ". Using fallback.");
                     // Fallback manuale basato sul numero di alterazioni (meno preciso per minori)
                     const fifths = VF.Music.sharpToFifth(keyName); // Numero di diesis/bemolle
                     const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
                     const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
                     if (fifths > 0) {
                         for (let i = 0; i < fifths; i++) keySignatureAccidentals[sharps[i]] = '#';
                     } else if (fifths < 0) {
                         for (let i = 0; i < -fifths; i++) keySignatureAccidentals[flats[i]] = 'b';
                     }
                     console.log("Key Signature Accidentals Map (Fallback):", keySignatureAccidentals);
                 }
            } else {
                 console.log("Key Signature found in MIDI but key name is missing, assuming C major.");
                 currentKeySignature = "C major";
            }
        } else {
            console.log("No Key Signature found in MIDI, assuming C major.");
            currentKeySignature = "C major";
        }
        // --- Fine gestione armatura ---


        // Optional Audio Scheduling
        if (synth && toneJsStarted) {
             Tone.Transport.bpm.value = fileOriginalBPM;
             Tone.Transport.cancel(0);
             let scheduledCount = 0;
             parsedMidiData.tracks.forEach((track) => {
                 track.notes.forEach(note => {
                     // Usa il nome influenzato dall'armatura anche per l'audio? Potrebbe essere più corretto.
                     const audioNoteName = midiNumberToNoteName(note.midi, keySignatureAccidentals) || note.name;
                     if (audioNoteName) {
                         Tone.Transport.scheduleOnce(time => {
                              if (synth) synth.triggerAttackRelease(audioNoteName, note.duration, time, note.velocity);
                         }, note.time);
                         scheduledCount++;
                     }
                 });
             });
             console.log(`Scheduled ${scheduledCount} notes on Tone.Transport.`);
        } else { /* ... log skip reasons ... */ }

        // Process notes for VISUAL display
        parsedMidiData.tracks.forEach((track) => {
            track.notes.forEach(note => {
                allNotesSorted.push({ midi: note.midi, originalTime: note.time, originalDuration: note.duration, velocity: note.velocity });
            });
        });
        allNotesSorted.sort((a, b) => a.originalTime - b.originalTime);
        console.log(`Extracted ${allNotesSorted.length} notes for visual display.`);
    }

    // --- Animation/Audio Controls ---
    function resetAnimation() {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        if (typeof Tone !== 'undefined' && Tone.Transport) { Tone.Transport.stop(); Tone.Transport.cancel(0); Tone.Transport.position = 0; }
        isPlaying = false; isPaused = false; activeNotes = []; nextNoteIndexToAdd = 0;
        if (highlightElement) highlightElement.remove(); highlightElement = null;
        notesAttempted = 0; notesHitCorrectly = 0; lastLeftmostNoteId = null; updateAccuracyDisplay();
        removeManualScrollListeners(); manualScrollOffset = 0; isDragging = false;
        playbackTempoDiv.textContent = parsedMidiData ? `File Tempo: ${Math.round(fileOriginalBPM)} BPM` : "File Tempo: N/A";
        context.clearRect(0, 0, canvas.width, canvas.height);
        try {
            const trebleStave = new VF.Stave(staveX, trebleY, staveWidth).addClef("treble");
            const bassStave = new VF.Stave(staveX, bassY, staveWidth).addClef("bass");
            // Opzionale: Disegnare l'armatura di chiave all'inizio?
            // if (currentKeySignature && VF.keySignature.keySpecs[currentKeySignature.split(' ')[0]]) {
            //     trebleStave.addKeySignature(currentKeySignature.split(' ')[0]);
            //     bassStave.addKeySignature(currentKeySignature.split(' ')[0]);
            // }
            trebleStave.setContext(context).draw(); bassStave.setContext(context).draw();
        } catch(e) { console.error("Error drawing initial staves:", e); }
        updateButtonStates(); console.log("Animation reset.");
    }

    async function playAnimation() {
        if (isPlaying || !parsedMidiData || allNotesSorted.length === 0) return;
        if (isPaused) {
            console.log(`Resuming visual animation.`);
            if (manualScrollOffset !== 0) {
                console.log(`Applying manual offset (${manualScrollOffset.toFixed(1)}px)`);
                activeNotes.forEach(noteInfo => { noteInfo.x += manualScrollOffset; });
            }
            manualScrollOffset = 0; isDragging = false; removeManualScrollListeners();
            if (typeof Tone !== 'undefined' && Tone.Transport && synth && toneJsStarted) {
                Tone.Transport.start(); console.log(`Resuming audio from ${Tone.Transport.seconds.toFixed(2)}s`);
            }
        } else {
            console.log("Starting visual animation from beginning.");
            removeManualScrollListeners(); manualScrollOffset = 0; isDragging = false;
            nextNoteIndexToAdd = 0; activeNotes = [];
            notesAttempted = 0; notesHitCorrectly = 0; lastLeftmostNoteId = null; updateAccuracyDisplay();
            if (typeof Tone !== 'undefined' && Tone.Transport && synth && toneJsStarted) {
                Tone.Transport.position = 0; Tone.Transport.start(); console.log("Starting audio from beginning.");
            } else { console.log("Starting visuals only (audio not ready or not used).") }
        }
        isPaused = false; isPlaying = true; updateButtonStates();
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(draw);
    }

    function pauseAnimation() {
        if (!isPlaying) { console.log("Pause ignored."); return; }
        if (typeof Tone !== 'undefined' && Tone.Transport) { Tone.Transport.pause(); console.log(`Audio paused at ${Tone.Transport.seconds.toFixed(2)}s`); }
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        isPlaying = false; isPaused = true;
        manualScrollOffset = 0; isDragging = false; addManualScrollListeners();
        updateButtonStates(); console.log(`Visual animation paused.`);
    }

    function stopAnimation() {
        removeManualScrollListeners(); manualScrollOffset = 0; isDragging = false;
        resetAnimation();
    }

    function updateButtonStates() {
        const hasMidi = !!parsedMidiData; const canPlay = hasMidi;
        playBtn.disabled = isPlaying || !canPlay;
        pauseBtn.disabled = !isPlaying || isPaused || !hasMidi;
        stopBtn.disabled = (!isPlaying && !isPaused) || !hasMidi;
    }

    function addManualScrollListeners() {
        if (scoreContainer && isPaused) { scoreContainer.addEventListener('mousedown', handleMouseDown); scoreContainer.style.cursor = 'grab'; console.log("Manual scroll listeners ADDED."); }
    }
    function removeManualScrollListeners() {
        if (scoreContainer) { scoreContainer.removeEventListener('mousedown', handleMouseDown); scoreContainer.style.cursor = 'default'; }
        document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); isDragging = false;
    }
    function handleMouseDown(event) {
        if (!isPaused) { removeManualScrollListeners(); return; } isDragging = true; lastDragX = event.clientX; scoreContainer.style.cursor = 'grabbing'; event.preventDefault();
        document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); console.log("Drag Start");
    }
    function handleMouseMove(event) {
        if (!isDragging || !isPaused) { removeManualScrollListeners(); return; } const currentX = event.clientX; const deltaX = currentX - lastDragX; manualScrollOffset += deltaX; lastDragX = currentX;
        if (!animationId) { animationId = requestAnimationFrame(draw); }
    }
    function handleMouseUp(event) {
        if (!isDragging) return; isDragging = false; if (scoreContainer) scoreContainer.style.cursor = 'grab'; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp);
        console.log("Drag End, final offset for this pause:", manualScrollOffset.toFixed(1));
        if (animationId && isPaused && !isDragging) { cancelAnimationFrame(animationId); animationId = null; } if(isPaused) requestAnimationFrame(draw);
    }


    // --- Note Group Creation for Animation ---
    function createNoteGroupInfo(startIndex, initialX) {
        if (startIndex >= allNotesSorted.length) return null;
        const firstNoteData = allNotesSorted[startIndex];
        const group = [firstNoteData]; let lastNoteTime = firstNoteData.originalTime;
        let maxDuration = firstNoteData.originalDuration; let lookaheadIndex = startIndex + 1;

        while (lookaheadIndex < allNotesSorted.length && (allNotesSorted[lookaheadIndex].originalTime - lastNoteTime) < chordTimeTolerance) {
            const nextNote = allNotesSorted[lookaheadIndex]; group.push(nextNote);
            maxDuration = Math.max(maxDuration, nextNote.originalDuration); lastNoteTime = nextNote.originalTime; lookaheadIndex++;
        }

        const vexDuration = mapSecondsToVexDuration(maxDuration, fileOriginalBPM);
        noteCounter++;
        const vexKeys = { treble: [], bass: [] };
        const midiNoteNamesForCheck = { treble: [], bass: [] };
        let groupIsSharp = false; // Flag se il *nome generato* contiene '#'
        let groupIsFlat = false;  // Flag se il *nome generato* contiene 'b' (come alterazione)

        group.forEach(noteData => {
            // *** Passa l'armatura a midiNumberToNoteName ***
            const vexKey = midiNumberToNoteName(noteData.midi, keySignatureAccidentals);
            if (vexKey) {
                const isTreble = noteData.midi >= 60;
                const targetArrayVex = isTreble ? vexKeys.treble : vexKeys.bass;
                const targetArrayCheck = isTreble ? midiNoteNamesForCheck.treble : midiNoteNamesForCheck.bass;
                if (!targetArrayVex.includes(vexKey)) targetArrayVex.push(vexKey);
                if (!targetArrayCheck.includes(vexKey)) targetArrayCheck.push(vexKey);

                // Determina colore/simbolo basato sul nome risultante (che ora considera l'armatura)
                if (vexKey.includes('#')) {
                    groupIsSharp = true;
                }
                if (vexKey.match(/[a-g]b\/\d+/i)) { // Cerca veri bemolle nel nome generato
                    groupIsFlat = true;
                }
            } else { console.warn("Could not determine Vex key for MIDI:", noteData.midi); }
        });

        const sortNotes = (a, b) => {
             try { const noteA = new VF.Note({ keys: [a], duration: 'q' }); const noteB = new VF.Note({ keys: [b], duration: 'q' }); return noteA.getKeyProps()[0].int_value - noteB.getKeyProps()[0].int_value; }
             catch (e) { console.warn("Sorting error:", a, b, e); return 0; }
        };
        vexKeys.treble.sort(sortNotes); vexKeys.bass.sort(sortNotes);

        // Crea elemento VexFlow, passando le flag basate sul nome (influenzato dall'armatura)
        const vexElement = createVexNoteElement({
            treble: vexKeys.treble, bass: vexKeys.bass, duration: vexDuration,
            isSharp: groupIsSharp,
            isFlat: groupIsFlat
        });

        if (!vexElement) { console.error(`Failed VexElement creation for group starting at index ${startIndex}`); return null; }

        // Estimate width
        let estimatedWidth = 30;
        try { if (vexElement.treble instanceof VF.StaveNote) { vexElement.treble.preFormat(); estimatedWidth = Math.max(estimatedWidth, vexElement.treble.getWidth()); } if (vexElement.bass instanceof VF.StaveNote) { vexElement.bass.preFormat(); estimatedWidth = Math.max(estimatedWidth, vexElement.bass.getWidth()); } }
        catch(e) { console.warn("Could not get width", e); estimatedWidth = Math.max(estimatedWidth, 50); }


        return {
            info: {
                id: noteCounter, vexElement: vexElement, notes: midiNoteNamesForCheck,
                originalStartTime: firstNoteData.originalTime, x: initialX, width: estimatedWidth + 10, isRemovable: false
            },
            notesConsumed: group.length
        };
    }


    // --- VexFlow Note Element Creation ---
    function createVexNoteElement(noteData) {
        // Prende le chiavi (ora influenzate dall'armatura) e le flag corrette
        if (!noteData || typeof noteData.duration !== 'string' || noteData.duration.trim() === '') { return null; }
        const { treble: trebleKeys, bass: bassKeys, duration, isSharp, isFlat } = noteData;
        let trebleVex, bassVex;

        try {
            trebleVex = (trebleKeys && trebleKeys.length > 0) ? new VF.StaveNote({ keys: trebleKeys, duration: duration, clef: 'treble', auto_stem: true }) : new VF.GhostNote({ duration: duration });
            bassVex = (bassKeys && bassKeys.length > 0) ? new VF.StaveNote({ keys: bassKeys, duration: duration, clef: 'bass', auto_stem: true }) : new VF.GhostNote({ duration: duration });

            // *** COLORING based on correct flags ***
            if (isSharp) { // Nome generato conteneva '#' -> GREEN
                if (trebleVex.setStyle) trebleVex.setStyle({ fillStyle: '#008000', strokeStyle: '#008000' });
                if (bassVex.setStyle) bassVex.setStyle({ fillStyle: '#008000', strokeStyle: '#008000' });
            } else if (isFlat) { // Nome generato era un vero bemolle -> BLUE
                if (trebleVex.setStyle) trebleVex.setStyle({ fillStyle: '#0000FF', strokeStyle: '#0000FF' });
                if (bassVex.setStyle) bassVex.setStyle({ fillStyle: '#0000FF', strokeStyle: '#0000FF' });
            }
            // Note naturali (incluso B/E se non alterate da armatura) restano nere

            // *** ADD MODIFIER SYMBOL based on correct flags ***
            // Aggiungiamo il simbolo solo se necessario (cioè se la nota *non* è già alterata dall'armatura)
            // Questa logica è complessa. Per ora, aggiungiamo il simbolo se la flag è true E la chiave lo contiene.
            [trebleVex, bassVex].forEach(vexNote => {
                if (vexNote instanceof VF.StaveNote) {
                    if (isSharp) {
                        vexNote.getKeys().forEach((key, index) => {
                            // Aggiungi # solo se la nota naturale NON è già # nell'armatura
                            const natural = indexToNaturalName[noteNameToIndex[key.split('/')[0]]];
                            if (key.includes('#') && keySignatureAccidentals[natural] !== '#') {
                                vexNote.addModifier(new VF.Accidental('#'), index);
                            }
                        });
                    }
                    if (isFlat) {
                         vexNote.getKeys().forEach((key, index) => {
                            // Aggiungi b solo se la nota naturale NON è già b nell'armatura
                            const natural = indexToNaturalName[noteNameToIndex[key.split('/')[0]]];
                            if (key.match(/[a-g]b\/\d+/i) && keySignatureAccidentals[natural] !== 'b') {
                                vexNote.addModifier(new VF.Accidental('b'), index);
                            }
                         });
                    }
                    // Aggiungi bequadro se la nota è naturale MA l'armatura la altererebbe
                    if (!isSharp && !isFlat) {
                        vexNote.getKeys().forEach((key, index) => {
                            const natural = indexToNaturalName[noteNameToIndex[key.split('/')[0]]];
                            if (keySignatureAccidentals[natural]) { // Se l'armatura altera questa nota naturale
                                vexNote.addModifier(new VF.Accidental('n'), index);
                            }
                        });
                    }
                }
            });

            if (trebleVex && trebleVex.setContext) trebleVex.setContext(context);
            if (bassVex && bassVex.setContext) bassVex.setContext(context);

            return { treble: trebleVex, bass: bassVex };
        } catch (error) {
             console.error(`VexFlow Error in createVexNoteElement:`, error); return null;
        }
    }


    // --- Main Draw/Animation Loop ---
    function draw(timestamp) {
        // 1. Clear
        context.clearRect(0, 0, canvas.width, canvas.height);
        // 2. Draw Staves
        const trebleStave = new VF.Stave(staveX, trebleY, staveWidth).addClef("treble");
        const bassStave = new VF.Stave(staveX, bassY, staveWidth).addClef("bass");
        // Opzionale: Disegna armatura all'inizio
        // if (currentKeySignature && VF.keySignature.keySpecs[currentKeySignature.split(' ')[0]]) {
        //     const keyForVex = currentKeySignature.split(' ')[0];
        //     trebleStave.addKeySignature(keyForVex);
        //     bassStave.addKeySignature(keyForVex);
        // }
        trebleStave.setContext(context).draw(); bassStave.setContext(context).draw();

        // 3. Add NEW notes if playing
        if (isPlaying) {
            const lastNote = activeNotes[activeNotes.length - 1];
            if (nextNoteIndexToAdd < allNotesSorted.length && (!lastNote || lastNote.x + lastNote.width < containerWidth - noteVisualSpacing)) {
                const initialX = containerWidth; const groupResult = createNoteGroupInfo(nextNoteIndexToAdd, initialX);
                if (groupResult && groupResult.info) { activeNotes.push(groupResult.info); nextNoteIndexToAdd += groupResult.notesConsumed; }
                else if (groupResult === null && nextNoteIndexToAdd < allNotesSorted.length) {
                    console.warn(`Skipping potentially problematic MIDI note(s) at index ${nextNoteIndexToAdd}.`);
                    let lookaheadIndex = nextNoteIndexToAdd + 1; const firstTime = allNotesSorted[nextNoteIndexToAdd].originalTime;
                    while (lookaheadIndex < allNotesSorted.length && (allNotesSorted[lookaheadIndex].originalTime - firstTime) < chordTimeTolerance) { lookaheadIndex++; }
                    nextNoteIndexToAdd = lookaheadIndex;
                }
            }
        }
        // 4. Update Positions, Draw Visible Notes, Find Leftmost
        let currentLeftmostNote = null; let minVisualX = Infinity; const notesToKeep = []; const tickContext = new VF.TickContext();
        activeNotes.forEach(noteInfo => {
            let visualX = noteInfo.x;
            if (isPlaying) { noteInfo.x -= scrollPixelsPerFrame; visualX = noteInfo.x; }
            else if (isPaused && isDragging) { visualX = noteInfo.x + manualScrollOffset; }
            const shouldRemove = isPlaying && (noteInfo.x + noteInfo.width < -50);
            if (!shouldRemove) {
                if (isPlaying) notesToKeep.push(noteInfo);
                const isVisible = visualX < containerWidth + noteInfo.width && visualX + noteInfo.width > 0;
                if (isVisible) {
                    if (visualX < minVisualX) { minVisualX = visualX; currentLeftmostNote = noteInfo; }
                    try {
                        const trebleElement = noteInfo.vexElement.treble; const bassElement = noteInfo.vexElement.bass;
                        const trebleShift = visualX - trebleStave.getNoteStartX(); const bassShift = visualX - bassStave.getNoteStartX();
                        if (trebleElement && trebleElement.setStave && isFinite(trebleShift)) {
                            trebleElement.setStave(trebleStave); trebleElement.setXShift(trebleShift); trebleElement.setTickContext(tickContext);
                            if (!trebleElement.preFormatted) trebleElement.preFormat(); trebleElement.draw();
                        }
                        if (bassElement && bassElement.setStave && isFinite(bassShift)) {
                            bassElement.setStave(bassStave); bassElement.setXShift(bassShift); bassElement.setTickContext(tickContext);
                            if (!bassElement.preFormatted) bassElement.preFormat(); bassElement.draw();
                        }
                    } catch (drawError) { console.error(`--- Error Drawing Note ID ${noteInfo.id} ---`, drawError); console.error("Note State:", noteInfo); }
                }
            }
        });
        if (isPlaying) { activeNotes = notesToKeep; }
        // 5. Highlight Leftmost Note & Handle Accuracy Target
        if (highlightElement) highlightElement.remove(); highlightElement = null; activeNotes.forEach(note => note.isRemovable = false);
        if (currentLeftmostNote) {
            const highlightX = minVisualX;
            if (isPlaying) {
                 if (currentLeftmostNote.id !== lastLeftmostNoteId) { notesAttempted++; lastLeftmostNoteId = currentLeftmostNote.id; updateAccuracyDisplay(); }
                 const targetNoteInArray = activeNotes.find(n => n.id === currentLeftmostNote.id); if (targetNoteInArray) targetNoteInArray.isRemovable = true;
            }
            highlightElement = document.createElement('div'); highlightElement.className = 'highlight-active-note';
            const highlightY = trebleY - 15; const highlightHeight = (bassY + bassStave.getHeight()) - highlightY + 15;
            const highlightWidth = (currentLeftmostNote.width && isFinite(currentLeftmostNote.width) && currentLeftmostNote.width > 10) ? currentLeftmostNote.width : 30;
            if (isFinite(highlightX)) {
                highlightElement.style.left = `${highlightX - 5}px`; highlightElement.style.top = `${highlightY}px`;
                highlightElement.style.width = `${highlightWidth + 10}px`; highlightElement.style.height = `${highlightHeight}px`;
                scoreContainer.appendChild(highlightElement);
            } else { console.warn("Invalid position/width for highlight:", {id: currentLeftmostNote.id, x: highlightX, width: highlightWidth}); }
        } else { if (isPlaying && lastLeftmostNoteId !== null) { lastLeftmostNoteId = null; } }
        // 6. Request Next Frame
        if (isPlaying) { animationId = requestAnimationFrame(draw); }
        else if (isPaused && isDragging) { animationId = requestAnimationFrame(draw); }
        else { animationId = null; }
    }


    // --- MIDI Input Handling ---
    function handleMIDIMessage(event) {
        const command = event.data[0] >> 4; const noteNumber = event.data[1]; const velocity = event.data.length > 2 ? event.data[2] : 0;
        // Usa l'armatura anche per interpretare l'input MIDI per il matching? Forse più intuitivo.
        const noteNameVex = midiNumberToNoteName(noteNumber, keySignatureAccidentals);
        lastNoteDiv.textContent = `Last MIDI Note: ${noteNameVex || noteNumber} (Vel: ${velocity})`;
        if (command === 9 && velocity > 0 && noteNameVex) { removeMatchingLeftmostNote(noteNameVex); }
    }

    // --- Note Removal Logic (Accuracy Check) ---
    function removeMatchingLeftmostNote(playedNoteNameVex) {
        if (!isPlaying) { lastNoteDiv.textContent += ` (Ignored: Paused)`; return; }
        const targetNoteIndex = activeNotes.findIndex(note => note.isRemovable);
        if (targetNoteIndex === -1) { lastNoteDiv.textContent += ` (No active target)`; return; }
        const targetNoteInfo = activeNotes[targetNoteIndex]; let match = false;
        // Il matching ora usa i nomi influenzati dall'armatura
        if (targetNoteInfo.notes.treble.includes(playedNoteNameVex) || targetNoteInfo.notes.bass.includes(playedNoteNameVex)) { match = true; }
        if (match) {
            console.log(`CORRECT! Removing ID ${targetNoteInfo.id} (${playedNoteNameVex})`); lastNoteDiv.textContent += ` (CORRECT!)`;
            notesHitCorrectly++; updateAccuracyDisplay(); activeNotes.splice(targetNoteIndex, 1);
            if (highlightElement) { highlightElement.remove(); highlightElement = null; } lastLeftmostNoteId = null;
        } else {
            console.log(`WRONG! Played ${playedNoteNameVex} vs target ID ${targetNoteInfo.id} {T:[${targetNoteInfo.notes.treble.join(',') || 'none'}], B:[${targetNoteInfo.notes.bass.join(',') || 'none'}]}`);
            lastNoteDiv.textContent += ` (WRONG!)`; const errOverlay = document.createElement('div'); errOverlay.className = 'error-flash'; scoreContainer.appendChild(errOverlay);
            setTimeout(() => { if (errOverlay.parentNode) errOverlay.remove(); }, 200);
        }
    }

    // --- Accuracy Display Update ---
    function updateAccuracyDisplay() {
        if (!accuracyDisplay) return; let percentage = 0; if (notesAttempted > 0) { percentage = (notesHitCorrectly / notesAttempted) * 100; }
        accuracyDisplay.textContent = `Accuracy: ${percentage.toFixed(1)}% (${notesHitCorrectly}/${notesAttempted})`;
    }

    // --- Speed Control (Slider) ---
    speedSlider.addEventListener('input', (event) => {
        currentVisualBPM = parseInt(event.target.value, 10); bpmDisplay.textContent = `${currentVisualBPM} BPM`; scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
    });

    // --- Button Event Listeners ---
    playBtn.addEventListener('click', playAnimation);
    pauseBtn.addEventListener('click', pauseAnimation);
    stopBtn.addEventListener('click', stopAnimation);

    // --- MIDI Initialization ---
    function setupMIDI() {
        if (navigator.requestMIDIAccess) { midiStatusDiv.textContent = 'Requesting MIDI access...'; navigator.requestMIDIAccess({ sysex: false }).then(onMIDISuccess, onMIDIFailure).catch(err => { console.error("Initial MIDI access request error:", err); onMIDIFailure(`Error requesting access: ${err.message || err}`); }); }
        else { midiStatusDiv.textContent = 'Web MIDI API not supported.'; console.warn("Web MIDI API not supported!"); alert("Your browser does not support Web MIDI API."); }
    }
    function onMIDISuccess(midiAccess) {
        midiStatusDiv.textContent = 'MIDI Access OK. Listening...'; connectInputs(midiAccess); midiAccess.onstatechange = (event) => { console.log('MIDI state changed:', event.port.name, event.port.state); midiStatusDiv.textContent = 'MIDI state changed, reconnecting...'; connectInputs(midiAccess); };
    }
    function connectInputs(midiAccess) {
        const inputs = midiAccess.inputs; let foundDevice = false; console.log(`Found ${inputs.size} MIDI input(s).`); inputs.forEach(input => { input.onmidimessage = null; });
        inputs.forEach(input => { input.onmidimessage = handleMIDIMessage; console.log(`Listening for MIDI messages on: ${input.name} (ID: ${input.id}, State: ${input.state})`); if (!foundDevice) { midiStatusDiv.textContent = `Listening on: ${input.name}`; } else if (!midiStatusDiv.textContent.includes(' and others')) { midiStatusDiv.textContent += ' (and others)'; } foundDevice = true; });
        if (!foundDevice) { midiStatusDiv.textContent = 'No MIDI input devices connected.'; }
    }
    function onMIDIFailure(msg) {
        midiStatusDiv.textContent = `MIDI Access Error: ${msg}`; console.error(`MIDI Error: ${msg}`);
    }

    // --- Application Start ---
    setupMIDI();
    resetAnimation();
    console.log("Ready. Select a MIDI file to begin.");

    // Listener to start Tone.js ON USER INTERACTION (Make sure UNCOMMENTED)
    document.body.addEventListener('click', async () => {
         if (!toneJsStarted) {
             console.log("Attempting to start Tone.js on user interaction...");
             await initializeTone();
         }
    }, { once: true });

}); // End DOMContentLoaded