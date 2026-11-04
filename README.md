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

L’app ha quattro pagine, raggiungibili dalle icone **Simulazione**, **Trasmissione**, **Ricezione** e **Impostazioni** nella barra laterale sinistra. Il nome della pagina compare al passaggio del mouse:

- **Simulazione** (`#simulazione`): editor del programma e anteprima grafica del percorso.
- **Trasmissione** (`#trasmissione`): lo stesso programma aperto, affiancato alla scelta della macchina salvata e ai comandi seriali.
- **Ricezione** (`#ricezione`): un documento inizialmente vuoto e indipendente, che si riempie con i dati inviati dalla macchina.
- **Impostazioni** (`#impostazioni`): elenco delle proprie macchine con nome, controllo CNC e configurazione seriale.

Il file, le modifiche non salvate, la cronologia annulla/ripristina e le impostazioni restano disponibili passando da una pagina all’altra. Il cambio pagina mette in pausa la simulazione e mantiene aperta la connessione seriale fino alla disconnessione esplicita. Funzionano anche i pulsanti Indietro/Avanti del browser e i link diretti alle pagine.

Puoi selezionare **più file insieme** con Apri oppure aggiungerli uno alla volta. Ogni programma compare in una **scheda in alto**, con la propria crocetta di chiusura; clicca sul nome per attivarlo. Ogni scheda conserva testo, cursore, scorrimento, cronologia delle modifiche e impostazioni Fresatrice/Tornio e diametro/raggio. Le frecce della tastiera cambiano scheda quando il nome ha il focus. **+** crea un nuovo programma. La chiusura chiede conferma se il testo contiene modifiche non salvate; chiudendo tutte le schede compare un’area vuota pronta per aprire altri file.

Il nome del programma compare soltanto nella scheda superiore. Per rinominarlo, fai doppio clic sul nome oppure premi **F2** con la scheda selezionata: **Invio** conferma, **Esc** annulla; anche uscire dal campo conferma il nome.

I pulsanti **Annulla** e **Ripristina** sopra l’editor operano sul file attivo, come Ctrl+Z e Ctrl+Y. **Salva** e Ctrl+S scaricano il programma della scheda selezionata; anche la pagina Trasmissione usa quel programma. Ricezione mantiene il proprio documento indipendente.

Nella barra della pagina **Simulazione**, accanto a **Spazi**, sono disponibili:

- **F · Avanz.** e **S · Giri**: impostano un valore preciso per gli avanzamenti F o i giri mandrino S già presenti. Scegli programma intero o, se hai selezionato del testo, solo selezione; il pannello mostra quante istruzioni cambieranno prima di premere **Applica**. Sono accettati punto o virgola decimale. L’operazione modifica solo la scheda attiva e si annulla in un solo passaggio. Non aggiunge istruzioni mancanti e conserva commenti, macro e blocchi di sintassi non riconosciuta. Le unità F restano quelle del programma. La modifica dei giri esclude S in G96, i limiti G50/G92, G10 e i valori dopo sintassi non riconosciuta finché un G97 non ristabilisce la modalità giri; non converte la velocità di taglio in giri.
- **Trova**, **Trova precedente**, **Trova prossimo** e **Sostituisci**: ricerca testuale nel documento attivo, anche nei commenti, con sostituzione singola o di tutte le corrispondenze. Il pannello offre distinzione maiuscole/minuscole, parola intera ed espressioni regolari. **Ctrl+F** apre la ricerca, **F3** trova il prossimo risultato, **Maiusc+F3** il precedente, **Ctrl+H** apre la sostituzione ed **Esc** chiude il pannello. La ricerca resta separata per scheda durante la sessione.
- **Cambio utensile precedente** e **Prossimo cambio utensile**: spostano il cursore e centrano il blocco nell’editor, senza modificare il programma. Nel tornio riconoscono i richiami T numerici diversi da zero; in fresatura i blocchi M6/M06, distinguendoli dalla sola preselezione T. Commenti e macro sono esclusi. Alla fine o all’inizio la navigazione riparte dall’estremo opposto del file.

Su schermi stretti la barra dei comandi scorre orizzontalmente senza allargare la pagina.

