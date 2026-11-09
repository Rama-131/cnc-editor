namespace RamaEdit.Core;

public static class FanucSupport
{
    static readonly Dictionary<string, (string Title, string Description)> Codes = new()
    {
        ["G0"] = ("Posizionamento rapido", "Destinazione programmata in X/Z, assoluta oppure incrementale U/W. Percorso rapido geometrico; rampe macchina non modellate."),
        ["G1"] = ("Interpolazione lineare", "Tratti X/Z/U/W, angolo A con una sola quota e raccordi R o smussi ortogonali C tra due tratti lineari."),
        ["G2"] = ("Arco orario", "Archi e cerchi completi con centro I/K, oppure raggio R; X può essere a diametro o raggio. Centro sempre in distanze radiali."),
        ["G3"] = ("Arco antiorario", "Archi e cerchi completi con centro I/K, oppure raggio R; X può essere a diametro o raggio. Centro sempre in distanze radiali."),
        ["G4"] = ("Sosta", "Riconosciuta senza movimento geometrico. Il tempo reale della sosta non viene riprodotto."),
        ["G9"] = ("Arresto esatto nel blocco", "Geometria programmata conservata; arresto e accelerazioni non calcolati."),
        ["G10"] = ("Impostazione origine P0", "Supportata la forma G10 P0 X/Z oppure U/W. Tabelle correttori, L2/L10/L11 e altri formati richiedono i dati del controllo."),
        ["G17"] = ("Piano XY", "Seleziona il piano XY per gli archi. I cicli di tornitura richiedono G18."),
        ["G18"] = ("Piano ZX", "Piano di tornitura e dei cicli Fanuc. X è interpretata secondo Diametro/Raggio."),
        ["G19"] = ("Piano YZ", "Seleziona il piano YZ per gli archi. I cicli di tornitura richiedono G18."),
        ["G20"] = ("Programmazione in pollici", "Quote convertite in mm. Nei cicli Fanuc P/Q interi sono interpretati in incrementi di 0,0001 pollici."),
        ["G21"] = ("Programmazione in millimetri", "Nei cicli Fanuc P/Q interi sono interpretati in incrementi di 0,001 mm."),
        ["G22"] = ("Controllo limiti di corsa", "Impostazione riconosciuta senza movimento utensile. Limiti fisici macchina e collisioni non verificati."),
        ["G23"] = ("Annullamento controllo corsa", "Impostazione riconosciuta. L’anteprima non esegue verifiche dei limiti fisici macchina."),
        ["G27"] = ("Verifica riferimento macchina", "Punto intermedio programmato rappresentato quando noto. La verifica del riferimento fisico non viene effettuata."),
        ["G28"] = ("Ritorno al riferimento macchina", "Punto intermedio programmato rappresentato. Il ritorno macchina è omesso perché le quote del riferimento non sono configurate. La geometria riprende dopo un posizionamento assoluto noto."),
        ["G30"] = ("Ritorno al secondo riferimento", "Riconosciuto anche P2/P3/P4. Tratto macchina omesso quando il riferimento fisico non è noto."),
        ["G32"] = ("Filettatura a passo costante", "Percorso X/Z modale con F positivo. Proiezione geometrica: fase, sincronizzazione mandrino e sezione del filetto non modellate."),
        ["G33"] = ("Filettatura sincronizzata", "Percorso X/Z modale con F positivo. La sincronizzazione reale del mandrino non viene calcolata."),
        ["G34"] = ("Filettatura a passo variabile", "Percorso X/Z nominale con F/K. La variazione del passo nel tempo e la fase del mandrino non sono calcolate."),
        ["G40"] = ("Annullamento compensazione punta", "Riconosciuto. Il disegno rappresenta il profilo programmato."),
        ["G41"] = ("Compensazione punta a sinistra", "Riconosciuta mantenendo il profilo nominale. Senza tabella utensili, raggio e orientamento della punta non viene applicato lo spostamento del centro utensile."),
        ["G42"] = ("Compensazione punta a destra", "Riconosciuta mantenendo il profilo nominale. Senza tabella utensili, raggio e orientamento della punta non viene applicato lo spostamento del centro utensile."),
        ["G49"] = ("Annullamento compensazione lunghezza", "Riconosciuto nel profilo programmato."),
        ["G50"] = ("Limite giri / impostazione coordinate", "G50 S limita i giri. G50 X/Z imposta le coordinate mantenendo la posizione fisica del punto noto; nessun movimento viene aggiunto."),
        ["G52"] = ("Traslazione locale", "Impostazione X/Y/Z del sistema locale; G52 X0 Z0 annulla i relativi scostamenti. X segue Diametro/Raggio."),
        ["G53"] = ("Coordinate macchina", "Riconosciuto con X/Z assolute. Il tratto è omesso perché lo zero macchina rispetto allo zero pezzo non è configurato; l’anteprima lo segnala."),
        ["G54.1"] = ("Origini estese", "P1–P300 seleziona un’origine estesa. Visualizzazione nelle coordinate locali; le distanze reali tra zeri macchina richiedono le relative quote."),
        ["G60"] = ("Posizionamento unidirezionale", "Destinazione nominale rappresentata in rapido. Sovracorsa di accostamento e parametri del controllo non modellati."),
        ["G61"] = ("Modo arresto esatto", "Riconosciuto senza alterare il profilo. Tempi, frenate e accelerazioni non calcolati."),
        ["G63"] = ("Modo maschiatura", "Riconosciuto nel profilo programmato. Sincronizzazione e inversione reale del mandrino non calcolate."),
        ["G64"] = ("Modo percorso continuo", "Riconosciuto senza alterare il profilo nominale. Raccordi dinamici e tolleranze del controllo non applicati."),
        ["G70"] = ("Ciclo di finitura", "Richiamo del profilo P/Q con G0/G1/G2/G3, angoli A, raccordi R e smussi C; ritorno geometrico al punto di chiamata."),
        ["G71"] = ("Sgrossatura longitudinale", "Formato a due righe U/R e P/Q/U/W. Profili monotoni tipo I, esterni e interni, anche con archi e uscita oltre la quota X iniziale. Tasche tipo II e formati a una riga richiedono un interprete dedicato."),
        ["G72"] = ("Sgrossatura frontale", "Formato a due righe W/R e P/Q/U/W. Passate frontali su profilo monotono. Tasche tipo II non calcolate."),
        ["G73"] = ("Ripetizione profilo", "Prima riga U/W/R (sovrametalli radiali/assiali e numero passate), seconda P/Q/U/W. Ripetizioni con riduzione uniforme; forma reale del grezzo non modellata."),
        ["G74"] = ("Foratura/scanalatura frontale", "Due righe: G74 R..., poi Z/W, eventuale X/U e P/Q, F. Q è l’affondo assiale e P lo spostamento radiale in incrementi Fanuc. Scarico di fondo R nella seconda riga supportato solo a zero."),
        ["G75"] = ("Scanalatura radiale", "Due righe: G75 R..., poi X/U, eventuale Z/W e P/Q, F. P è l’affondo radiale, Q la spaziatura assiale, entrambi in incrementi Fanuc. Scarico di fondo R supportato solo a zero."),
        ["G76"] = ("Filettatura multipassata", "Formato a due righe Pmmrraa/Q/R e X/Z/R/P/Q/F. Profondità progressive, minimo Q e passate di finitura mm. Smusso finale rr diverso da zero richiede la geometria di uscita del controllo. Proiezione X/Z; penetrazione sui fianchi e sincronizzazione non modellate."),
        ["G77"] = ("Ciclo di tornitura ISO", "Disponibile in Tornio G90/91: equivalente geometrico del G90 del sistema A."),
        ["G78"] = ("Ciclo di filettatura ISO", "Disponibile in Tornio G90/91: equivalente geometrico del G92 del sistema A."),
        ["G79"] = ("Ciclo di sfacciatura ISO", "Disponibile in Tornio G90/91: equivalente geometrico del G94 del sistema A."),
        ["G80"] = ("Annullamento ciclo fisso", "Disattiva il ciclo modale. Specificare un nuovo movimento prima di programmare altre quote."),
        ["G81"] = ("Foratura assiale", "Proiezione Z del ciclo tornio. R è una distanza incrementale dal piano iniziale; F positivo richiesto. Ritorno geometrico al piano iniziale."),
        ["G82"] = ("Foratura con sosta", "Come G81 con P di sosta riconosciuto. Il tempo reale della sosta non viene riprodotto."),
        ["G83"] = ("Foratura assiale profonda", "Q intero in incrementi Fanuc, ritorni al piano R tra gli affondi. R incrementale dal piano iniziale; quote macchina di reingresso non modellate."),
        ["G84"] = ("Maschiatura assiale", "Percorso di ingresso/uscita in avanzamento. Piano R incrementale; sincronizzazione e inversione mandrino non modellate. Varianti con Q richiedono il formato del controllo."),
        ["G85"] = ("Alesatura assiale", "Entrata e uscita in avanzamento, poi ritorno al piano iniziale. R incrementale."),
        ["G86"] = ("Alesatura con arresto mandrino", "Ingresso in avanzamento e ritorno rapido. Arresto/orientamento fisico del mandrino non modellati."),
        ["G87"] = ("Foratura radiale profonda", "Affondi sull’asse X, fondo X/U, posizione Z/W, Q radiale in incrementi Fanuc. R incrementale radiale dal punto iniziale."),
        ["G88"] = ("Maschiatura radiale", "Percorso radiale X di ingresso/uscita. Sincronizzazione reale del mandrino non modellata. Varianti con Q richiedono il formato del controllo."),
        ["G89"] = ("Alesatura radiale", "Entrata/uscita radiale in avanzamento e ritorno al piano iniziale. Piano R incrementale."),
        ["G90"] = ("Ciclo di tornitura longitudinale", "In Fanuc A esegue avvicinamento, taglio, uscita e ritorno; può essere conico con R. Le quote dei blocchi successivi ripetono il ciclo."),
        ["G91"] = ("Quote incrementali ISO", "Disponibile in Tornio G90/91. In Fanuc A usare U/W per le quote incrementali."),
        ["G92"] = ("Ciclo di filettatura / limite giri", "In Fanuc A, X/Z e F eseguono il ciclo modale di filettatura, anche conico R. Per compatibilità, la forma separata G92 S imposta il limite giri."),
        ["G94"] = ("Ciclo di sfacciatura", "In Fanuc A esegue il ciclo di sfacciatura X/Z, anche conico R. In Tornio G90/91 seleziona invece avanzamento al minuto."),
        ["G95"] = ("Avanzamento al giro ISO", "Modo di avanzamento riconosciuto. Il simulatore geometrico non calcola i tempi reali."),
        ["G96"] = ("Velocità di taglio costante", "Riconosciuta con S. Giri effettivi e tempi macchina non calcolati; il limite S di G50/G92 viene conservato."),
        ["G97"] = ("Giri mandrino costanti", "Riconosciuto con S, senza effetti sulla forma del percorso."),
        ["G98"] = ("Avanzamento al minuto", "Modo Fanuc tornio. Non indica il piano di ritorno dei cicli come nella fresatura."),
        ["G99"] = ("Avanzamento al giro", "Modo Fanuc tornio. Non indica il piano R di ritorno come nella fresatura.")
    };
    public static CodeHelp? Find(string code, string system)
    {
        if (system != "A" && code == "G92") return new(code, "Impostazione coordinate / limite giri", "In Tornio G90/91, G92 X/Z imposta le coordinate del punto noto senza spostarlo; G92 S imposta il limite mandrino.");
        if (Codes.TryGetValue(code, out var value)) return new(code, value.Title, value.Description);
        return null;
    }
}
