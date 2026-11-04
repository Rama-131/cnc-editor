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

L’app ha tre pagine, raggiungibili dalle icone **Simulazione**, **Trasmissione** e **Ricezione** nella barra laterale sinistra. Il nome della pagina compare al passaggio del mouse:

- **Simulazione** (`#simulazione`): editor del programma e anteprima grafica del percorso.
- **Trasmissione** (`#trasmissione`): lo stesso programma aperto, affiancato al configuratore e ai comandi seriali.
- **Ricezione** (`#ricezione`): un documento inizialmente vuoto e indipendente, che si riempie con i dati inviati dalla macchina.

Il file, le modifiche non salvate, la cronologia annulla/ripristina e le impostazioni restano disponibili passando da una pagina all’altra. Il cambio pagina mette in pausa la simulazione e mantiene aperta la connessione seriale fino alla disconnessione esplicita. Funzionano anche i pulsanti Indietro/Avanti del browser e i link diretti alle pagine.

La barra superiore compatta riunisce nome della pagina, selezione della macchina e comandi **Apri/Salva**; rimane visibile durante lo scorrimento. I due pannelli occupano tutta l’area sottostante, senza margini esterni e con una sola linea centrale. Il programma e i comandi scorrono al loro interno. Su schermi piccoli i pannelli sono impilati e i comandi dei file sono rappresentati dalle icone, con etichette accessibili e suggerimenti al passaggio del mouse.

- Apertura di file `.nc`, `.cnc`, `.tap`, `.txt`, `.iso`, `.mpf`, `.gcode`, fino a 2 MB; salvataggio tramite download del browser.
- Colori configurabili per G, M, assi, numeri, commenti, utensili/correttori. Il pulsante con la tavolozza apre le impostazioni.
- Descrizioni dei codici G/M al passaggio del mouse e guida ricercabile. Le descrizioni distinguono tornio e fresatrice dove necessario, ad esempio G90 e G98/G99.
- Annulla/ripristina; Ctrl+S salva il file, Ctrl+O apre un file.
- Bozza, colori e configurazioni seriali separate per Fanuc, Mitsubishi e altro controllo vengono conservati nel browser con `localStorage`. Il salvataggio su disco rimane esplicito. Cancellare i dati del browser elimina la bozza locale.
- Il menu **Esempi** nella barra dell’editor contiene “Profilo fresatura” e “Profilo tornitura” per provare subito l’anteprima. Seleziona esplicitamente il tipo macchina quando apri un programma esterno.

## Simulazione geometrica

Supporta G0/G1, G2/G3 con I/J/K relativi al punto iniziale o R con segno, cerchi completi con centro, interpolazione elicoidale, piani G17/G18/G19, G20/G21 e coordinate assolute/incrementali G90/G91 in fresatura. Nel tornio supporta X a diametro o raggio, Z assoluta e incrementi U/W. I/J/K sono offset del centro in unità lineari; I non viene dimezzato con X a diametro. Il piano G18 usa l’ordine ZX.

La vista mostra **il percorso del punto utensile nelle coordinate pezzo**, in millimetri, da una posizione iniziale convenzionale X0/Y0/Z0. Nel tornio la coordinata X visualizzata nella vista è il raggio fisico se l’ingresso è a diametro. Sono disponibili vista isometrica, XY, XZ, YZ, zoom, riproduzione, pausa, riavvolgimento e avanzamento manuale. La velocità di riproduzione è illustrativa e non calcola i tempi macchina a partire da F/S.

Lo zero pezzo è indicato in giallo con caratteri ingranditi. Accanto compare l’origine attiva **G54–G59**, aggiornata durante riproduzione, pausa, avanzamento manuale e riavvolgimento. Anche i blocchi che selezionano un’origine senza movimento fanno parte della riproduzione. Se nessuna origine è indicata nel programma, il simulatore non inventa un G54: mostra soltanto lo zero e la dicitura “origine non indicata”.

I percorsi delle diverse origini sono visualizzati **separatamente nelle coordinate locali**: a un cambio di origine la vista passa al relativo percorso e assume una nuova partenza convenzionale da X0/Y0/Z0. Ripetere la stessa origine non azzera la posizione. Non sono disegnati collegamenti fra origini diverse; il ritorno a una stessa origine conserva i tratti già mostrati in quelle coordinate. Il campo Percorso si riferisce all’origine visualizzata. Questa rappresentazione non ricostruisce gli spostamenti reali fra G54/G55/ecc.: gli offset impostati sulla macchina non sono disponibili né applicati.

Durante la riproduzione, l’editor evidenzia in verde la riga corrispondente al percorso mostrato e ne colora il numero. Con **Segui riga** attivo, il programma scorre automaticamente mantenendo visibile il blocco simulato. La sincronizzazione funziona anche spostando il cursore di avanzamento, in pausa e al riavvolgimento. Disattiva **Segui riga** per consultare liberamente il programma mantenendo l’evidenziazione. La simulazione non sposta il cursore di scrittura e non modifica il file; cambiando il programma l’indicatore si azzera fino al successivo avvio o avanzamento manuale.

È una prima versione dell’interprete, non un emulatore del controllo CNC: non calcola asportazione, collisioni, compensazioni, offset macchina, cicli fissi, sottoprogrammi o macro. Di fronte a una funzione non supportata o a un arco incoerente, **interrompe l’anteprima alla riga interessata**, mantenendo visibile soltanto il tratto interpretato. G90 su tornio è trattato come ciclo non supportato. I rapidi sono visualizzati come segmenti rettilinei e possono differire dal movimento reale.

G-code, codici M e sintassi dei cicli variano per serie, opzioni e costruttore: il riferimento integrato è generale, non certifica la compatibilità con ogni controllo Fanuc o Mitsubishi.

