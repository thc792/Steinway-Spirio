document.addEventListener('DOMContentLoaded', () => {
    // --- Setup Globale ---
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
    const accuracyDisplay = document.getElementById('accuracy-display'); // !!! Nuovo elemento !!!
    const removalZoneX = 100;

    // Verifica elementi essenziali
    if (!scoreContainer || !canvas || !midiStatusDiv || !lastNoteDiv || !fileInput || !fileStatusSpan || !playbackTempoDiv || !speedSlider || !bpmDisplay || !playBtn || !pauseBtn || !stopBtn || !accuracyDisplay) { // !!! Aggiunto check accuracyDisplay !!!
        console.error("Errore FATALE: Elementi HTML essenziali mancanti. Controlla gli ID."); alert("Errore critico: Impossibile trovare elementi HTML necessari."); return;
    }
    if (typeof Vex === 'undefined' || typeof Vex.Flow === 'undefined') { console.error("Errore FATALE: VexFlow non caricato."); alert("Errore critico: Libreria VexFlow non trovata."); return; }
    if (typeof Midi === 'undefined') { console.error("Errore FATALE: @tonejs/midi non caricato."); alert("Errore critico: Libreria @tonejs/midi non trovata."); return; }
    if (typeof Tone === 'undefined') { console.error("Errore FATALE: Tone.js non caricato."); alert("Errore critico: Libreria Tone.js non trovata."); return; }

    // --- Setup VexFlow (Canvas) ---
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
    });

    // --- Setup Tone.js ---
    let synth = null; let toneJsStarted = false;
    async function initializeTone() { /* ... (invariato) ... */
        if (toneJsStarted) return;
        try {
            await Tone.start();
            synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 } }).toDestination();
            toneJsStarted = true; console.log("Tone.js avviato e synth creato."); updateButtonStates();
        } catch (e) { console.error("Errore durante l'avvio di Tone.js:", e); alert("Impossibile avviare l'audio."); }
    }

    // --- Variabili Stato Playback e Animazione ---
    let animationId = null; let activeNotes = []; let noteCounter = 0;
    let parsedMidiData = null; let allNotesSorted = []; let fileOriginalBPM = 120;
    let currentVisualBPM = 100;
    let scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
    let isPlaying = false; let isPaused = false;
    let playbackStartTime = 0; let pausedTime = 0;
    let nextNoteIndexToAdd = 0;
    let highlightElement = null;
    const noteVisualSpacing = 120;
    const chordTimeTolerance = 0.05;
    // !!! Variabili per la precisione !!!
    let notesAttempted = 0;
    let notesHitCorrectly = 0;
    let lastLeftmostNoteId = null; // Per tracciare la nota target

    // --- Variabili Pentagramma ---
    let staveWidth = containerWidth > 60 ? containerWidth - 40 : containerWidth;
    const staveX = 20; const trebleY = 40; const bassY = 140;

    // --- Funzioni Utilità ---
    function midiNumberToNoteName(midiNumber) { /* ... (invariato) ... */
        if (midiNumber < 0 || midiNumber > 127) return null;
        const noteNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
        const octave = Math.floor(midiNumber / 12) - 1; const noteIndex = midiNumber % 12;
        return `${noteNames[noteIndex]}/${octave}`;
    }
    function mapSecondsToVexDuration(seconds, bpm) { /* ... (invariato) ... */
        if (seconds <= 0 || bpm <= 0) return 'q';
        const quarterNoteDuration = 60.0 / bpm; const ratio = seconds / quarterNoteDuration;
        if (ratio >= 3.8) return 'w'; if (ratio >= 1.9) return 'h';
        if (ratio >= 1.4) return 'hd'; if (ratio >= 0.9) return 'q';
        if (ratio >= 0.65) return 'qd'; if (ratio >= 0.45) return '8';
        if (ratio >= 0.30) return '8d'; if (ratio >= 0.22) return '16';
        return '32';
    }
    function calculateScrollPixelsPerFrame(bpm) { /* ... (invariato) ... */
        const minPPF = 0.5; const maxPPF = 4.0;
        const minAllowedBPM = 20; const maxAllowedBPM = 200;
        if (bpm <= minAllowedBPM) return minPPF; if (bpm >= maxAllowedBPM) return maxPPF;
        const bpmRange = maxAllowedBPM - minAllowedBPM; const ppfRange = maxPPF - minPPF;
        const normalizedBpm = (bpmRange === 0) ? 0 : (bpm - minAllowedBPM) / bpmRange;
        return minPPF + normalizedBpm * ppfRange;
    }

    // --- Gestione Caricamento File ---
    fileInput.addEventListener('change', handleFileSelect);
    function handleFileSelect(event) { /* ... (invariato, chiama stopAnimation) ... */
        const file = event.target.files[0]; if (!file) { fileStatusSpan.textContent = "Nessun file selezionato."; return; }
        fileStatusSpan.textContent = `Caricamento: ${file.name}...`;
        stopAnimation();
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                if (!toneJsStarted) { await initializeTone(); if (!toneJsStarted) return; }
                parsedMidiData = new Midi(e.target.result); console.log("MIDI Parsato:", parsedMidiData);
                fileStatusSpan.textContent = `Caricato: ${file.name}`;
                processMidiDataAndScheduleAudio();
                currentVisualBPM = fileOriginalBPM; speedSlider.value = currentVisualBPM;
                bpmDisplay.textContent = `${Math.round(currentVisualBPM)} BPM`;
                scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
                updateButtonStates();
            } catch (error) { console.error("Errore parsing MIDI o scheduling:", error); alert(`Errore nel leggere o processare il file MIDI "${file.name}".`); fileStatusSpan.textContent = "Errore caricamento."; resetAnimation(); }
        };
        reader.onerror = function(e) { console.error("Errore lettura file:", e); alert("Impossibile leggere il file selezionato."); fileStatusSpan.textContent = "Errore lettura file."; resetAnimation(); };
        reader.readAsArrayBuffer(file);
    }

    // --- Processamento Dati MIDI e Scheduling Audio ---
    function processMidiDataAndScheduleAudio() { /* ... (invariato) ... */
        if (!parsedMidiData || !synth) return; allNotesSorted = [];
        fileOriginalBPM = parsedMidiData.header.tempos[0]?.bpm || 120;
        playbackTempoDiv.textContent = `Tempo File: ${Math.round(fileOriginalBPM)} BPM`;
        Tone.Transport.bpm.value = fileOriginalBPM; Tone.Transport.cancel(0);
        parsedMidiData.tracks.forEach((track, trackIndex) => {
            track.notes.forEach(note => {
                allNotesSorted.push({ midi: note.midi, name: note.name, originalTime: note.time, originalDuration: note.duration, velocity: note.velocity, trackIndex: trackIndex });
                Tone.Transport.scheduleOnce(time => { synth.triggerAttackRelease(note.name, note.duration, time, note.velocity); }, note.time);
            });
        });
        allNotesSorted.sort((a, b) => a.originalTime - b.originalTime);
        console.log(`Estratte ${allNotesSorted.length} note e schedulate su Tone.Transport.`);
    }

    // --- Controlli Animazione/Audio ---
    function resetAnimation() {
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        Tone.Transport.stop(); Tone.Transport.cancel(0); Tone.Transport.position = 0;
        isPlaying = false; isPaused = false; pausedTime = 0;
        activeNotes = [];
        nextNoteIndexToAdd = 0;
        // !!! Resetta conteggi precisione !!!
        notesAttempted = 0;
        notesHitCorrectly = 0;
        lastLeftmostNoteId = null;
        updateAccuracyDisplay(); // Aggiorna display a N/A o 0/0
        playbackTempoDiv.textContent = parsedMidiData ? `Tempo File: ${Math.round(fileOriginalBPM)} BPM` : "Tempo File: N/D";
        if (highlightElement) highlightElement.remove(); highlightElement = null;
        context.clearRect(0, 0, canvas.width, canvas.height);
        try {
            const trebleStave = new VF.Stave(staveX, trebleY, staveWidth).addClef("treble");
            const bassStave = new VF.Stave(staveX, bassY, staveWidth).addClef("bass");
            trebleStave.setContext(context).draw(); bassStave.setContext(context).draw();
        } catch(e) { console.error("Errore disegno righi iniziali:", e); }
        updateButtonStates();
        console.log("Animazione e Audio resettati/stoppati.");
    }

    async function playAnimation() { /* ... (invariato) ... */
        if (!toneJsStarted) { await initializeTone(); if (!toneJsStarted) return; }
        if (isPlaying || !parsedMidiData || allNotesSorted.length === 0) { console.log("Play ignorato."); return; }
        if (isPaused) {
             Tone.Transport.start(); console.log(`Ripresa animazione e audio da ${Tone.Transport.seconds.toFixed(2)}s`);
        } else {
            nextNoteIndexToAdd = 0; activeNotes = []; pausedTime = 0;
            // Resetta conteggi precisione all'avvio da zero
            notesAttempted = 0; notesHitCorrectly = 0; lastLeftmostNoteId = null; updateAccuracyDisplay();
            Tone.Transport.position = 0; Tone.Transport.start();
            console.log("Avvio animazione e audio da inizio.");
        }
        isPaused = false; isPlaying = true; updateButtonStates();
        if (animationId) cancelAnimationFrame(animationId);
        animationId = requestAnimationFrame(draw);
    }

    function pauseAnimation() { /* ... (invariato) ... */
        if (!isPlaying) { console.log("Pausa ignorata."); return; }
        Tone.Transport.pause();
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        isPlaying = false; isPaused = true; updateButtonStates();
        console.log(`Animazione e audio in pausa a ${Tone.Transport.seconds.toFixed(2)}s`);
    }

    function stopAnimation() { resetAnimation(); }

    // --- Aggiorna Stato Bottoni ---
    function updateButtonStates() { /* ... (invariato) ... */
        const hasMidi = !!parsedMidiData;
        playBtn.disabled = isPlaying || !hasMidi || !toneJsStarted;
        pauseBtn.disabled = !isPlaying || isPaused || !hasMidi;
        stopBtn.disabled = (!isPlaying && !isPaused) || !hasMidi;
    }

    // --- Helper per Creare VexFlow Notes ---
    function createVexNoteElement(noteData) { /* ... (invariato) ... */
        if (!noteData || !noteData.duration) { console.warn("Dati nota invalidi per createVexNoteElement:", noteData); return null; }
        const { treble: trebleKeys, bass: bassKeys, duration } = noteData;
        const isRest = false; let trebleVex, bassVex;
        try {
            trebleVex = (trebleKeys && trebleKeys.length > 0) ? new VF.StaveNote({ keys: trebleKeys, duration: duration, clef: 'treble', auto_stem: true }) : new VF.GhostNote({ duration: duration });
            bassVex = (bassKeys && bassKeys.length > 0) ? new VF.StaveNote({ keys: bassKeys, duration: duration, clef: 'bass', auto_stem: true }) : new VF.GhostNote({ duration: duration });
            /* Modificatori commentati */
            if (trebleVex) trebleVex.setContext(context);
            if (bassVex) bassVex.setContext(context);
            return { treble: trebleVex, bass: bassVex };
        } catch (error) { console.error(`Errore VexFlow in createVexNoteElement (Input: ${JSON.stringify(noteData)}):`, error); return null; }
    }

    // --- Creazione Oggetto Nota per Animazione (Gestisce Raggruppamento) ---
    function createNoteGroupInfo(startIndex, initialX) { /* ... (invariato) ... */
        if (startIndex >= allNotesSorted.length) return null;
        const firstNoteData = allNotesSorted[startIndex];
        const group = [firstNoteData]; let lastNoteTime = firstNoteData.originalTime;
        let maxDuration = firstNoteData.originalDuration;
        let lookaheadIndex = startIndex + 1;
        while (lookaheadIndex < allNotesSorted.length && (allNotesSorted[lookaheadIndex].originalTime - lastNoteTime) < chordTimeTolerance) {
            const nextNote = allNotesSorted[lookaheadIndex]; group.push(nextNote);
            maxDuration = Math.max(maxDuration, nextNote.originalDuration); lastNoteTime = nextNote.originalTime; lookaheadIndex++;
        }
        const vexDuration = mapSecondsToVexDuration(maxDuration, fileOriginalBPM);
        noteCounter++; const vexKeys = { treble: [], bass: [] }; const midiNoteNames = { treble: [], bass: [] };
        group.forEach(noteDataMidi => {
            let noteNameForVex = null;
            if (noteDataMidi.name) { const match = noteDataMidi.name.match(/([a-gA-G][#bB]*)(-?\d+)/); if (match && match.length === 3) { noteNameForVex = `${match[1].toLowerCase()}/${match[2]}`; } }
            if (!noteNameForVex) { noteNameForVex = midiNumberToNoteName(noteDataMidi.midi); }
            if (noteNameForVex) {
                const targetArrayVex = noteDataMidi.midi >= 60 ? vexKeys.treble : vexKeys.bass;
                const targetArrayMidi = noteDataMidi.midi >= 60 ? midiNoteNames.treble : midiNoteNames.bass;
                if (!targetArrayVex.includes(noteNameForVex)) targetArrayVex.push(noteNameForVex);
                if (!targetArrayMidi.includes(noteNameForVex)) targetArrayMidi.push(noteNameForVex);
            }
        });
        const sortNotes = (a, b) => { try { const noteA = new VF.Note({ keys: [a], duration: 'q' }); const noteB = new VF.Note({ keys: [b], duration: 'q' }); return noteA.getKeyProps()[0].int_value - noteB.getKeyProps()[0].int_value; } catch (e) { return 0; } };
        vexKeys.treble.sort(sortNotes); vexKeys.bass.sort(sortNotes);
        const vexElement = createVexNoteElement({ treble: vexKeys.treble, bass: vexKeys.bass, duration: vexDuration });
        if (!vexElement) return null;
        let estimatedWidth = 50 + Math.max(vexKeys.treble.length, vexKeys.bass.length) * 5;
        return { info: { id: noteCounter, vexElement: vexElement, notes: midiNoteNames, originalStartTime: firstNoteData.originalTime, x: initialX, width: estimatedWidth, isRemovable: false }, notesConsumed: group.length };
    }

    // --- Loop Principale Disegno/Animazione ---
    function draw(timestamp) {
        if (!isPlaying) { animationId = null; return; }

        // 1. Pulisci Canvas
        context.clearRect(0, 0, canvas.width, canvas.height);

        // 2. Disegna Pentagrammi
        const trebleStave = new VF.Stave(staveX, trebleY, staveWidth).addClef("treble");
        const bassStave = new VF.Stave(staveX, bassY, staveWidth).addClef("bass");
        trebleStave.setContext(context).draw();
        bassStave.setContext(context).draw();

        // 3. Aggiungi NUOVO GRUPPO di Note se c'è spazio visivo
        const lastNote = activeNotes[activeNotes.length - 1];
        if (nextNoteIndexToAdd < allNotesSorted.length &&
            (!lastNote || lastNote.x <= containerWidth - noteVisualSpacing))
        {
            const initialX = containerWidth;
            const groupResult = createNoteGroupInfo(nextNoteIndexToAdd, initialX);
            if (groupResult && groupResult.info) {
                activeNotes.push(groupResult.info);
                nextNoteIndexToAdd += groupResult.notesConsumed;
            } else {
                console.warn(`Saltata nota MIDI all'indice ${nextNoteIndexToAdd} a causa di errore creazione gruppo.`);
                nextNoteIndexToAdd++;
            }
        }

        // 4. Aggiorna Posizione, Disegna, Trova la più a sinistra
        let currentLeftmostNote = null; // Rinominato per chiarezza
        let minX = Infinity;
        const notesToKeep = [];
        const tickContext = new VF.TickContext();

        for (const noteInfo of activeNotes) {
            noteInfo.x -= scrollPixelsPerFrame; // Aggiorna posizione VISIVA
            noteInfo.isRemovable = false;
            if (noteInfo.x + noteInfo.width < -20) continue;

            if (noteInfo.x < containerWidth + noteInfo.width) {
                 notesToKeep.push(noteInfo);
                 // Trova la più a sinistra *che è visibile*
                 if (noteInfo.x < minX && noteInfo.x + noteInfo.width > 0) {
                     minX = noteInfo.x;
                     currentLeftmostNote = noteInfo; // Aggiorna la nota più a sinistra corrente
                 }
            }

            // Disegna solo se visibile
            if (noteInfo.x < containerWidth && noteInfo.x + noteInfo.width > 0) {
                let trebleShift = NaN; let bassShift = NaN;
                try {
                    if (isFinite(noteInfo.x)) {
                         trebleShift = noteInfo.x - trebleStave.getNoteStartX();
                         bassShift = noteInfo.x - bassStave.getNoteStartX();
                    }
                    if (noteInfo.vexElement.treble && isFinite(trebleShift)) {
                        noteInfo.vexElement.treble.setStave(trebleStave); noteInfo.vexElement.treble.setXShift(trebleShift);
                        noteInfo.vexElement.treble.setTickContext(tickContext); noteInfo.vexElement.treble.draw();
                    }
                    if (noteInfo.vexElement.bass && isFinite(bassShift)) {
                        noteInfo.vexElement.bass.setStave(bassStave); noteInfo.vexElement.bass.setXShift(bassShift);
                        noteInfo.vexElement.bass.setTickContext(tickContext); noteInfo.vexElement.bass.draw();
                    }
                } catch (drawError) {
                    console.error(`--- Errore Disegno Nota ID ${noteInfo.id} ---`);
                    console.error("Errore:", drawError); console.error("Stack Trace:", drawError.stack);
                    console.error("Stato Nota (parziale):", { id: noteInfo.id, notes: noteInfo.notes, x: noteInfo.x, width: noteInfo.width, isRemovable: noteInfo.isRemovable });
                    console.error(`Valori Calcolati: x=${noteInfo.x}, trebleShift=${trebleShift}, bassShift=${bassShift}`);
                    const indexToRemove = notesToKeep.findIndex(n => n.id === noteInfo.id);
                    if (indexToRemove > -1) { notesToKeep.splice(indexToRemove, 1); console.warn(`Nota ID ${noteInfo.id} rimossa a causa di errore disegno.`); }
                }
            }
        }
        activeNotes = notesToKeep;

        // 5. Marca e Evidenzia la più a sinistra & Aggiorna Conteggio Tentativi
        if (highlightElement) highlightElement.remove(); highlightElement = null;

        if (currentLeftmostNote) {
            // !!! LOGICA CONTEGGIO TENTATIVI !!!
            // Incrementa solo se la nota più a sinistra è cambiata rispetto all'ultimo frame
            if (currentLeftmostNote.id !== lastLeftmostNoteId) {
                notesAttempted++;
                lastLeftmostNoteId = currentLeftmostNote.id; // Aggiorna l'ID dell'ultima nota target
                updateAccuracyDisplay(); // Aggiorna il display
                console.log(`Nuova nota target: ID ${lastLeftmostNoteId}, Tentativi totali: ${notesAttempted}`);
            }
            // --- Fine Logica Conteggio ---

            currentLeftmostNote.isRemovable = true; // Marca per la logica di rimozione
            highlightElement = document.createElement('div'); highlightElement.className = 'highlight-active-note';
            const highlightY = trebleY - 15; const highlightHeight = (bassY + staveX + 15) - highlightY;
            if (isFinite(currentLeftmostNote.x) && isFinite(currentLeftmostNote.width)) {
                highlightElement.style.left = `${currentLeftmostNote.x - 5}px`; highlightElement.style.top = `${highlightY}px`;
                highlightElement.style.width = `${currentLeftmostNote.width + 10}px`; highlightElement.style.height = `${highlightHeight}px`;
                scoreContainer.appendChild(highlightElement);
            } else { console.warn("Posizione non valida per highlight nota:", currentLeftmostNote); }
        } else {
             // Se non c'è più una nota a sinistra (es. fine brano o rimossa), resetta l'ID
             if (lastLeftmostNoteId !== null) {
                 lastLeftmostNoteId = null;
             }
        }

        // 6. Richiedi Prossimo Frame
        if (isPlaying) {
            animationId = requestAnimationFrame(draw);
        }
    }

    // --- Gestione Input MIDI ---
    function handleMIDIMessage(event) { /* ... (invariato) ... */
        const command = event.data[0] >> 4; const noteNumber = event.data[1];
        const velocity = event.data.length > 2 ? event.data[2] : 0;
        const noteName = midiNumberToNoteName(noteNumber);
        lastNoteDiv.textContent = `Ultima Nota MIDI: ${noteName || noteNumber} (Vel: ${velocity})`;
        if (command === 9 && velocity > 0 && noteName && isPlaying) { removeMatchingLeftmostNote(noteName); }
    }

    // --- Funzione Rimozione Nota (Solo la più a sinistra) ---
    function removeMatchingLeftmostNote(playedNoteNameVex) {
        const targetNoteIndex = activeNotes.findIndex(note => note.isRemovable);
        if (targetNoteIndex === -1) { lastNoteDiv.textContent += ` (Nessuna nota attiva)`; return; }
        const targetNoteInfo = activeNotes[targetNoteIndex];
        let match = false;
        if (targetNoteInfo.notes.treble.includes(playedNoteNameVex) || targetNoteInfo.notes.bass.includes(playedNoteNameVex)) { match = true; }
        if (match) {
            console.log(`CORRETTO! Rimozione gruppo/nota ID ${targetNoteInfo.id} (${playedNoteNameVex})`);
            lastNoteDiv.textContent += ` (CORRETTO!)`;
            // !!! Incrementa conteggio note corrette !!!
            notesHitCorrectly++;
            updateAccuracyDisplay(); // Aggiorna display
            activeNotes.splice(targetNoteIndex, 1);
            if (highlightElement) highlightElement.remove(); highlightElement = null;
            // Dopo una rimozione corretta, la nota target cambia, quindi resetta l'ID
            // per permettere il conteggio della prossima nota che diventerà target
            lastLeftmostNoteId = null;
        } else {
            console.log(`ERRATO! Nota ${playedNoteNameVex} vs gruppo/nota attiva ID ${targetNoteInfo.id}`);
            lastNoteDiv.textContent += ` (ERRATO)`;
            const errOverlay = document.createElement('div'); errOverlay.className = 'error-flash';
            scoreContainer.appendChild(errOverlay);
            setTimeout(() => { if (errOverlay.parentNode) errOverlay.remove(); }, 200);
        }
    }

    // --- Funzione per Aggiornare Display Precisione ---
    function updateAccuracyDisplay() {
        if (!accuracyDisplay) return; // Sicurezza
        let percentage = 0;
        if (notesAttempted > 0) {
            percentage = (notesHitCorrectly / notesAttempted) * 100;
        }
        accuracyDisplay.textContent = `Precisione: ${percentage.toFixed(1)}% (${notesHitCorrectly}/${notesAttempted})`;
    }


    // --- Controllo Velocità (Slider) ---
    speedSlider.addEventListener('input', (event) => { /* ... (invariato) ... */
        currentVisualBPM = parseInt(event.target.value, 10);
        bpmDisplay.textContent = `${currentVisualBPM} BPM`;
        scrollPixelsPerFrame = calculateScrollPixelsPerFrame(currentVisualBPM);
    });

    // --- Event Listeners Bottoni ---
    playBtn.addEventListener('click', playAnimation);
    pauseBtn.addEventListener('click', pauseAnimation);
    stopBtn.addEventListener('click', stopAnimation);

    // --- Inizializzazione MIDI ---
    function setupMIDI() { /* ... (invariato) ... */
        if (navigator.requestMIDIAccess) {
            midiStatusDiv.textContent = 'Richiesta accesso MIDI...';
            navigator.requestMIDIAccess({ sysex: false })
                .then(onMIDISuccess, onMIDIFailure)
                .catch(err => { console.error("Errore iniziale richiesta MIDI:", err); onMIDIFailure("Errore richiesta accesso."); });
        } else { midiStatusDiv.textContent = 'Web MIDI API non supportata.'; console.warn("Web MIDI API non supportata!"); alert("Il tuo browser non supporta Web MIDI API."); }
    }
    function onMIDISuccess(midiAccess) { /* ... (invariato) ... */
        midiStatusDiv.textContent = 'Accesso MIDI OK. In ascolto...'; connectInputs(midiAccess);
        midiAccess.onstatechange = (event) => { console.log('Stato MIDI cambiato:', event.port.name, event.port.state); midiStatusDiv.textContent = 'Stato MIDI cambiato, ricollego...'; connectInputs(midiAccess); };
    }
    function connectInputs(midiAccess) { /* ... (invariato) ... */
        const inputs = midiAccess.inputs; let foundDevice = false;
        inputs.forEach(input => input.onmidimessage = null);
        inputs.forEach(input => { input.onmidimessage = handleMIDIMessage; console.log('Ascolto MIDI su:', input.name); if (!foundDevice) midiStatusDiv.textContent = `Ascolto su: ${input.name}`; else if (!midiStatusDiv.textContent.includes(' e altri')) midiStatusDiv.textContent += ' (e altri)'; foundDevice = true; });
        if (!foundDevice) midiStatusDiv.textContent = 'Nessun dispositivo MIDI connesso.';
    }
    function onMIDIFailure(msg) { /* ... (invariato) ... */
        midiStatusDiv.textContent = `Errore accesso MIDI: ${msg}`; console.error(`Errore MIDI: ${msg}`); alert(`Impossibile accedere ai dispositivi MIDI: ${msg}`); }

    // --- Avvio ---
    setupMIDI();
    resetAnimation(); // Imposta stato iniziale bottoni e display precisione
    console.log("Pronto. Seleziona un file MIDI per iniziare.");

    // Listener per avviare Tone.js
    document.body.addEventListener('click', async () => { if (!toneJsStarted) { console.log("Tentativo di avviare Tone.js su interazione utente..."); await initializeTone(); } }, { once: true });

}); // Fine DOMContentLoaded