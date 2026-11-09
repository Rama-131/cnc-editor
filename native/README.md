# Rama Edit per Windows

Applicazione nativa in C#/.NET 10 e WPF, con editor AvalonEdit e porte COM gestite da Windows. Funziona offline; l'installer comprende il runtime .NET. La versione web resta disponibile allo stesso indirizzo.

## Installazione e blocco di Windows 11

La versione EXE 0.2.2 non è firmata. Su Windows 11 con **Controllo intelligente delle app** attivo, Windows può impedirne completamente l'avvio. Anche lo ZIP contiene un eseguibile non firmato: non costituisce una soluzione al blocco.

Le versioni di prova successive vengono pubblicate solo con un incremento esplicito della versione o una richiesta manuale; restano non firmate e non risolvono il blocco. L’aggiornamento corrente è [Rama Edit 0.2.12](https://github.com/Rama-131/cnc-editor/releases/tag/windows-v0.2.12). Per l'autore privato in Italia è predisposto il [percorso Microsoft Store](store/README.md): serve ancora registrare e verificare l'autore, ottenere l'identità dell'app e completare la certificazione Microsoft. Il pacchetto di sola verifica tecnica non è installabile e non risolve il problema. Nel frattempo rimane disponibile la versione web.

## Funzioni

- Editor a schede, scheda attiva blu, nuovi programmi TXT, chiusura con protezione delle modifiche e cronologia separata per documento.
- Apri file multipli da Questo PC, trascina file nella finestra, Salva e Salva con nome tramite finestre Windows, stampa del programma completo o della lista utensili.
- Colori nella barra superiore con campioni visibili, selettore Windows e anteprima. Palette ISO dalle foto di riferimento: rapido giallo, lineare turchese, G2 azzurro, G3 blu, commenti verdi e testo chiaro su sfondo scuro. I colori corrispondono nel testo e nel disegno, anche sui blocchi modali. Testo, sfondo e selezione sono personalizzabili; resta disponibile la colorazione per codici G/M. Descrizioni G/M al passaggio del mouse.
- Aggiungi spazi, imposta valori F/S (anche nella selezione), trova precedente/successivo, sostituisci, ricerca con parola intera/maiuscole/espressioni regolari e navigazione dei cambi utensile.
- Lista utensili con descrizioni, correttori e preselezioni, esportabile in TXT e stampabile.
- Anteprima geometrica fresatrice/tornio, piani 3D/XY/XZ/YZ, X a diametro o raggio, avanzamento con evidenziazione della riga, zoom con rotella e trascinamento, origine attiva G54–G59 e G10 P0.
- Interprete tornio Fanuc ampliato: G32/G33/G34, G50, G70–G76, G81–G89 e cicli modali G90/G92/G94. Profili tipo I esterni/interni con archi, angoli A, raccordi R e smussi C ortogonali. Modalità separata per ISO G90/G91 con cicli G77/G78/G79. G28/G30/G53 riconosciuti con omissione esplicita dei tratti macchina non determinabili. G41/G42 mostrano il profilo nominale senza compensazione della punta. [Formati e limiti Fanuc](FANUC.md). Il pulsante Dettagli elenca codici, note e limitazioni del programma; le funzioni non supportate interrompono l’anteprima conservando la parte già calcolata.
- Pagine Trasmissione e Ricezione con testo a tutta larghezza e comandi nella barra superiore. A fine ricezione, apertura automatica in una nuova scheda attiva di Scrittura / Simulazione, modificabile e ancora da salvare. Apri in scrittura recupera anche una ricezione precedente. Filtri e trigger, timeout, arresto e recupero del testo dopo un errore. Il profilo Biglia S131 omette le righe vuote, normalizza i fine riga in CR/LF e rimuove DC2/DC4, conservando il testo dei blocchi e gli spazi nei commenti.
- Configuratore macchine con schede Porta, Trasmissione, Ricezione, Directory e Info versione. Profili locali importabili/esportabili in JSON. Sono incluse le sette configurazioni MCH già fornite.
- Porte COM reali, parità, bit dati/stop, DTR/RTS, handshake RTS/CTS e XON/XOFF anche combinati e con caratteri configurabili. L'invio viene avviato dall'utente dopo la scelta di macchina e porta.
- Ripristino della sessione e delle impostazioni da %LOCALAPPDATA%\Rama Edit. Il salvataggio dei file sul disco resta esplicito.

Dal primo avvio della versione 0.2.6 viene applicata la nuova palette ISO. L’eventuale palette precedente è conservata in palette-before-iso-reference.json nella cartella dei dati locali. Le personalizzazioni effettuate dopo l’aggiornamento vengono mantenute ai successivi avvii.

Le impostazioni modificate nel browser non sono accessibili automaticamente all'app nativa. Le sette macchine di partenza sono incluse; i cambi successivi si impostano nel configuratore nativo o si importano da un JSON con lo schema machines della versione web.

L'anteprima rappresenta percorsi geometrici: non esegue rimozione del materiale, verifiche di collisione o interpretazione completa di macro, sottoprogrammi e cicli specifici del controllo. L'invio conferma la scrittura sulla porta e non la ricezione effettiva sulla CNC.

## Compilazione e verifiche

Su Windows con SDK .NET 10:

    dotnet run --project native/RamaEdit.Core.Tests -c Release
    dotnet run --project native/RamaEdit.Windows
    dotnet publish native/RamaEdit.Windows -c Release -r win-x64 --self-contained true -o native/artifacts/win-x64

Il motore C# viene confrontato, segmento per segmento e passo per passo, con 25 programmi della versione TypeScript. I test coprono anche formattazione, utensili, filtri di ricezione, delimitatori ASCII e attesa XON con una porta simulata. La compilazione WPF può essere verificata su Linux con EnableWindowsTargeting; l'interfaccia viene eseguita e controllata dal workflow Windows, anche dopo un'installazione silenziosa. I risultati e le schermate sono allegati alla relativa esecuzione GitHub Actions.

Il workflow .github/workflows/windows.yml genera installer, ZIP portatile e SHA256 e li conserva come artefatti di test. Le release di prova richiedono una modifica esplicita della versione o la richiesta manuale; questi file non risolvono il blocco di Controllo intelligente delle app. La verifica MSIX usa un’identità tecnica e non produce un pacchetto installabile. Per ricompilare manualmente, apri **Actions → Rama Edit · Windows nativo → Run workflow**.

I dati iniziali e i casi di confronto si aggiornano dalla radice del repository con:

    npx vite-node scripts/export-native-data.ts
