Aggiornamento **Rama Edit 0.2.13 per Windows**.

Correzioni alla trasmissione RS-232, dopo la segnalazione sul Mazak HTC 400:

- Rispettato il tempo limite zero del profilo originale: nessun timeout aggiuntivo di 30 secondi imposto dal driver.
- Ripristinata l’opzione USEPARITY=0 del vecchio trasmettitore: la sola segnalazione di parità ricevuta viene registrata senza fermare l’invio. Il formato del collegamento rimane 7 bit, parità pari, 2 stop. La verifica può essere attivata in Impostazioni macchine → Porta. Gli altri errori seriali continuano a interrompere il trasferimento.
- Coda di trasmissione limitata: l’app attende l’uscita di ciascun frammento, rispetta le pause XON/XOFF insieme al CTS e svuota la coda su annullamento o errore. Il completamento viene mostrato dopo lo svuotamento della coda del driver.
- La causa originale dell’errore resta visibile e viene registrata in **Dati ricevuti**, insieme a macchina, porta, parametri e segnali di flusso.
- Aggiunte prove automatiche con il profilo Mazak, pause XON/XOFF, CTS, annullamento ed errori. Verificata la configurazione del driver Windows senza aprire una porta fisica. La trasmissione sulla macchina reale deve essere verificata dall’utilizzatore.

Scaricare **RamaEdit-Setup-0.2.13-x64.exe**, chiudere Rama Edit e installare sopra la versione precedente. Programmi e impostazioni vengono conservati, inclusa la porta COM scelta dall’utente.

Versione di prova non firmata digitalmente.
