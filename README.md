# Pentagramma MIDI Scorrevole (Player)

Un visualizzatore MIDI interattivo che mostra uno spartito semplificato a scorrimento, basato su VexFlow e Tone.js. Permette di caricare file MIDI, visualizzare le note su un doppio pentagramma (chiave di violino e basso), e ricevere feedback sull'accuratezza tramite input MIDI.

## Caratteristiche Principali

*   Caricamento di file MIDI locali (.mid, .midi).
*   Visualizzazione a scorrimento continuo su doppio pentagramma.
*   Colorazione delle note per indicare alterazioni (Verde: Diesis, Blu: Bemolle, Nero: Naturale - *Nota: senza simboli #/b*).
*   Controllo della velocità di scorrimento visivo (BPM).
*   Controlli Play/Pause/Stop.
*   Input MIDI per suonare insieme al pentagramma.
*   Calcolo e visualizzazione dell'accuratezza delle note suonate.
*   Linea di partenza visiva ("START").
*   Scrolling manuale durante la pausa.
*   (Opzionale) Riproduzione audio base tramite Tone.js (attualmente commentata o non usata attivamente).

## Screenshot (Esempio)

*(Qui potresti inserire un link a uno screenshot o usare la sintassi Markdown per immagini se carichi l'immagine su GitHub:)*
`![Screenshot del Player](link_al_tuo_screenshot.png)`

## Setup e Installazione

1.  **Clona o Scarica:** Ottieni i file del progetto (index.html, script.js, style.css, LICENSE.md, README.md).
2.  **Apri `index.html`:** Apri il file `index.html` direttamente nel tuo browser web moderno (Chrome, Firefox, Edge, Safari).
3.  **(Opzionale) Live Server:** Per un'esperienza di sviluppo migliore, puoi usare un'estensione come "Live Server" per Visual Studio Code per avviare un server locale.

Non sono richieste installazioni complesse, le librerie necessarie (VexFlow, Tone.js, @tonejs/midi) sono caricate tramite CDN.

## Utilizzo

1.  **Carica un File MIDI:** Clicca sul pulsante "Scegli file" e seleziona un file MIDI dal tuo computer.
2.  **Abilita Audio (se usato):** Clicca una volta in un punto qualsiasi della pagina per permettere al browser di avviare il contesto audio (necessario per Tone.js).
3.  **Controlli:**
    *   **Play:** Avvia lo scorrimento delle note.
    *   **Pause:** Mette in pausa lo scorrimento (permette lo scroll manuale col mouse).
    *   **Stop:** Ferma lo scorrimento e resetta la visualizzazione.
    *   **Slider Velocità:** Regola la velocità di scorrimento (BPM visivi).
4.  **Input MIDI:** Collega un dispositivo MIDI. Le note suonate verranno mostrate nell'"Ultima Nota MIDI". Se suoni la nota corretta quando è evidenziata dalla barra blu, l'accuratezza aumenterà.
5.  **Linea START:** Indica approssimativamente dove iniziare a suonare.

## Tecnologie Utilizzate

*   HTML5
*   CSS3
*   JavaScript (ES6+)
*   [VexFlow](https://www.vexflow.com/): Libreria per il rendering della notazione musicale.
*   [Tone.js](https://tonejs.github.io/): Framework per l'audio web (usato per potenziale playback e gestione tempo).
*   [@tonejs/midi](https://github.com/Tonejs/Midi): Libreria per il parsing dei file MIDI.

## Licenza

Questo progetto è distribuito sotto la Licenza MIT. Vedi il file `LICENSE.md` per maggiori dettagli.

Copyright (c) 2025 [Lorenzetti Giuseppe]

## Autore

*   [Lorenzetti Giuseppe]
*   (pianohitech.com,pianothc791@gmail.com)