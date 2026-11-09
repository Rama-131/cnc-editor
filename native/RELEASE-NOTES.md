Aggiornamento **Rama Edit 0.2.10 per Windows**.

- Interprete tornio Fanuc ampliato: G32/G33/G34, G50, G70–G76, G81–G89 e cicli modali G90/G92/G94 nei formati documentati.
- G71/G70 con archi nel profilo, G71 tipo I interno, G72 frontale e G73 a ripetizione. Angoli A, raccordi R e smussi C anche fuori dai cicli.
- Modalità separate Tornio Fanuc A e Tornio G90/91, conservate per documento, con cicli ISO G77/G78/G79 e descrizioni coerenti.
- G52, origini estese e modalità di controllo corsa/dinamica riconosciute. G28/G30/G53 distinguono i tratti macchina non determinabili: il disegno li omette e la lettura delle quote indica posizione sconosciuta fino alla ripresa su quote assolute.
- G41/G42 mostrano il profilo nominale e dichiarano che la compensazione reale della punta non è applicata.
- Nuovo pulsante Dettagli con codici del programma, note e limitazioni. Nuovi esempi Fanuc nella finestra Esempi.
- Controlli geometrici, prove analitiche, unità diametro/raggio/pollici, cicli modali e dati non validi; mantenuto il confronto con i 25 programmi precedenti. Verifiche dell’interfaccia e dell’installazione su Windows.

Il supporto riguarda i formati geometrici descritti nella [guida Fanuc](https://github.com/Rama-131/cnc-editor/blob/main/native/FANUC.md). Macro, tasche tipo II, funzioni opzionali e varianti che richiedono parametri macchina restano segnalate esplicitamente. Il simulatore non certifica l’esecuzione del programma sulla CNC.

Scaricare **RamaEdit-Setup-0.2.10-x64.exe**, chiudere Rama Edit e installare sopra la versione precedente. Programmi e impostazioni vengono conservati.

Versione di prova non firmata digitalmente.