Il pulsante **Nascondi simulazione** nella barra delle schede mette in pausa l’anteprima e lascia tutto lo spazio all’editor. **Mostra simulazione** riapre lo stesso pannello con zoom e avanzamento mantenuti. Il passaggio a un altro programma aggiorna l’anteprima al file scelto e ne azzera la riproduzione.

Schede aperte, contenuti, selezione, modifiche da salvare e visibilità della simulazione sono ripristinati nello stesso browser dopo il ricaricamento. La cronologia Annulla/Ripristina resta separata per file durante la sessione e riparte dopo il ricaricamento. La vecchia bozza singola viene recuperata come scheda da salvare. Il ripristino usa lo spazio locale del browser: se la quota si esaurisce, l’app avvisa di salvare i programmi sul PC. Il salvataggio su disco rimane esplicito. L’editor normalizza CR/LF in righe LF; la ricezione conserva invece i fine riga originali.

La barra superiore compatta riunisce nome della pagina, selezione della macchina e comandi **Apri/Salva**; rimane visibile durante lo scorrimento. I due pannelli occupano tutta l’area sottostante, senza margini esterni e con una sola linea centrale. Il programma e i comandi scorrono al loro interno. Su schermi piccoli i pannelli sono impilati e i comandi dei file sono rappresentati dalle icone, con etichette accessibili e suggerimenti al passaggio del mouse.

- Apertura di file `.nc`, `.cnc`, `.tap`, `.txt`, `.iso`, `.mpf`, `.gcode`, fino a 2 MB ciascuno; salvataggio della scheda attiva tramite download del browser.
- Colori configurabili per G, M, assi, numeri, commenti, utensili/correttori. Il pulsante con la tavolozza apre le impostazioni.
- Il pulsante **Spazi** nella barra dell’editor separa le parole dei blocchi numerici, ad esempio `N10G1X20Z-5F0.2M8` diventa `N10 G1 X20 Z-5 F0.2 M8`. Funziona in Simulazione e Trasmissione, senza modificare valori, commenti o righe; Ctrl+Z annulla l’operazione. I blocchi con macro, stringhe, checksum o sintassi non riconosciuta rimangono invariati. I file aperti non vengono formattati automaticamente. Il simulatore legge già i codici numerici senza spazi: la formattazione migliora la leggibilità e non aggiunge il supporto a istruzioni non simulate.
- Descrizioni dei codici G/M al passaggio del mouse e guida ricercabile. Le descrizioni distinguono tornio e fresatrice dove necessario, ad esempio G90 e G98/G99.
- Annulla/ripristina; Ctrl+S salva il file, Ctrl+O apre un file.
- Bozza, colori e macchine con le rispettive configurazioni seriali vengono conservati nel browser con `localStorage`. Il salvataggio dei programmi su disco rimane esplicito. Cancellare i dati del browser elimina anche queste configurazioni locali.
- Il menu **Esempi** nella barra dell’editor contiene “Profilo fresatura” e “Profilo tornitura” per provare subito l’anteprima. Seleziona esplicitamente il tipo macchina quando apri un programma esterno.

## Simulazione geometrica

Supporta G0/G1, G2/G3 con I/J/K relativi al punto iniziale o R con segno, cerchi completi con centro, interpolazione elicoidale, piani G17/G18/G19, G20/G21 e coordinate assolute/incrementali G90/G91 in fresatura. Nel tornio supporta X a diametro o raggio, Z assoluta e incrementi U/W. I/J/K sono offset del centro in unità lineari; I non viene dimezzato con X a diametro. Il piano G18 usa l’ordine ZX.

La vista mostra **il percorso del punto utensile nelle coordinate pezzo**, in millimetri, da una posizione iniziale convenzionale X0/Y0/Z0. Nel tornio la coordinata X visualizzata nella vista è il raggio fisico se l’ingresso è a diametro. Sono disponibili vista isometrica, XY, XZ, YZ, zoom, riproduzione, pausa, riavvolgimento e avanzamento manuale. La velocità di riproduzione è illustrativa e non calcola i tempi macchina a partire da F/S.

