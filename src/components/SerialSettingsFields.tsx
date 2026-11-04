import { useEffect, useState } from "react";
import {
  Cable,
  Send,
  Download,
  FolderOpen,
  Info,
  RotateCcw,
} from "lucide-react";
import {
  baudRates,
  blockDelays,
  type MachineProfile,
} from "../lib/machineProfiles";
import type { SerialSettings } from "../lib/serial";
import {
  defaultSerial,
  getSerial,
  usesHardwareFlow,
  usesSoftwareFlow,
} from "../lib/serial";
import {
  portOptions,
  transmitOptions,
  receiveOptions,
  directoryOptions,
} from "../lib/serialOptions";
import {
  canChooseDirectory,
  chooseMachineDirectory,
  machineDirectory,
  storeDirectory,
  type Direction,
} from "../lib/machineFiles";

function TextField({
  label,
  value,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="text"
        maxLength={4096}
        value={value}
        spellCheck={false}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  hint?: string;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={0}
        max={max}
        step={1}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : +e.target.value)
        }
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function CheckField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="check-label">
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
const tabs = [
  ["Porta", Cable],
  ["Trasmissione", Send],
  ["Ricezione", Download],
  ["Directory", FolderOpen],
  ["Info versione", Info],
] as const;
export function SerialSettingsFields({
  profile,
  locked,
  saved,
  onChange,
}: {
  profile: MachineProfile;
  locked: boolean;
  saved: boolean;
  onChange: (settings: SerialSettings) => void;
}) {
  const [tab, setTab] = useState<string>("Porta");
  const [folderNames, setFolderNames] = useState<
    Partial<Record<Direction, string>>
  >({});
  const [folderMessage, setFolderMessage] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const s = profile.settings,
    p = portOptions(s),
    t = transmitOptions(s),
    r = receiveOptions(s),
    d = directoryOptions(s);
  const update = <K extends keyof SerialSettings>(
    key: K,
    value: SerialSettings[K],
  ) => onChange({ ...s, [key]: value });
  const tx = <K extends keyof typeof t>(key: K, value: (typeof t)[K]) =>
    update("transmit", { ...t, [key]: value });
  const rx = <K extends keyof typeof r>(key: K, value: (typeof r)[K]) =>
    update("receive", { ...r, [key]: value });
  const port = <K extends keyof typeof p>(key: K, value: (typeof p)[K]) =>
    update("port", { ...p, [key]: value });
  useEffect(() => {
    setTab("Porta");
    setFolderMessage("");
    setFolderNames({});
  }, [profile.id]);
  useEffect(() => {
    let current = true;
    void Promise.all(
      ["send", "receive"].map(async (direction) => {
        try {
          const folder = await machineDirectory(
            profile.id,
            direction as Direction,
          );
          if (current)
            setFolderNames((prev) => ({ ...prev, [direction]: folder?.name }));
        } catch {
          if (current)
            setFolderMessage(
              "Il browser non consente di conservare le cartelle. Apri e Salva useranno le finestre standard.",
            );
        }
      }),
    );
    return () => {
      current = false;
    };
  }, [profile.id]);
  async function chooseFolder(direction: Direction, clear = false) {
    setFolderBusy(true);
    setFolderMessage("");
    try {
      const folder = clear
        ? (await storeDirectory(profile.id, direction), undefined)
        : await chooseMachineDirectory(profile.id, direction);
      setFolderNames((prev) => ({ ...prev, [direction]: folder?.name }));
      setFolderMessage("Preferenza cartella salvata per questa macchina.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setFolderMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setFolderBusy(false);
    }
  }
  return (
    <div className="rs232-settings">
      <nav className="rs232-nav" aria-label="Sezioni impostazioni RS232">
        {tabs.map(([name, Icon]) => (
          <button
            type="button"
            key={name}
            aria-pressed={tab === name}
            className={tab === name ? "active" : ""}
            onClick={() => setTab(name)}
          >
            <Icon size={17} />
            {name}
          </button>
        ))}
      </nav>
      <div className="rs232-page" role="region" aria-label={`Parametri ${tab}`}>
        <div className="rs232-title">
          <h3>{tab}</h3>
          {tab !== "Info versione" && (
            <button
              type="button"
              className="button"
              disabled={locked}
              onClick={() => {
                if (
                  !window.confirm(
                    `Ripristinare i parametri predefiniti della sezione ${tab}?`,
                  )
                )
                  return;
                if (tab === "Porta")
                  onChange({
                    ...s,
                    baudRate: defaultSerial.baudRate,
                    dataBits: defaultSerial.dataBits,
                    stopBits: defaultSerial.stopBits,
                    parity: defaultSerial.parity,
                    flowControl: defaultSerial.flowControl,
                    port: undefined,
                  });
                else if (tab === "Trasmissione")
                  onChange({
                    ...s,
                    lineEnding: defaultSerial.lineEnding,
                    delay: defaultSerial.delay,
                    wrap: defaultSerial.wrap,
                    transmit: undefined,
                  });
                else if (tab === "Ricezione") update("receive", undefined);
                else update("directories", undefined);
              }}
            >
              <RotateCcw size={14} />
              Predefiniti
            </button>
          )}
        </div>
        {tab === "Porta" && (
          <fieldset disabled={locked} className="serial-fields rs232-fields">
            <h4>Impostazioni porta seriale</h4>
            <div className="full port-choice">
              <Cable size={20} />
              <div>
                <strong>Porta COM del PC Windows</strong>
                <p>
                  {profile.importedFrom?.port
                    ? `Porta nel trasmettitore precedente: ${profile.importedFrom.port}. Scegli la porta corrispondente nella finestra del browser al collegamento.`
                    : "Seleziona COM3, COM4 o il tuo adattatore dalla finestra del browser quando colleghi la macchina."}
                </p>
              </div>
              <span>
                {getSerial()
                  ? "Selezione al collegamento"
                  : "Richiede Chrome o Edge"}
              </span>
            </div>
            <label>
              Baud rate
              <select
                value={s.baudRate}
                onChange={(e) => update("baudRate", +e.target.value)}
              >
                {baudRates.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Bit di stop
              <select
                value={s.stopBits}
                onChange={(e) => update("stopBits", +e.target.value as 1 | 2)}
              >
                <option>1</option>
                <option>2</option>
              </select>
            </label>
            <label>
              Parità
              <select
                value={s.parity}
                onChange={(e) =>
                  update("parity", e.target.value as SerialSettings["parity"])
                }
              >
                <option value="even">Pari (Even)</option>
                <option value="odd">Dispari (Odd)</option>
                <option value="none">Nessuna</option>
              </select>
            </label>
            <label>
              Bit dati
              <select
                value={s.dataBits}
                onChange={(e) => update("dataBits", +e.target.value as 7 | 8)}
              >
                <option>7</option>
                <option>8</option>
              </select>
            </label>
            <h4>Controllo di flusso</h4>
            <label>
              Controllo di flusso
              <select
                value={s.flowControl}
                onChange={(e) =>
                  onChange({
                    ...s,
                    flowControl: e.target
                      .value as SerialSettings["flowControl"],
                    ...(!["software", "both"].includes(e.target.value) &&
                    t.waitForXon
                      ? { transmit: { ...t, waitForXon: false } }
                      : {}),
                  })
                }
              >
                <option value="software">Software · XON / XOFF</option>
                <option value="hardware">Hardware · RTS / CTS</option>
                <option value="both">
                  Software + Hardware · XON/XOFF + RTS/CTS
                </option>
                <option value="none">Nessuno</option>
              </select>
            </label>
            {(
              [
                ["dtr", "Attiva DTR"],
                ["rts", "Attiva RTS"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <select
                  aria-label={label}
                  value={p[key] === null ? "auto" : String(p[key])}
                  disabled={key === "rts" && usesHardwareFlow(s)}
                  onChange={(e) =>
                    port(
                      key,
                      e.target.value === "auto"
                        ? null
                        : e.target.value === "true",
                    )
                  }
                >
                  <option value="auto">Automatico · driver</option>
                  <option value="true">Attivo</option>
                  <option value="false">Disattivo</option>
                </select>
                {key === "rts" && usesHardwareFlow(s) && (
                  <small>RTS gestito dal driver in modalità hardware.</small>
                )}
              </label>
            ))}
            <h4>Avanzate</h4>
            <TextField
              label="Carattere XON"
              value={p.xon}
              onChange={(v) => port("xon", v)}
            />
            <TextField
              label="Carattere XOFF"
              value={p.xoff}
              onChange={(v) => port("xoff", v)}
            />
            <p className="field-hint full">
              Codici ASCII decimali: \17 = XON, \19 = XOFF, \13\10 = CR/LF. La
              parità scelta sopra viene verificata dal driver. Il browser non
              espone il singolo byte errato: la sostituzione con # non è
              disponibile; un errore di porta interrompe l’acquisizione e
              conserva i dati ricevuti.
            </p>
          </fieldset>
        )}
        {tab === "Trasmissione" && (
          <fieldset disabled={locked} className="serial-fields rs232-fields">
            <h4>Impostazioni trasmissione</h4>
            <label>
              Fine riga
              <select
                value={s.lineEnding}
                disabled={t.customLineEnding}
                onChange={(e) =>
                  update(
                    "lineEnding",
                    e.target.value as SerialSettings["lineEnding"],
                  )
                }
              >
                <option>CRLF</option>
                <option>LF</option>
                <option>CR</option>
              </select>
            </label>
            <label>
              Pausa tra blocchi
              <select
                value={s.delay}
                onChange={(e) => update("delay", +e.target.value)}
              >
                {blockDelays.map((v) => (
                  <option value={v} key={v}>
                    {v} ms
                  </option>
                ))}
              </select>
              <small>Dopo ogni blocco inviato.</small>
            </label>
            <TextField
              label="Trigger d’inizio trasmissione"
              value={t.startTrigger}
              onChange={(v) => tx("startTrigger", v)}
            />
            <TextField
              label="Trigger di fine trasmissione"
              value={t.endTrigger}
              onChange={(v) => tx("endTrigger", v)}
            />
            <p className="field-hint full">
              Invia soltanto la parte tra i trigger, includendoli. Con % in
              entrambi i campi usa il primo e il successivo %. Se un trigger
              manca, l’invio non parte.
            </p>
            <TextField
              label="Invia prima del file"
              value={t.beforeFile}
              onChange={(v) => tx("beforeFile", v)}
            />
            <TextField
              label="Invia dopo la fine del file"
              value={t.afterFile}
              onChange={(v) => tx("afterFile", v)}
            />
            <TextField
              label="Ignora linee contenenti"
              value={t.ignoreLines}
              onChange={(v) => tx("ignoreLines", v)}
              hint="Testo esatto, maiuscole e minuscole distinte."
            />
            <TextField
              label="Rimuovi caratteri in trasmissione"
              value={t.removeCharacters}
              onChange={(v) => tx("removeCharacters", v)}
              hint="Ogni carattere elencato viene rimosso; es. \0."
            />
            <NumberField
              label="Interrompi dopo n caratteri"
              value={t.stopAfter}
              max={100000000}
              onChange={(v) => tx("stopAfter", v)}
              hint="0 = intero file. Conta anche prefisso, suffisso e fine riga."
            />
            <NumberField
              label="Tempo limite handshake (secondi)"
              value={t.handshakeTimeout}
              max={3600}
              onChange={(v) => tx("handshakeTimeout", v)}
              hint="0 = attesa illimitata. Puoi sempre interrompere l’invio."
            />
            <NumberField
              label="Ritardo prima di ogni linea (ms)"
              value={t.beforeLineDelay}
              max={60000}
              onChange={(v) => tx("beforeLineDelay", v)}
            />
            <CheckField
              label="Delimitatori %"
              value={s.wrap}
              onChange={(v) => update("wrap", v)}
            />
            <h4>Opzioni avanzate</h4>
            <CheckField
              label="Attendi XON prima di inviare"
              value={t.waitForXon}
              disabled={!usesSoftwareFlow(s)}
              onChange={(v) => tx("waitForXon", v)}
            />
            <CheckField
              label="Rimuovi ASCII 0"
              value={t.removeNul}
              onChange={(v) => tx("removeNul", v)}
            />
            <CheckField
              label="Rimuovi spazi"
              value={t.removeSpaces}
              onChange={(v) => tx("removeSpaces", v)}
            />
            <CheckField
              label="Sostituisci tab con spazi"
              value={t.tabsToSpaces}
              onChange={(v) => tx("tabsToSpaces", v)}
            />
            <CheckField
              label="Invia con CR/LF non standard"
              value={t.customLineEnding}
              onChange={(v) => tx("customLineEnding", v)}
            />
            <TextField
              label="Sequenza CR/LF personalizzata"
              value={t.lineEndingSequence}
              disabled={!t.customLineEnding}
              onChange={(v) => tx("lineEndingSequence", v)}
            />
            <p className="field-hint full">
              L’invio parte sempre premendo “Invia programma alla macchina”. I
              filtri modificano soltanto i dati trasmessi. I tab diventano
              quattro spazi; “Rimuovi spazi” si applica dopo questa
              sostituzione. Prefisso e suffisso sono inviati senza aggiungere
              fine riga.
            </p>
          </fieldset>
        )}
        {tab === "Ricezione" && (
          <fieldset disabled={locked} className="serial-fields rs232-fields">
            <h4>Impostazioni ricezione</h4>
            <label>
              CR/LF ricezione
              <select
                value={r.lineEnding}
                onChange={(e) =>
                  rx("lineEnding", e.target.value as typeof r.lineEnding)
                }
              >
                <option value="auto">Automatico · conserva l’originale</option>
                <option>CRLF</option>
                <option>LF</option>
                <option>CR</option>
              </select>
            </label>
            <NumberField
              label="Tempo limite ricezione (secondi)"
              value={r.timeout}
              max={3600}
              onChange={(v) => rx("timeout", v)}
              hint="Dopo il primo dato: termina dopo questo tempo senza nuovi dati. 0 = arresto manuale."
            />
            <TextField
              label="Trigger d’inizio ricezione"
              value={r.startTrigger}
              onChange={(v) => rx("startTrigger", v)}
            />
            <TextField
              label="Trigger di fine ricezione"
              value={r.endTrigger}
              onChange={(v) => rx("endTrigger", v)}
            />
            <p className="field-hint full">
              Conserva i trigger nel file. Un trigger di fine conclude
              automaticamente la ricezione. Le sequenze funzionano anche quando
              arrivano in più pacchetti.
            </p>
            <TextField
              label="Scarta linee contenenti caratteri"
              value={r.discardLineCharacters}
              onChange={(v) => rx("discardLineCharacters", v)}
              hint="Scarta l’intera riga se contiene uno dei caratteri elencati."
            />
            <TextField
              label="Ometti linee con stringa"
              value={r.omitLineString}
              onChange={(v) => rx("omitLineString", v)}
              hint="Scarta l’intera riga se contiene il testo esatto."
            />
            <TextField
              label="Rimuovi caratteri in ricezione"
              value={r.removeCharacters}
              onChange={(v) => rx("removeCharacters", v)}
              hint="Es. \0 per ASCII 0; vuoto = conserva tutti i caratteri."
            />
            <CheckField
              label="Rimuovi controlli ASCII 0–31"
              value={r.removeControls}
              onChange={(v) => rx("removeControls", v)}
            />
            {r.removeControls && (
              <p className="field-hint full">
                CR e LF restano separatori di riga; gli altri caratteri ASCII
                0–31 vengono rimossi, come filtro sul contenuto delle righe.
              </p>
            )}
            <CheckField
              label="Ometti linee vuote"
              value={r.omitEmpty}
              onChange={(v) => rx("omitEmpty", v)}
            />
            <h4>Impostazioni avanzate ricezione</h4>
            <CheckField
              label="Invia XON all’inizio della ricezione"
              value={r.sendXon}
              disabled={!usesSoftwareFlow(s)}
              onChange={(v) => rx("sendXon", v)}
            />
            <TextField
              label="Invia all’inizio della ricezione"
              value={r.initial}
              onChange={(v) => rx("initial", v)}
              hint="Sequenza ASCII inviata dopo l’eventuale XON."
            />
            <p className="field-hint full">
              Con i filtri di riga attivi, una riga compare quando è completa. I
              caratteri vengono rimossi prima dei filtri di riga. Il registro
              “Dati ricevuti” conserva i dati in arrivo prima di questi filtri.
            </p>
          </fieldset>
        )}
        {tab === "Directory" && (
          <fieldset
            disabled={locked || folderBusy}
            className="serial-fields rs232-fields"
          >
            {(
              [
                ["send", "trasmissione"],
                ["receive", "ricezione"],
              ] as const
            ).map(([direction, name]) => (
              <div className="directory-group full" key={direction}>
                <h4>Default {name}</h4>
                <div className="directory-choice">
                  <div>
                    <span>Cartella {name} predefinita</span>
                    <strong>
                      {folderNames[direction] || "Nessuna cartella selezionata"}
                    </strong>
                  </div>
                  <button
                    type="button"
                    className="button"
                    disabled={!saved || !canChooseDirectory()}
                    onClick={() => void chooseFolder(direction)}
                  >
                    <FolderOpen size={16} />
                    Scegli e salva cartella {name}
                  </button>
                  {folderNames[direction] && (
                    <button
                      type="button"
                      className="button"
                      onClick={() => void chooseFolder(direction, true)}
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
                <div className="directory-extensions">
                  <TextField
                    label={`Estensione file ${name}`}
                    value={d[direction].extension}
                    onChange={(v) =>
                      update("directories", {
                        ...d,
                        [direction]: { ...d[direction], extension: v },
                      })
                    }
                  />
                  <TextField
                    label={`Estensioni aggiuntive ${name}`}
                    value={d[direction].additionalExtensions}
                    onChange={(v) =>
                      update("directories", {
                        ...d,
                        [direction]: {
                          ...d[direction],
                          additionalExtensions: v,
                        },
                      })
                    }
                    hint="Separate da ;, es. txt;nc;tap"
                  />
                </div>
              </div>
            ))}
            <p className="field-hint full">
              {!saved
                ? "Salva prima la macchina per associarle una cartella. "
                : ""}
              Le cartelle si salvano subito, separatamente dai parametri. Apri e
              Salva propongono la cartella della macchina selezionata, tramite
              le finestre di Chrome o Edge. Il browser mostra il nome della
              cartella e può richiedere nuovamente il permesso. Senza cartella
              usa il normale download. “Predefiniti” ripristina solo le
              estensioni.
            </p>
            {!canChooseDirectory() && (
              <p className="field-hint full">
                La scelta delle cartelle richiede Chrome o Edge sul PC Windows.
              </p>
            )}
            {folderMessage && (
              <p className="full" role="status">
                {folderMessage}
              </p>
            )}
          </fieldset>
        )}
        {tab === "Info versione" && (
          <div className="rs232-info">
            <strong>CNCstudio 0.1 · Configuratore RS-232</strong>
            <p>
              Profili macchina salvati nel browser su questo PC. Collegamento
              tramite Web Serial in Chrome o Edge, su HTTPS o localhost.
            </p>
            <p>
              Sono disponibili segnali DTR/RTS, controllo software XON/XOFF,
              filtri, trigger e cartelle tramite le API del browser. La porta
              COM viene scelta al collegamento; gli errori di parità sono
              segnalati dal driver, senza sostituzione del singolo byte.
            </p>
            <p>
              Verifica i parametri sul manuale della tua macchina. La scrittura
              sulla porta non costituisce conferma di ricezione da parte della
              CNC.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