## Trasferimento seriale

1. Collega il PC alla CNC con una porta COM oppure un adattatore USB–RS-232 e un cavo con piedinatura adatta al controllo.
2. Imposta sul programma gli stessi parametri del controllo: baud rate, 7/8 bit dati, parità, 1/2 stop bit, controllo di flusso, fine riga e delimitatori `%`. “Fanuc” e “Mitsubishi” sono riferimenti descrittivi: non identificano automaticamente la macchina né impongono valori universali.
3. Premi **Seleziona e collega porta** e scegli la porta nel selettore del browser. Il browser gestisce i permessi locali, senza un server che acceda alla COM.
4. Metti il controllo nella modalità di ricezione prevista dal suo manuale, quindi premi **Invia programma alla macchina**.
5. Verifica sul controllo che nome, contenuto e fine programma siano stati ricevuti correttamente. “Dati scritti sulla porta” indica che il browser ha completato la scrittura, non un riscontro di accettazione del CNC.

Sono implementati flusso hardware RTS/CTS, software XON/XOFF (DC1/DC3), pausa configurabile tra blocchi, progressione, interruzione, lettura dei dati in arrivo e salvataggio del testo ricevuto. Il software sospende l’invio dopo XOFF e riprende dopo XON, con timeout di 30 secondi. L’invio usa piccoli blocchi; i byte già bufferizzati dal driver o dall’adattatore non possono essere ritirati. Dopo un errore o un’interruzione occorre ricollegare la porta. Il trasferimento supporta ASCII: caratteri accentati e simboli non ASCII devono essere rimossi, anche dai commenti. Non è un’implementazione DNC per esecuzione continua in macchina, né un protocollo con checksum/ACK del costruttore.

## Ricezione dei programmi dalla CNC

1. Apri **Ricezione**. Il documento ricevuto è separato dal programma aperto nell’editor; la prima volta è vuoto. Una precedente bozza di ricezione viene ripristinata senza attivare la porta.
2. Configura gli stessi parametri seriali presenti sulla CNC e premi **Seleziona e collega porta**. Trasmissione e ricezione condividono una sola connessione, mantenuta passando fra le pagine.
3. Premi **Avvia ricezione**, poi avvia l’uscita/invio del programma dalla macchina con la procedura prevista dal controllo. Con XON/XOFF il PC invia XON (DC1) per dichiararsi pronto; con RTS/CTS il flusso hardware è gestito dal driver seriale.
4. Il testo compare progressivamente, con evidenziazione G-code e conteggio dei caratteri. **Segui dati** mantiene visibile la fine del documento. Puoi cambiare pagina mentre la ricezione continua; l’invio di un programma dal PC rimane disabilitato finché ricevi.
5. Attendi che la CNC abbia terminato l’invio, premi **Termina ricezione**, verifica il programma e usa **Salva** nella barra superiore. Puoi scegliere il nome del file `.nc`. Ctrl+S nella pagina Ricezione salva questo documento. La fine dell’acquisizione è manuale: l’app non presume che una pausa, M30 o `%` garantiscano la fine dell’invio.

Il documento è in sola lettura e conserva i dati testuali nell’ordine ricevuto, compresi fine riga e delimitatori. La vista normalizza CR/LF per la leggibilità; il file scaricato mantiene le righe originali. XON/XOFF sono segnali di flusso e non entrano nel file. La decodifica testuale supporta ASCII e UTF-8 a frammenti; non è una cattura binaria o un convertitore di codifiche proprietarie.

**Termina ricezione** invia XOFF (DC3) quando è configurato il flusso software e interrompe l’acquisizione nel documento; non garantisce un arresto immediato dell’uscita della CNC, dei driver o degli adattatori. Dopo la pausa, **Riprendi ricezione** aggiunge i nuovi dati al documento esistente. Il pulsante **Nuova** nella pagina Ricezione lo svuota, chiedendo conferma se i dati non sono stati salvati. Una copia scaricata durante l’acquisizione contiene soltanto i dati ricevuti fino a quel momento.

La bozza ricevuta è conservata nel browser, separatamente da quella dell’editor; può essere salvata anche dopo un errore di porta. In caso di errore l’acquisizione si ferma, i dati già ricevuti restano disponibili e la porta va ricollegata. Il documento può contenere fino a **2.097.152 caratteri**: superato il limite, l’app interrompe l’acquisizione e segnala esplicitamente che il file è parziale, senza troncare silenziosamente la ricezione. Il riquadro diagnostico “Dati ricevuti” mantiene solo gli ultimi 200.000 caratteri; questo limite non si applica al documento da salvare.

Per modificare o simulare un file ricevuto, salvalo e aprilo dalla pagina Simulazione o Trasmissione. Il collegamento fisico richiede Chrome/Edge sul PC Windows connesso alla macchina e i parametri/cablaggi corretti per il controllo specifico.

**Trasmissione e ricezione sono verificate con stream e porta simulati; il collegamento fisico e le impostazioni del singolo controllo richiedono una prova sul PC Windows con la macchina.**

## Struttura

- `src/lib/simulator.ts`: interprete geometrico indipendente dall’interfaccia.
- `src/lib/serial.ts`: trasporto Web Serial e codifica del programma.
- `src/lib/codes.ts`: descrizioni G/M.
- `src/components/`: editor CodeMirror, anteprima SVG, configuratore seriale.
- `tests/`: test Vitest e flussi browser Playwright.

Lo sviluppo usa il checkout esistente, senza necessità di worktree aggiuntivi. Non sono necessari account, segreti, database o servizi esterni per l’applicazione.
