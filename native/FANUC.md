# Tornitura Fanuc in Rama Edit

La simulazione rappresenta il percorso programmato, proiettato nello spazio XYZ. Non è un emulatore completo del controllo Fanuc: serie, sistema di codici, parametri e opzioni cambiano il significato di alcune istruzioni. Non esegue controlli di collisione, rimozione del materiale o calcolo dei tempi reali.

## Scelta del sistema

Nel selettore della simulazione:

- **Tornio Fanuc A**: G90 tornitura, G92 filettatura, G94 sfacciatura. Incrementi con U/W.
- **Tornio G90/91**: G90 assoluto e G91 incrementale; cicli equivalenti G77/G78/G79. G94/G95 selezionano il modo di avanzamento.

La scelta è conservata per ogni documento nella sessione. La selezione X a diametro/raggio resta indipendente. I/J/K, raccordi e profondità radiali dei cicli non vengono dimezzati quando X è a diametro.

## Funzioni e formati

| Codici                 | Comportamento dell’anteprima                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0–G3                  | Rapidi, linee e archi, anche completi con centro; piani G17/G18/G19.                                                                                                                                          |
| G1 A/R/C               | Angolo A con una sola quota; raccordo R tra due tratti lineari; C per smussi ortogonali.                                                                                                                      |
| G4, G9, G61, G63, G64  | Riconosciuti sul profilo; soste, accelerazioni e comportamento dinamico non riprodotti.                                                                                                                       |
| G10 P0                 | Impostazione origine X/Z o U/W già supportata. Altri L/P non equivalgono a questo formato.                                                                                                                    |
| G20/G21                | Pollici/mm.                                                                                                                                                                                                   |
| G22/G23                | Impostazione controllo corsa riconosciuta, senza verifiche dei limiti macchina.                                                                                                                               |
| G27                    | Punto intermedio rappresentato; verifica fisica del riferimento non eseguita.                                                                                                                                 |
| G28/G30/G53            | Riconosciuti. I tratti con coordinate macchina sconosciute sono omessi e segnalati. L’anteprima riprende dopo quote assolute note degli assi interessati; le quote sconosciute sono mostrate con un trattino. |
| G32/G33/G34            | Filettatura X/Z modale con F positivo. Sincronizzazione, fase e variazione temporale del passo non riprodotte.                                                                                                |
| G40/G41/G42/G49        | Profilo nominale. Compensazioni reali e orientamento della punta richiedono la tabella utensili.                                                                                                              |
| G50                    | S per limite giri; X/Z per impostazione coordinate senza spostamento fisico.                                                                                                                                  |
| G52                    | Traslazione locale X/Y/Z; annullamento con quote zero.                                                                                                                                                        |
| G54–G59, G54.1 P1–P300 | Origini locali. Distanze fisiche tra i diversi zeri macchina non configurate.                                                                                                                                 |
| G60                    | Destinazione nominale in rapido; accostamento unidirezionale non modellato.                                                                                                                                   |
| G70                    | Richiamo del profilo P/Q con linee, archi e disegno diretto.                                                                                                                                                  |
| G71                    | Due righe U/R e P/Q/U/W/F. Tipo I monotono esterno o interno, anche con archi.                                                                                                                                |
| G72                    | Due righe W/R e P/Q/U/W/F. Sgrossatura frontale tipo I monotona.                                                                                                                                              |
| G73                    | Prima riga U/W/R: scostamenti radiale/assiale e numero di passate. Seconda P/Q/U/W/F. Riduzione uniforme degli scostamenti, senza modello del grezzo.                                                         |
| G74                    | Prima riga R di ritiro; seconda Z/W, eventuale X/U, P/Q e F. Affondi assiali Q, stazioni radiali P.                                                                                                           |
| G75                    | Prima riga R; seconda X/U, eventuale Z/W, P/Q e F. Affondi radiali P, stazioni assiali Q.                                                                                                                     |
| G76                    | Due righe: Pmmrraa/Q/R, poi X/Z/R/P/Q/F. Passate progressive, profondità minima e ripetizioni di finitura. Formato di uscita rr=00.                                                                           |
| G81/G82/G83            | Foratura assiale semplice, con sosta o profonda. G83 scarica al piano R tra gli affondi Q.                                                                                                                    |
| G84/G85/G86            | Maschiatura/alesatura assiale in proiezione; sincronizzazione, soste e orientamento mandrino non riprodotti.                                                                                                  |
| G87/G88/G89            | Equivalenti radiali X per foratura, maschiatura e alesatura.                                                                                                                                                  |
| G80                    | Annullamento ciclo; consentito insieme a un nuovo movimento G0/G1.                                                                                                                                            |
| G90/G92/G94            | Cicli modali del sistema A, rettilinei o conici con R; ritorno al punto iniziale.                                                                                                                             |
| G77/G78/G79            | Cicli equivalenti nella modalità ISO G90/G91.                                                                                                                                                                 |
| G95–G99                | Modi di avanzamento/mandrino riconosciuti; giri effettivi e tempi non calcolati. G98/G99 sul tornio non selezionano il piano di ritorno come nella fresatura.                                                 |

