import { useEffect, useRef, useState } from "react";
import {
  Cable,
  ChevronDown,
  Plug,
  Send,
  Square,
  Download,
  Terminal,
  ArrowDownToLine,
  Info,
} from "lucide-react";
import {
  defaultSerial,
  encodeProgram,
  getSerial,
  SerialConnection,
  type SerialSettings,
} from "../lib/serial";
import { downloadText } from "../lib/files";
import { MAX_RECEIVED_CHARS } from "../lib/reception";
function loadProfile(): string {
  try {
    const name = localStorage.getItem("cnc.serial.profile");
    if (name && ["Fanuc", "Mitsubishi", "Altro controllo ISO"].includes(name))
      return name;
  } catch {}
  return "Fanuc";
}
function loadSettings(profile: string): SerialSettings {
  try {
    const v = JSON.parse(
      localStorage.getItem(`cnc.serial.${profile}`) ?? "null",
    );
    if (
      v &&
      [
        110, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200,
      ].includes(v.baudRate) &&
      [7, 8].includes(v.dataBits) &&
      [1, 2].includes(v.stopBits) &&
      ["none", "even", "odd"].includes(v.parity) &&
      ["none", "hardware", "software"].includes(v.flowControl) &&
      ["CRLF", "CR", "LF"].includes(v.lineEnding) &&
      [0, 10, 25, 50, 100, 250].includes(v.delay) &&
      typeof v.wrap === "boolean"
    )
      return v;
  } catch {}
  return defaultSerial;
}
export function SerialPanel({
  source,
  filename,
  mode = "send",
  receiving = false,
  receivedLength = 0,
  onReceive = () => true,
  onReceivingChange = () => {},
}: {
  source: string;
  filename: string;
  mode?: "send" | "receive";
  receiving?: boolean;
  receivedLength?: number;
  onReceive?: (text: string) => boolean;
  onReceivingChange?: (active: boolean) => void;
}) {
  const [profile, setProfile] = useState(loadProfile);
  const [settings, setSettings] = useState(() => loadSettings(profile)),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(
      "Seleziona la porta seriale del PC collegato alla macchina.",
    ),
    [error, setError] = useState(false),
    [fault, setFault] = useState(false),
    [received, setReceived] = useState(""),
    [showLog, setShowLog] = useState(false);
  const connection = useRef<SerialConnection | null>(null);
  const receiveActive = useRef(receiving);
  const callbacks = useRef({ onReceive, onReceivingChange });
  callbacks.current = { onReceive, onReceivingChange };
  function setReceiving(active: boolean) {
    receiveActive.current = active;
    callbacks.current.onReceivingChange(active);
  }
  useEffect(() => {
    try {
      localStorage.setItem(`cnc.serial.${profile}`, JSON.stringify(settings));
      localStorage.setItem("cnc.serial.profile", profile);
    } catch {}
  }, [settings, profile]);
  useEffect(
    () => () => {
      void connection.current?.disconnect();
    },
    [],
  );
  const update = <K extends keyof SerialSettings>(
    key: K,
    value: SerialSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  async function connect() {
    setBusy(true);
    setError(false);
    setFault(false);
    try {
      if (connected) {
        if (receiveActive.current) {
          setReceiving(false);
          try {
            await connection.current?.stopReceiving(settings);
          } catch {}
        }
        await connection.current?.disconnect();
        connection.current = null;
        setConnected(false);
        setMessage("Porta disconnessa.");
        return;
      }
      const provider = getSerial();
      if (!provider)
        throw new Error(
          "Per la seriale usa Chrome o Edge su Windows, in HTTPS o su localhost, sul PC collegato alla CNC.",
        );
      const c = new SerialConnection(
        (text) => {
          setReceived((s) => (s + text).slice(-200000));
          if (receiveActive.current && !callbacks.current.onReceive(text)) {
            setReceiving(false);
            setError(true);
            setMessage(
              `Limite di ${MAX_RECEIVED_CHARS.toLocaleString("it-IT")} caratteri raggiunto: ricezione interrotta. Il file contiene solo i dati acquisiti fino al limite; salvalo prima di iniziare di nuovo.`,
            );
            setBusy(true);
            void c
              .stopReceiving(settings)
              .catch(() => setFault(true))
              .finally(() => setBusy(false));
          }
        },
        (message) => {
          setReceiving(false);
          setFault(true);
          setMessage(
            message +
              " I dati già ricevuti sono conservati; ricollega la porta prima di continuare.",
          );
          setError(true);
        },
      );
      await c.connect(provider, settings);
      connection.current = c;
      setConnected(true);
      setMessage(
        mode === "receive"
          ? "Porta aperta. Premi Avvia ricezione, poi avvia l’invio sulla CNC."
          : "Porta aperta. Imposta la CNC in ricezione prima di inviare.",
      );
    } catch (e) {
      setError(true);
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggleReception() {
    if (!connection.current) return;
    setBusy(true);
    setError(false);
    try {
      if (receiveActive.current) {
        setReceiving(false);
        await connection.current.stopReceiving(settings);
        setMessage(
          "Ricezione terminata. Verifica che il programma sia completo, poi salva il file ricevuto.",
        );
      } else {
        setReceiving(true);
        await connection.current.startReceiving(settings);
        setMessage(
          "Ricezione attiva. Avvia l’invio del programma sulla macchina; i dati compariranno nel documento.",
        );
      }
    } catch (error) {
      setReceiving(false);
      setFault(true);
      setError(true);
      setMessage(
        (error instanceof Error ? error.message : String(error)) +
          " I dati già ricevuti sono conservati.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    setError(false);
    try {
      encodeProgram(source, settings);
      setSending(true);
      setProgress(0);
      setMessage(`Invio di ${filename}…`);
      await connection.current?.send(source, settings, (sent, total) =>
        setProgress((sent / total) * 100),
      );
      setMessage(
        "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
      );
    } catch (e) {
      setError(true);
      setMessage(
        (e instanceof Error ? e.message : String(e)) +
          " Ricollega la porta prima di riprovare.",
      );
      try {
        await connection.current?.disconnect();
      } catch {}
      connection.current = null;
      setConnected(false);
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="serial panel">
      <div className="panel-head">
        <div className="panel-title">
          <Cable size={16} />
          <span>
            {mode === "receive"
              ? "Ricezione dalla macchina"
              : "Collegamento macchina"}
          </span>
        </div>
        <span
          className={`connection-state ${connected && !fault ? "online" : ""}`}
        >
          <i />
          {fault ? "Errore porta" : connected ? "Collegato" : "Non collegato"}
        </span>
      </div>
      <div className="serial-body">
        <div className="serial-intro">
          <div className="port-symbol">
            <Cable size={23} />
          </div>
          <div>
            <strong>
              {mode === "receive"
                ? "Ricezione seriale RS-232"
                : "Trasferimento seriale RS-232"}
            </strong>
            <p>
              {mode === "receive"
                ? "Dal controllo CNC al tuo file."
                : "Il tuo programma, dal PC al controllo CNC."}
            </p>
          </div>
        </div>
        <fieldset disabled={connected || busy} className="serial-fields">
          <label className="full">
            Riferimento controllo
            <select
              value={profile}
              onChange={(e) => {
                setProfile(e.target.value);
                setSettings(loadSettings(e.target.value));
              }}
            >
              <option>Fanuc</option>
              <option>Mitsubishi</option>
              <option>Altro controllo ISO</option>
            </select>
          </label>
          <p className="field-hint full">
            {profile}: parametri indicativi. Imposta gli stessi valori presenti
            sulla macchina.
          </p>
          <label>
            Baud rate
            <select
              value={settings.baudRate}
              onChange={(e) => update("baudRate", +e.target.value)}
            >
              {[
                110, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600,
                115200,
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Bit dati
            <select
              value={settings.dataBits}
              onChange={(e) => update("dataBits", +e.target.value as 7 | 8)}
            >
              <option>7</option>
              <option>8</option>
            </select>
          </label>
          <label>
            Parità
            <select
              value={settings.parity}
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
            Bit di stop
            <select
              value={settings.stopBits}
              onChange={(e) => update("stopBits", +e.target.value as 1 | 2)}
            >
              <option>1</option>
              <option>2</option>
            </select>
          </label>
          <label className={mode === "receive" ? "full" : undefined}>
            Controllo di flusso
            <select
              value={settings.flowControl}
              onChange={(e) =>
                update(
                  "flowControl",
                  e.target.value as SerialSettings["flowControl"],
                )
              }
            >
              <option value="software">XON / XOFF</option>
              <option value="hardware">RTS / CTS</option>
              <option value="none">Nessuno</option>
            </select>
          </label>
          <label hidden={mode === "receive"}>
            Fine riga
            <select
              value={settings.lineEnding}
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
          <label hidden={mode === "receive"}>
            Pausa tra blocchi
            <select
              value={settings.delay}
              onChange={(e) => update("delay", +e.target.value)}
            >
              {[0, 10, 25, 50, 100, 250].map((v) => (
                <option key={v} value={v}>
                  {v} ms
                </option>
              ))}
            </select>
          </label>
          <label className="check-label" hidden={mode === "receive"}>
            <input
              type="checkbox"
              checked={settings.wrap}
              onChange={(e) => update("wrap", e.target.checked)}
            />
            Delimitatori %
          </label>
        </fieldset>
        {!getSerial() && (
          <div className="browser-note">
            La porta seriale richiede Chrome o Edge sul PC Windows collegato
            alla CNC.
          </div>
        )}
        <button
          className="button connect-button"
          disabled={busy || sending}
          onClick={connect}
        >
          <Plug size={15} />
          {busy
            ? "Attendi…"
            : connected
              ? "Disconnetti porta"
              : "Seleziona e collega porta"}
          <ChevronDown size={14} />
        </button>
        <div className={`serial-message ${error ? "error" : ""}`} role="status">
          {message}
        </div>
        {sending && (
          <progress max="100" value={progress} aria-label="Avanzamento invio" />
        )}
        {mode === "receive" ? (
          <>
            <button
              className={`button ${receiving ? "danger" : "primary"} send-button`}
              disabled={!connected || busy || sending || fault}
              onClick={toggleReception}
            >
              {receiving ? <Square size={15} /> : <ArrowDownToLine size={15} />}
              {receiving
                ? "Termina ricezione"
                : receivedLength
                  ? "Riprendi ricezione"
                  : "Avvia ricezione"}
            </button>
            <p className="receive-instructions">
              {receiving
                ? "Attendi la fine dell’invio sulla CNC prima di terminare la ricezione. Puoi cambiare pagina: l’acquisizione continua."
                : "I dati vengono acquisiti soltanto dopo Avvia ricezione. Fine riga e delimitatori ricevuti vengono conservati nel file."}
            </p>
          </>
        ) : (
          <>
            <button
              className={`button ${sending ? "danger" : "primary"} send-button`}
              disabled={
                !connected ||
                busy ||
                receiving ||
                fault ||
                (!sending && !source.trim())
              }
              onClick={
                sending
                  ? () => {
                      connection.current?.stop();
                      setMessage("Interruzione in corso…");
                    }
                  : send
              }
            >
              {sending ? <Square size={15} /> : <Send size={15} />}{" "}
              {sending
                ? `Interrompi · ${Math.round(progress)}%`
                : "Invia programma alla macchina"}
            </button>
            {receiving && (
              <p className="receive-instructions">
                Ricezione in corso. Apri la pagina Ricezione per terminarla
                prima di inviare un programma.
              </p>
            )}
          </>
        )}
        <div className="receive-toggle">
          <button onClick={() => setShowLog(!showLog)}>
            <Terminal size={14} />
            Dati ricevuti <span>{received.length} caratteri</span>
          </button>
          {received && (
            <button
              className="icon-button"
              aria-label="Salva dati ricevuti"
              onClick={() => downloadText(received, "ricevuto.nc")}
            >
              <Download size={14} />
            </button>
          )}
        </div>
        {showLog && (
          <textarea
            className="receive-log"
            aria-label="Dati seriali ricevuti"
            value={received}
            readOnly
            placeholder="I dati ricevuti dalla porta appariranno qui. XON/XOFF sono gestiti dal collegamento."
          />
        )}
        <div className="machine-note">
          <Info size={15} />
          <p>
            Il significato di alcuni codici varia con il controllo. Verifica
            sempre il manuale Fanuc, Mitsubishi o del costruttore.
          </p>
        </div>
      </div>
    </section>
  );
}
