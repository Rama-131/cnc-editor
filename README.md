# CNC Studio

Editor G-code in italiano per fresatrice a 3 assi e tornio, con anteprima del percorso e trasferimento seriale RS-232 dal PC locale.

## Uso online con GitHub Pages

Il workflow `.github/workflows/pages.yml` esegue i test, costruisce l’app e la pubblica a ogni aggiornamento del ramo `main`. Nel repository apri **Settings → Pages → Build and deployment → Source**, seleziona **GitHub Actions**, poi apri **Actions → Pubblica CNC Studio → Run workflow** se la prima esecuzione non è riuscita perché Pages non era ancora abilitato. Il link effettivo del sito compare nella pagina Pages e nel risultato del job di pubblicazione.

Dal sito puoi aprire i file CNC del PC e simulare i percorsi. L’editor funziona nel browser: i file aperti non vengono caricati su GitHub. La seriale richiede Chrome/Edge sul PC collegato alla macchina; il sito Pages viene servito in HTTPS. Le build usano percorsi relativi per funzionare anche sotto `/cnc-editor/`.

## Avvio su Windows

Installa **Node.js 24 LTS**, apri un terminale nella cartella del progetto ed esegui:

```powershell
npm ci
npm run dev
```

Apri l’indirizzo mostrato dal terminale in **Chrome o Microsoft Edge**. Per accedere alle porte COM, il browser deve essere eseguito sul PC collegato alla macchina; un browser remoto nel cloud non accede alle porte del PC Windows. Web Serial richiede localhost oppure HTTPS.

```powershell
npm test          # test del simulatore e del trasporto seriale
npm run build     # controllo TypeScript e build in dist/
npm run preview   # prova della build
```

Per i test dell’interfaccia: `npx playwright install chromium`, quindi `npm run test:e2e`. Il runner avvia automaticamente il server; nell’ambiente cloud riusa Chromium già installato. `npm run format` formatta il codice.

## Editor

- Apertura di file `.nc`, `.cnc`, `.tap`, `.txt`, `.iso`, `.mpf`, `.gcode`, fino a 2 MB; salvataggio tramite download del browser.
- Colori configurabili per G, M, assi, numeri, commenti, utensili/correttori. Il pulsante con la tavolozza apre le impostazioni.
- Descrizioni dei codici G/M al passaggio del mouse e guida ricercabile. Le descrizioni distinguono tornio e fresatrice dove necessario, ad esempio G90 e G98/G99.
- Annulla/ripristina; Ctrl+S salva il file, Ctrl+O apre un file.
- Bozza, colori e configurazioni seriali separate per Fanuc, Mitsubishi e altro controllo vengono conservati nel browser con `localStorage`. Il salvataggio su disco rimane esplicito. Cancellare i dati del browser elimina la bozza locale.
- Gli esempi “Profilo fresatura” e “Profilo tornitura” permettono di provare subito l’anteprima. Seleziona esplicitamente il tipo macchina quando apri un programma esterno.

## Simulazione geometrica

Supporta G0/G1, G2/G3 con I/J/K relativi al punto iniziale o R con segno, cerchi completi con centro, interpolazione elicoidale, piani G17/G18/G19, G20/G21 e coordinate assolute/incrementali G90/G91 in fresatura. Nel tornio supporta X a diametro o raggio, Z assoluta e incrementi U/W. I/J/K sono offset del centro in unità lineari; I non viene dimezzato con X a diametro. Il piano G18 usa l’ordine ZX.

La vista mostra **il percorso del punto utensile nelle coordinate pezzo**, in millimetri, da una posizione iniziale convenzionale X0/Y0/Z0. Nel tornio la coordinata X visualizzata nella vista è il raggio fisico se l’ingresso è a diametro. Sono disponibili vista isometrica, XY, XZ, YZ, zoom, riproduzione, pausa, riavvolgimento e avanzamento manuale. La velocità di riproduzione è illustrativa e non calcola i tempi macchina a partire da F/S.

