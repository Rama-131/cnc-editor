export type Machine = "mill" | "lathe";
const common: Record<string, [string, string]> = {
  G0: [
    "Posizionamento rapido",
    "Sposta gli assi alla velocità di rapido. Il percorso reale può dipendere dal controllo.",
  ],
  G1: [
    "Interpolazione lineare",
    "Muove gli assi lungo una linea retta con l’avanzamento F programmato.",
  ],
  G2: [
    "Arco in senso orario",
    "Interpolazione circolare oraria sul piano attivo, con centro I/J/K oppure raggio R.",
  ],
  G3: [
    "Arco in senso antiorario",
    "Interpolazione circolare antioraria sul piano attivo, con centro I/J/K oppure raggio R.",
  ],
  G4: [
    "Sosta temporizzata",
    "Introduce una pausa. Le unità del parametro P dipendono dal controllo.",
  ],
  G10: [
    "Impostazione dati programmata",
    "Scrive dati di origine o correttori secondo il controllo e i parametri del blocco. L’anteprima supporta G10 P0 per lo spostamento origine del tornio Fanuc; altre forme non sono simulate.",
  ],
  G17: ["Piano XY", "Seleziona il piano XY per le interpolazioni circolari."],
  G18: [
    "Piano ZX",
    "Seleziona il piano ZX, normalmente utilizzato sul tornio.",
  ],
  G19: ["Piano YZ", "Seleziona il piano YZ per le interpolazioni circolari."],
  G20: ["Programmazione in pollici", "Interpreta le quote in pollici."],
  G21: ["Programmazione in millimetri", "Interpreta le quote in millimetri."],
  G28: [
    "Ritorno al riferimento",
    "Ritorna al riferimento macchina passando per un punto intermedio. Non simulato.",
  ],
  G40: [
    "Annullamento compensazione",
    "Disattiva la compensazione raggio utensile o punta.",
  ],
  G41: [
    "Compensazione a sinistra",
    "Attiva la compensazione utensile a sinistra del percorso. Non simulata.",
  ],
  G42: [
    "Compensazione a destra",
    "Attiva la compensazione utensile a destra del percorso. Non simulata.",
  ],
  G43: [
    "Compensazione lunghezza positiva",
    "Applica la lunghezza utensile selezionata con H. Non simulata.",
  ],
  G49: [
    "Annullamento lunghezza utensile",
    "Annulla la compensazione lunghezza utensile.",
  ],
  G53: [
    "Coordinate macchina",
    "Programma un movimento nel sistema di coordinate macchina. Non simulato.",
  ],
  G54: [
    "Origine pezzo 1",
    "Seleziona il sistema di coordinate pezzo G54. La vista mostra coordinate locali, senza offset macchina.",
  ],
  G55: ["Origine pezzo 2", "Seleziona il sistema di coordinate pezzo G55."],
  G56: ["Origine pezzo 3", "Seleziona il sistema di coordinate pezzo G56."],
  G57: ["Origine pezzo 4", "Seleziona il sistema di coordinate pezzo G57."],
  G58: ["Origine pezzo 5", "Seleziona il sistema di coordinate pezzo G58."],
  G59: ["Origine pezzo 6", "Seleziona il sistema di coordinate pezzo G59."],
  G80: ["Annullamento ciclo fisso", "Disattiva i cicli fissi di lavorazione."],
  G81: ["Ciclo di foratura", "Ciclo fisso di foratura. Non simulato."],
  G83: [
    "Foratura profonda",
    "Ciclo di foratura con scarico del truciolo. Non simulato.",
  ],
  G84: ["Maschiatura", "Ciclo fisso di maschiatura. Non simulato."],
  G90: [
    "Quote assolute",
    "Le coordinate sono riferite all’origine pezzo attiva.",
  ],
  G91: [
    "Quote incrementali",
    "Le coordinate sono relative alla posizione corrente.",
  ],
  G94: ["Avanzamento al minuto", "Interpreta F come avanzamento al minuto."],
  G95: [
    "Avanzamento al giro",
    "Interpreta F come avanzamento per giro mandrino.",
  ],
  G96: [
    "Velocità di taglio costante",
    "Regola i giri mandrino per mantenere costante la velocità di taglio.",
  ],
  G97: [
    "Giri mandrino costanti",
    "Interpreta S come numero di giri al minuto.",
  ],
  G98: [
    "Ritorno al piano iniziale",
    "Nei cicli di fresatura, ritorna al piano iniziale.",
  ],
  G99: [
    "Ritorno al piano R",
    "Nei cicli di fresatura, ritorna al piano di riferimento R.",
  ],
  M0: ["Arresto programmato", "Arresta il programma in attesa dell’operatore."],
  M1: [
    "Arresto opzionale",
    "Arresta il programma se l’opzione arresto opzionale è attiva.",
  ],
  M2: ["Fine programma", "Termina il programma."],
  M3: ["Mandrino orario", "Avvia il mandrino in senso orario."],
  M4: ["Mandrino antiorario", "Avvia il mandrino in senso antiorario."],
  M5: ["Arresto mandrino", "Ferma il mandrino."],
  M6: [
    "Cambio utensile",
    "Richiede un cambio utensile secondo la logica della macchina.",
  ],
  M7: [
    "Refrigerante nebulizzato",
    "Attiva il refrigerante nebulizzato, se previsto.",
  ],
  M8: ["Refrigerante attivo", "Attiva il refrigerante."],
  M9: ["Refrigerante spento", "Disattiva il refrigerante."],
  M19: [
    "Orientamento mandrino",
    "Orienta il mandrino nella posizione prevista dal controllo.",
  ],
  M30: [
    "Fine e riavvolgimento",
    "Termina il programma e lo predispone per una nuova esecuzione.",
  ],
  M98: ["Richiamo sottoprogramma", "Esegue un sottoprogramma. Non simulato."],
  M99: [
    "Ritorno da sottoprogramma",
    "Ritorna al programma chiamante o ripete il programma. Non simulato.",
  ],
};
const turning: Record<string, [string, string]> = {
  M26: [
    "Contropunta avanti",
    "Nella configurazione tornio di questa app comanda la contropunta avanti, secondo la funzione indicata per la macchina. L’anteprima registra il blocco senza rappresentare il movimento della contropunta. L’associazione M26 dipende dal costruttore e non è universale Fanuc.",
  ],
  G10: [
    "Spostamento origine programmato",
    "Su tornio Fanuc, G10 P0 imposta lo spostamento esterno dell’origine: X/Z sono valori assoluti, U/W sono variazioni incrementali. Non muove gli assi e non seleziona G54. L’anteprima supporta questa forma, con shift iniziale e ingresso convenzionali a zero; altre forme G10 non sono simulate.",
  ],
  G90: [
    "Ciclo di tornitura longitudinale",
    "Su molti torni Fanuc è un ciclo di tornitura, non la selezione di quote assolute. Non simulato.",
  ],
  G92: [
    "Ciclo di filettatura / limite giri",
    "Nella configurazione tornio di questa app, G92 S imposta il limite giri mandrino; ad esempio G92 S1200 limita a 1200 giri/min. L’anteprima registra il limite senza calcolare tempi o giri effettivi. Le forme con coordinate possono indicare cicli di filettatura e non sono simulate.",
  ],
  G50: [
    "Limite giri / coordinate",
    "Sul tornio può limitare i giri massimi. La funzione dipende dal controllo; non simulata.",
  ],
  G70: [
    "Ciclo di finitura",
    "Ripete il profilo definito da P e Q. Non simulato.",
  ],
  G71: [
    "Sgrossatura longitudinale",
    "Ciclo di sgrossatura del profilo. Non simulato.",
  ],
  G72: ["Sgrossatura frontale", "Ciclo di sgrossatura frontale. Non simulato."],
  G73: [
    "Ripetizione profilo",
    "Ciclo di ripetizione del profilo. Non simulato.",
  ],
  G74: [
    "Foratura / scanalatura frontale",
    "Ciclo dipendente dal controllo. Non simulato.",
  ],
  G75: ["Scanalatura radiale", "Ciclo di scanalatura radiale. Non simulato."],
  G76: [
    "Filettatura multipassata",
    "Ciclo di filettatura a più passate. Non simulato.",
  ],
  G98: [
    "Avanzamento al minuto",
    "Su tornio Fanuc, F esprime l’avanzamento al minuto.",
  ],
  G99: [
    "Avanzamento al giro",
    "Su tornio Fanuc, F esprime l’avanzamento per giro.",
  ],
};
export function normalizeCode(code: string) {
  return code.toUpperCase().replace(/^([GM])0+(?=\d)/, "$1");
}
export function codeInfo(code: string, machine: Machine) {
  const key = normalizeCode(code);
  const item = (machine === "lathe" ? turning[key] : undefined) ?? common[key];
  return item
    ? { code: key, title: item[0], description: item[1] }
    : {
        code: key,
        title: "Codice specifico del controllo",
        description:
          "Consulta il manuale della macchina: significato e disponibilità possono variare con serie, opzioni e costruttore.",
      };
}