Per centrare manualmente il percorso, tieni premuto il **tasto sinistro del mouse e trascina** nel disegno. Percorso, utensile e zero si spostano insieme; le coordinate del programma restano invariate e la riproduzione continua. Il trascinamento funziona anche dopo lo zoom e nelle diverse viste. **Adatta alla vista** oppure un **doppio clic** nel disegno ripristinano centratura e zoom iniziali. Il cambio vista o la modifica del programma azzerano lo spostamento manuale.

Punta il mouse sul disegno e usa la **rotella**: in avanti ingrandisce, indietro riduce, mantenendo fermo il punto sotto il puntatore. Funziona anche dopo il trascinamento e durante la riproduzione; la rotella sopra il disegno non fa scorrere il pannello. Restano disponibili i pulsanti +/−, con zoom limitato a 0,25×–8×, e i comandi di ricentramento. Ctrl/⌘+rotella mantiene il comportamento del browser.

Lo zero pezzo è indicato in giallo con caratteri ingranditi. Accanto compare l’origine attiva **G54–G59**, aggiornata durante riproduzione, pausa, avanzamento manuale e riavvolgimento. Anche i blocchi che selezionano un’origine senza movimento fanno parte della riproduzione. Se nessuna origine è indicata nel programma, il simulatore non inventa un G54: mostra soltanto lo zero e la dicitura “origine non indicata”.

In modalità **Tornio · XZ** è supportato lo spostamento esterno origine Fanuc **G10 P0**, ad esempio `N10 G10 P0 Z-266.2`. X/Z impostano valori assoluti; U/W aggiungono variazioni incrementali, rispettando unità e programmazione X a diametro/raggio. Il blocco deve essere separato da altri G/M e indicare almeno un asse. Non genera un movimento, non cambia G0/G1 e non seleziona G54. Durante la riproduzione lo spostamento è visibile sopra il disegno; se manca G54–G59, accanto allo zero compare **G10 P0**. Con G54–G59 rimane visibile l’origine selezionata e G10 agisce sullo shift esterno condiviso.

Per questa anteprima lo shift esterno preesistente è assunto nullo e l’ingresso iniziale nel sistema locale è convenzionalmente a zero. Un G10 prima del primo movimento imposta il riferimento senza inventare una corsa di ingresso. Fra movimenti già noti, un cambio di shift ricalcola le coordinate correnti mantenendo ferma la posizione fisica simulata. Le viste dei diversi shift sono separate, senza tratti di collegamento dovuti alla sola impostazione dell’origine. Gli offset G54–G59 e la posizione reale iniziale della macchina restano sconosciuti. Le altre forme G10 (correttori utensile, L2/L20, P diversi da zero, macro) interrompono ancora l’anteprima con una spiegazione.

Nella configurazione Tornio dell’app, **M26** è associato a **contropunta avanti**, secondo la funzione indicata dall’utente per la sua macchina. Il blocco compare nella riproduzione senza aggiungere segmenti al percorso utensile; il movimento della contropunta e le relative collisioni non sono rappresentati. Questa associazione dipende dal costruttore della macchina, non è un significato universale Fanuc e non viene applicata in modalità Fresatrice.

Sempre nella configurazione Tornio, **G92 S** imposta il limite giri dichiarato per questa macchina: `G92 S1200` registra un limite di **1200 giri/min**, visibile durante la riproduzione. Il limite rimane attivo fino a un altro G92 S. Il blocco è separato da altri G/M e contiene soltanto N opzionale e S positivo; non muove gli assi e mantiene il movimento modale. Le forme G92 con X/Z/F e i cicli di filettatura restano non simulati, perché il significato dipende dal sistema di codici del controllo. L’anteprima geometrica non calcola giri effettivi, tempi macchina o la variazione del mandrino in G96.

È supportato **G71 Fanuc a due righe, sgrossatura esterna tipo I**, nel piano G18. Il ciclo legge il profilo P/Q, genera passate longitudinali, una ripresa del profilo con sovrametallo e il ritorno al punto iniziale. Le righe P/Q non vengono poi eseguite una seconda volta. Durante le passate l’editor segue il blocco G71; durante la ripresa segue le righe del profilo. Un esempio completo:

