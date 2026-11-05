# Rama Edit: distribuzione con Microsoft Store

## Perché l'EXE viene bloccato

Controllo intelligente delle app di Windows 11 blocca il codice sconosciuto e non firmato. La versione EXE 0.2.2 è un prototipo non firmato: il blocco può essere completo, senza un'autorizzazione per quella singola app. Lo ZIP contiene lo stesso eseguibile privo di firma e non risolve il problema.

I test di avvio su un runner Windows controllano il funzionamento dell'applicazione; non certificano la sua reputazione né riproducono la policy di Controllo intelligente delle app sul PC dell'utente.

La soluzione di distribuzione richiede un'identità verificata e una firma riconosciuta. Un certificato creato autonomamente non equivale a una firma riconosciuta per la distribuzione pubblica.

## Percorso per un autore privato in Italia

Il servizio pubblico Microsoft Artifact Signing permette attualmente la validazione di sviluppatori individuali solo negli Stati Uniti e in Canada. Le organizzazioni hanno una disponibilità geografica più ampia. Per il progetto personale indicato dall'utente italiano, il percorso predisposto è quindi il pacchetto MSIX per Microsoft Store.

L'account individuale deve essere coerente con i requisiti Microsoft per progetti personali/non commerciali. La scelta dell'account e i dati dell'autore sono verificati direttamente da Microsoft.

1. Aprire [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com).
2. Usare il nuovo percorso **Get started for free → Individual developer** e accedere con il proprio account Microsoft. Secondo la documentazione Microsoft, questo percorso non applica quote di registrazione; i vecchi collegamenti diretti a Partner Center possono mostrare il flusso precedente.
3. Completare la verifica con documento e selfie sul sito Microsoft e arrivare al pannello **Apps & Games**.
4. Creare l'app e riservare il nome **Rama Edit**, se disponibile.
5. In **Product management → Product identity**, copiare i tre dati pubblici assegnati: **Package/Identity/Name**, **Package/Identity/Publisher** e **Package/Properties/PublisherDisplayName**.
6. In GitHub aprire **Actions → Rama Edit · Pacchetto Microsoft Store → Run workflow** e indicare quei tre valori.
7. Scaricare l'artefatto **RamaEdit-da-caricare-in-Partner-Center** e caricare il relativo MSIX nella submission di Rama Edit. Completare scheda dell'app, descrizione, immagini, requisiti di privacy e giustificazione della capability desktop, seguendo le richieste effettive del portale.
8. Dopo la certificazione e la pubblicazione Microsoft, distribuire il collegamento Store. Il pacchetto finale viene firmato nel percorso Store; la sola creazione del MSIX locale non rimuove il blocco.

La verifica dell'identità e l'accettazione delle condizioni richiedono l'azione del titolare dell'account. Il progetto non contiene password, documenti o credenziali Microsoft.

## Stato del pacchetto

Il manifest e lo script sono predisposti, con icone, runtime .NET incluso, capability desktop runFullTrust e versionamento ricavato dal progetto. La capability serve all'editor WPF e all'accesso Win32 ai file e alle porte COM; la motivazione da riportare nella submission è la gestione diretta, avviata dall'utente, dei programmi CNC e dei trasferimenti seriali.

Il workflow Windows verifica il formato con MakeAppx usando un'identità tecnica esplicitamente chiamata **RamaEdit.PackageValidation**. Quel pacchetto è solo un controllo della struttura, non è installabile e non va caricato nello Store. Il workflow manuale richiede invece l'identità reale fornita da Partner Center.

Non sono ancora completate la registrazione dell'autore, l'assegnazione dell'identità dell'app e la certificazione Store. Non è ancora disponibile una nuova versione firmata/installabile sul PC con il blocco segnalato.

## Riferimenti Microsoft

- [Smart App Control](https://learn.microsoft.com/windows/apps/develop/smart-app-control/overview)
- [Firma per Smart App Control](https://learn.microsoft.com/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control)
- [Disponibilità geografica di Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/quickstart#prerequisites)
- [Registrazione di un account sviluppatore](https://learn.microsoft.com/windows/apps/publish/partner-center/open-a-developer-account?tabs=individual)
