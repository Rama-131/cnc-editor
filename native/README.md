# Rama Edit per Windows

Applicazione nativa in C#/.NET 10 e WPF, con editor AvalonEdit e porte COM gestite da Windows. Funziona offline; l'installer comprende il runtime .NET. La versione web resta disponibile allo stesso indirizzo.

## Installazione

Su Windows 10/11 a 64 bit, scarica **RamaEdit-Setup-0.2.2-x64.exe** dalla [versione Windows](https://github.com/Rama-131/cnc-editor/releases/tag/windows-v0.2.2), eseguilo e apri **Rama Edit** dal desktop o dal menu Start. La versione ZIP si estrae in una cartella e si avvia con RamaEdit.exe.

L'installer di questa prima versione non è firmato digitalmente: Windows potrebbe chiedere conferma dell'autore. Non richiede i permessi di amministratore. La versione è pubblicata come **versione di prova**, con compilazione e test di avvio su Windows; il collegamento RS232 va verificato sul PC con il proprio adattatore e controllo CNC.

## Funzioni

- Editor a schede, scheda attiva blu, nuovi programmi TXT, chiusura con protezione delle modifiche e cronologia separata per documento.
- Apri file multipli, trascina file nella finestra, Salva e Salva con nome tramite finestre Windows, stampa del programma completo o della lista utensili.
- Colori vivaci per codici, commenti verde acceso, colori personalizzabili, descrizioni G/M al passaggio del mouse.
- Aggiungi spazi, imposta valori F/S (anche nella selezione), trova precedente/successivo, sostituisci, ricerca con parola intera/maiuscole/espressioni regolari e navigazione dei cambi utensile.
- Lista utensili con descrizioni, correttori e preselezioni, esportabile in TXT e stampabile.
- Anteprima geometrica fresatrice/tornio, piani 3D/XY/XZ/YZ, X a diametro o raggio, avanzamento con evidenziazione della riga, zoom con rotella e trascinamento, origine attiva G54–G59 e G10 P0.
- G0/G1, archi G2/G3, unità e quote modali, G71 tipo I a due righe con A/R e G70 sul profilo già definito. G92 S come limite mandrino e M26 come stato contropunta. Le funzioni non supportate interrompono l'anteprima, conservando la parte già calcolata.
- Pagine Trasmissione e Ricezione con testo a tutta larghezza e comandi nella barra superiore. File ricevuto separato, salvataggio che conserva CR/LF, filtri e trigger, timeout, arresto e recupero del testo dopo un errore.
- Configuratore macchine con schede Porta, Trasmissione, Ricezione, Directory e Info versione. Profili locali importabili/esportabili in JSON. Sono incluse le sette configurazioni MCH già fornite.
- Porte COM reali, parità, bit dati/stop, DTR/RTS, handshake RTS/CTS e XON/XOFF anche combinati e con caratteri configurabili. L'invio viene avviato dall'utente dopo la scelta di macchina e porta.
- Ripristino della sessione e delle impostazioni da %LOCALAPPDATA%\Rama Edit. Il salvataggio dei file sul disco resta esplicito.

Le impostazioni modificate nel browser non sono accessibili automaticamente all'app nativa. Le sette macchine di partenza sono incluse; i cambi successivi si impostano nel configuratore nativo o si importano da un JSON con lo schema machines della versione web.

L'anteprima rappresenta percorsi geometrici: non esegue rimozione del materiale, verifiche di collisione o interpretazione completa di macro, sottoprogrammi e cicli specifici del controllo. L'invio conferma la scrittura sulla porta e non la ricezione effettiva sulla CNC.

## Compilazione e verifiche

Su Windows con SDK .NET 10:

    dotnet run --project native/RamaEdit.Core.Tests -c Release
    dotnet run --project native/RamaEdit.Windows
    dotnet publish native/RamaEdit.Windows -c Release -r win-x64 --self-contained true -o native/artifacts/win-x64

Il motore C# viene confrontato, segmento per segmento e passo per passo, con 25 programmi della versione TypeScript. I test coprono anche formattazione, utensili, filtri di ricezione, delimitatori ASCII e attesa XON con una porta simulata. La compilazione WPF può essere verificata su Linux con EnableWindowsTargeting; l'interfaccia viene eseguita e controllata dal workflow Windows, anche dopo un'installazione silenziosa. I risultati e le schermate sono allegati alla relativa esecuzione GitHub Actions.

Il workflow .github/workflows/windows.yml genera installer, ZIP portatile e SHA256 e li pubblica nella release di prova solo quando i controlli passano. Per ricompilare manualmente, apri **Actions → Rama Edit · Windows nativo → Run workflow**.

I dati iniziali e i casi di confronto si aggiornano dalla radice del repository con:

    npx vite-node scripts/export-native-data.ts