```gcode
G0 X40 Z2
G71 U2 R0.5
G71 P10 Q30 U1 W0.1 F0.27
N10 G0 X20
N20 G1 Z-10
N30 X40
M30
```

Nella prima riga **U è sempre la profondità radiale**, anche programmando X a diametro; R è il ritiro. Nella seconda riga U è il sovrametallo X, interpretato secondo diametro/raggio, e W il sovrametallo Z. Il profilo deve iniziare con G0/G1 e la sola X, proseguire con G1, X crescente e Z decrescente. Sono ammesse quote angolari **A**, misurate dal verso Z positivo sul piano fisico ZX: per esempio `X39.8 A135` calcola anche la Z usando lo spostamento radiale reale. Un **R positivo** su un blocco lineare raccorda lo spigolo con il blocco successivo, come `Z-205.4 R1.8` seguito da una variazione X. Il raccordo deve entrare nei due tratti e viene approssimato con segmenti.

L’anteprima G71 è geometrica: le ritrazioni sono convenzionalmente a 45°, i sovrametalli restano sul percorso e non vengono ricostruiti asportazione, collisioni, tempi o logiche opzionali del controllo. Non sostituisce la verifica sul controllo della macchina. Sono previsti al massimo 1000 passate e 100.000 segmenti totali. G71 a una riga, tipo II con tasche/inversioni, lavorazioni interne, G2/G3 nel profilo e macro restano non simulati; profili mancanti, angoli incoerenti e raggi impossibili interrompono l’anteprima senza disegnare passate inventate. Il test di riferimento usa il profilo N190–N310 fornito dall’utente, con ingresso X65/Z1 e `G71 U2.52 R0.5` / `G71 P190 Q310 U1 W0.1 F0.27`.

È supportata anche la **finitura G70 P... Q...** sul profilo già definito prima del richiamo, ad esempio `G70 P190 Q310` dopo il G71. Il profilo G0/G1 con A/R viene ripercorso alle quote nominali, senza aggiungere i sovrametalli del G71; l’editor segue le righe P/Q. A fine ciclo il ritorno rapido al punto del richiamo è rappresentato come segmento rettilineo e l’esecuzione prosegue dalla riga dopo G70. Servono Tornio/G18 e un blocco G70 separato, con soli P/Q e N opzionale. Riferimenti in avanti, profili mancanti/ambigui, altre forme di G70 e funzioni del profilo non supportate interrompono l’anteprima con una spiegazione. Restano esclusi compensazione utensile, tempi, asportazione e collisioni.

I percorsi delle diverse origini sono visualizzati **separatamente nelle coordinate locali**: a un cambio di origine la vista passa al relativo percorso e assume una nuova partenza convenzionale da X0/Y0/Z0. Ripetere la stessa origine non azzera la posizione. Non sono disegnati collegamenti fra origini diverse; il ritorno a una stessa origine conserva i tratti già mostrati in quelle coordinate. Il campo Percorso si riferisce all’origine visualizzata. Questa rappresentazione non ricostruisce gli spostamenti reali fra G54/G55/ecc.: gli offset impostati sulla macchina non sono disponibili né applicati.

Durante la riproduzione, l’editor evidenzia in verde la riga corrispondente al percorso mostrato e ne colora il numero. Con **Segui riga** attivo, il programma scorre automaticamente mantenendo visibile il blocco simulato. La sincronizzazione funziona anche spostando il cursore di avanzamento, in pausa e al riavvolgimento. Disattiva **Segui riga** per consultare liberamente il programma mantenendo l’evidenziazione. La simulazione non sposta il cursore di scrittura e non modifica il file; cambiando il programma l’indicatore si azzera fino al successivo avvio o avanzamento manuale.

È una prima versione dell’interprete, non un emulatore del controllo CNC: non calcola asportazione, collisioni, compensazioni, offset macchina non presenti nel programma, altri cicli fissi, sottoprogrammi o macro. Di fronte a una funzione non supportata o a un arco incoerente, **interrompe l’anteprima alla riga interessata**, mantenendo visibile soltanto il tratto interpretato. G90 su tornio è trattato come ciclo non supportato. I rapidi sono visualizzati come segmenti rettilinei e possono differire dal movimento reale.