Durante la riproduzione, l’editor evidenzia in verde la riga corrispondente al percorso mostrato e ne colora il numero. Con **Segui riga** attivo, il programma scorre automaticamente mantenendo visibile il blocco simulato. La sincronizzazione funziona anche spostando il cursore di avanzamento, in pausa e al riavvolgimento. Disattiva **Segui riga** per consultare liberamente il programma mantenendo l’evidenziazione. La simulazione non sposta il cursore di scrittura e non modifica il file; cambiando il programma l’indicatore si azzera fino al successivo avvio o avanzamento manuale.

È una prima versione dell’interprete, non un emulatore del controllo CNC: non calcola asportazione, collisioni, compensazioni, offset macchina, cicli fissi, sottoprogrammi o macro. Di fronte a una funzione non supportata o a un arco incoerente, **interrompe l’anteprima alla riga interessata**, mantenendo visibile soltanto il tratto interpretato. G90 su tornio è trattato come ciclo non supportato. Un cambio di origine dopo un movimento interrompe l’anteprima, perché gli offset non sono noti. I rapidi sono visualizzati come segmenti rettilinei e possono differire dal movimento reale.

G-code, codici M e sintassi dei cicli variano per serie, opzioni e costruttore: il riferimento integrato è generale, non certifica la compatibilità con ogni controllo Fanuc o Mitsubishi.

## Trasferimento seriale

1. Collega il PC alla CNC con una porta COM oppure un adattatore USB–RS-232 e un cavo con piedinatura adatta al controllo.
2. Imposta sul programma gli stessi parametri del controllo: baud rate, 7/8 bit dati, parità, 1/2 stop bit, controllo di flusso, fine riga e delimitatori `%`. “Fanuc” e “Mitsubishi” sono riferimenti descrittivi: non identificano automaticamente la macchina né impongono valori universali.
3. Premi **Seleziona e collega porta** e scegli la porta nel selettore del browser. Il browser gestisce i permessi locali, senza un server che acceda alla COM.
4. Metti il controllo nella modalità di ricezione prevista dal suo manuale, quindi premi **Invia programma alla macchina**.
5. Verifica sul controllo che nome, contenuto e fine programma siano stati ricevuti correttamente. “Dati scritti sulla porta” indica che il browser ha completato la scrittura, non un riscontro di accettazione del CNC.

Sono implementati flusso hardware RTS/CTS, software XON/XOFF (DC1/DC3), pausa configurabile tra blocchi, progressione, interruzione, lettura dei dati in arrivo e salvataggio del testo ricevuto. Il software sospende l’invio dopo XOFF e riprende dopo XON, con timeout di 30 secondi. L’invio usa piccoli blocchi; i byte già bufferizzati dal driver o dall’adattatore non possono essere ritirati. Dopo un errore o un’interruzione occorre ricollegare la porta. Il trasferimento supporta ASCII: caratteri accentati e simboli non ASCII devono essere rimossi, anche dai commenti. Non è un’implementazione DNC per esecuzione continua in macchina, né un protocollo con checksum/ACK del costruttore.

**La seriale è verificata con stream e porta simulati; il collegamento fisico e le impostazioni del singolo controllo richiedono una prova sul PC Windows con la macchina.**

## Struttura

- `src/lib/simulator.ts`: interprete geometrico indipendente dall’interfaccia.
- `src/lib/serial.ts`: trasporto Web Serial e codifica del programma.
- `src/lib/codes.ts`: descrizioni G/M.
- `src/components/`: editor CodeMirror, anteprima SVG, configuratore seriale.
- `tests/`: test Vitest e flussi browser Playwright.

Lo sviluppo usa il checkout esistente, senza necessità di worktree aggiuntivi. Non sono necessari account, segreti, database o servizi esterni per l’applicazione.