Nei profili tipo I il tratto finale può oltrepassare la quota X iniziale senza creare una tasca: per esempio, una sgrossatura interna può uscire nel foro già aperto. Le passate di sgrossatura sono fermate alla prima intersezione con il profilo; i cambi di direzione che richiedono il tipo II restano segnalati.

Disattivando **Rapidi**, il centraggio considera soltanto i movimenti di lavorazione. I posizionamenti e i parcheggi restano nel programma e nella simulazione, disponibili riattivando la casella.

## Unità P/Q e piano R

Nei cicli Fanuc con P/Q interi, un incremento vale **0,001 mm** in G21 oppure **0,0001 pollici** in G20. Per esempio Q3000 in G74 significa 3 mm di affondo assiale; P2000 in G75 significa 2 mm radiali, anche con X a diametro.

Nei cicli G81–G89 del tornio il piano R è interpretato come **distanza incrementale dal piano iniziale**. Per esempio, partendo da Z5, R-3 seleziona Z2. Questo formato va distinto da altre convenzioni presenti su fresatrici o controlli compatibili.

## Limiti dichiarati

- G71/G72 tipo II con tasche e formati di sgrossatura a una sola riga non sono calcolati.
- G74/G75 con scarico di fondo R nella seconda riga diverso da zero richiedono il formato specifico del controllo.
- G76 con smusso di uscita rr diverso da 00 richiede geometria e parametri del controllo. Il modello mostra passate radiali nominali e non calcola penetrazione sui fianchi, fase o sincronizzazione reale del filetto.
- Varianti di maschiatura con Q, utensili motorizzati, asse C, interpolazione polare/cilindrica, rotazioni/scalature e tastatura richiedono un modello dedicato.
- Macro, variabili, istruzioni condizionali e chiamate di sottoprogramma M98/M99 non eseguite non vengono sostituite con movimenti inventati: l’anteprima si interrompe con il numero di riga.
- G41/G42 non generano il percorso compensato del centro utensile. Sono necessari raggio e orientamento della punta, correttori e regole del controllo.

Il pulsante **Dettagli** mostra il sistema selezionato, tutti i codici G presenti nel programma, il primo errore e le note sui tratti o sulle funzioni non calcolabili. Un messaggio di anteprima completa significa che il percorso geometrico supportato è stato interpretato; non certifica che il programma sia eseguibile o privo di collisioni sulla macchina.

Gli esempi G71 con archi, G72, G73, G74/G75, G76, G83 e ISO G90/G91 sono disponibili nel pulsante **Esempi**. Sono dimostrazioni dell’interprete e non programmi pronti per una macchina reale.