G-code, codici M e sintassi dei cicli variano per serie, opzioni e costruttore: il riferimento integrato è generale, non certifica la compatibilità con ogni controllo Fanuc o Mitsubishi.

## Trasferimento seriale

In **Impostazioni**, crea una macchina con **+**, assegna un nome riconoscibile (ad esempio “Tornio Fanuc”) e scegli controllo CNC e parametri seriali. **Salva macchina** oppure Ctrl+S conferma le modifiche; i cambiamenti non salvati non vengono applicati ai trasferimenti. Puoi registrare più macchine anche con lo stesso tipo di controllo, modificarle ed eliminarle. Le precedenti configurazioni Fanuc/Mitsubishi/altro controllo vengono recuperate automaticamente come macchine, mantenendo i parametri già salvati.

Trasmissione e Ricezione mostrano soltanto il menu **Macchina** e i comandi di collegamento/trasferimento. La selezione è condivisa tra le due pagine e viene ripristinata dopo il ricaricamento. Mentre la porta è collegata, la macchina selezionata non può essere cambiata, modificata o eliminata; puoi comunque gestire le altre macchine e cambiare pagina senza interrompere la connessione o la ricezione. La porta fisica COM resta una scelta del browser a ogni collegamento.

1. Collega il PC alla CNC con una porta COM oppure un adattatore USB–RS-232 e un cavo con piedinatura adatta al controllo.
2. In **Impostazioni**, salva una macchina con gli stessi parametri del controllo: baud rate, 7/8 bit dati, parità, 1/2 stop bit, controllo di flusso, fine riga, pausa tra blocchi e delimitatori `%`. In **Trasmissione**, seleziona la macchina salvata. “Fanuc” e “Mitsubishi” sono riferimenti descrittivi: non identificano automaticamente la macchina né impongono valori universali.
3. Premi **Seleziona e collega porta** e scegli la porta nel selettore del browser. Il browser gestisce i permessi locali, senza un server che acceda alla COM.
4. Metti il controllo nella modalità di ricezione prevista dal suo manuale, quindi premi **Invia programma alla macchina**.
5. Verifica sul controllo che nome, contenuto e fine programma siano stati ricevuti correttamente. “Dati scritti sulla porta” indica che il browser ha completato la scrittura, non un riscontro di accettazione del CNC.

Sono implementati flusso hardware RTS/CTS, software XON/XOFF (DC1/DC3), pausa configurabile tra blocchi, progressione, interruzione, lettura dei dati in arrivo e salvataggio del testo ricevuto. Il software sospende l’invio dopo XOFF e riprende dopo XON, con timeout di 30 secondi. L’invio usa piccoli blocchi; i byte già bufferizzati dal driver o dall’adattatore non possono essere ritirati. Dopo un errore o un’interruzione occorre ricollegare la porta. Il trasferimento supporta ASCII: caratteri accentati e simboli non ASCII devono essere rimossi, anche dai commenti. Non è un’implementazione DNC per esecuzione continua in macchina, né un protocollo con checksum/ACK del costruttore.

## Ricezione dei programmi dalla CNC

1. Apri **Ricezione**. Il documento ricevuto è separato dal programma aperto nell’editor; la prima volta è vuoto. Una precedente bozza di ricezione viene ripristinata senza attivare la porta.
2. Scegli la macchina configurata in **Impostazioni** e premi **Seleziona e collega porta**. Trasmissione e ricezione condividono una sola connessione, mantenuta passando fra le pagine.
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
- `src/lib/machineProfiles.ts`: macchine salvate e recupero delle precedenti configurazioni seriali.
- `src/components/`: editor CodeMirror, anteprima SVG, impostazioni macchine e comandi seriali.
- `tests/`: test Vitest e flussi browser Playwright.

Lo sviluppo usa il checkout esistente, senza necessità di worktree aggiuntivi. Non sono necessari account, segreti, database o servizi esterni per l’applicazione.
