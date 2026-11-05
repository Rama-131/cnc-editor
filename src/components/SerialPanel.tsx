import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cable,
  Plug,
  Send,
  Square,
  Download,
  Terminal,
  ArrowDownToLine,
  X,
  Settings2,
} from "lucide-react";
import {
  defaultSerial,
  encodeProgram,
  getSerial,
  SerialConnection,
} from "../lib/serial";
import type { MachineProfile } from "../lib/machineProfiles";
import { downloadText } from "../lib/files";
import { MAX_RECEIVED_CHARS } from "../lib/reception";
export function SerialPanel({
  source,
  filename,
  machines,
  selectedId,
  onSelectMachine,
  onLockChange,
  mode = "send",
  receiving = false,
  receivedLength = 0,
  onReceive = () => true,
  onReceivingChange = () => {},
  onSendingChange,
  visible,
  statusContainer,
}: {
  visible: boolean;
  statusContainer: HTMLElement | null;
  source: string;
  filename: string;
  machines: MachineProfile[];
  selectedId: string | null;
  onSelectMachine: (id: string) => void;
  onLockChange: (id: string | null) => void;
  mode?: "send" | "receive";
  receiving?: boolean;
  receivedLength?: number;
  onReceive?: (text: string) => boolean;
  onReceivingChange?: (active: boolean) => void;
  onSendingChange?: (active: boolean) => void;
}) {
  const machine = machines.find((m) => m.id === selectedId);
  const settings = machine?.settings ?? defaultSerial;
  const [connected, setConnected] = useState(false),
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
  useEffect(() => onSendingChange?.(sending), [sending, onSendingChange]);
  const receiveActive = useRef(receiving);
  const callbacks = useRef({ onReceive, onReceivingChange });
  callbacks.current = { onReceive, onReceivingChange };
  function setReceiving(active: boolean) {
    receiveActive.current = active;
    callbacks.current.onReceivingChange(active);
  }
  useEffect(
    () => () => {
      void connection.current?.disconnect();
    },
    [],
  );
  async function connect() {
    if (!machine && !connected) return;
    setBusy(true);
    setError(false);
    setFault(false);
    try {
      if (connected) {
        if (receiveActive.current) {
          try {
            await connection.current?.stopReceiving(settings);
          } catch {}
          setReceiving(false);
        }
        await connection.current?.disconnect();
        connection.current = null;
        setConnected(false);
        onLockChange(null);
        setMessage("Porta disconnessa.");
        return;
      }
      const provider = getSerial();
      if (!provider)
        throw new Error(
          "Per la seriale usa Chrome o Edge su Windows, in HTTPS o su localhost, sul PC collegato alla CNC.",
        );
      onLockChange(machine!.id);
      const c = new SerialConnection(
        (text) => {
          setReceived((s) => (s + text).slice(-200000));
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
        {
          onReceive: (text) => {
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
          onEnd: (reason) => {
            setReceiving(false);
            setMessage(
              reason === "trigger"
                ? "Trigger di fine ricevuto. Ricezione conclusa; verifica e salva il programma."
                : "Tempo limite senza nuovi dati raggiunto. Ricezione conclusa; verifica e salva il programma.",
            );
          },
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
      if (!connection.current) onLockChange(null);
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
        await connection.current.stopReceiving(settings);
        setReceiving(false);
        setMessage(
          "Ricezione terminata. Verifica che il programma sia completo, poi salva il file ricevuto.",
        );
      } else {
        setReceiving(true);
        await connection.current.startReceiving(settings);
        if (receiveActive.current)
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
      const result = await connection.current?.send(
        source,
        settings,
        (sent, total) => setProgress((sent / total) * 100),
      );
      setMessage(
        result?.limited
          ? `Invio parziale: raggiunto il limite configurato di ${result.total} caratteri. Il programma completo non è stato trasmesso.`
          : "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
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
      onLockChange(null);
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <div
        className="serial-tools"
        role="group"
        aria-label="Comandi trasferimento"
        hidden={!visible}
      >
        <div className="toolbar-group transfer-machine" data-label="Macchina">
          <label>
            <span>
              <Cable size={14} /> Macchina
            </span>
            <select
              aria-label="Macchina per il trasferimento"
              value={selectedId ?? ""}
              disabled={
                connected || busy || sending || receiving || !machines.length
              }
              onChange={(event) => onSelectMachine(event.target.value)}
            >
              {!machines.length && (
                <option value="">Nessuna macchina configurata</option>
              )}
              {machines.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <a
            className="transfer-settings"
            href="#impostazioni"
            aria-label={
              machines.length
                ? "Gestisci macchine"
                : "Configura la prima macchina"
            }
            title={
              machines.length
                ? "Gestisci macchine"
                : "Configura la prima macchina"
            }
          >
            <Settings2 size={22} />
            <span className="toolbar-button-label">Impostazioni</span>
          </a>
        </div>
        <div className="toolbar-group" data-label="Connessione">
          <button
            className="transfer-connect"
            disabled={busy || sending || (!connected && !machine)}
            onClick={connect}
            aria-label={
              busy
                ? "Attendi…"
                : connected
                  ? "Disconnetti porta"
                  : "Seleziona e collega porta"
            }
            title={
              connected
                ? "Disconnetti porta"
                : "Seleziona e collega porta seriale"
            }
          >
            <Plug size={22} />
            <span className="toolbar-button-label">
              {busy
                ? "Attendi…"
                : connected
                  ? "Disconnetti porta"
                  : "Collega porta"}
            </span>
          </button>
        </div>
        <div
          className="toolbar-group"
          data-label={mode === "receive" ? "Ricezione" : "Trasmissione"}
        >
          {mode === "receive" ? (
            <button
              className={`button ${receiving ? "danger" : "primary"} transfer-action`}
              disabled={!connected || busy || sending || fault}
              onClick={toggleReception}
            >
              {receiving ? <Square size={22} /> : <ArrowDownToLine size={22} />}
              <span className="toolbar-button-label">
                {receiving
                  ? "Termina ricezione"
                  : receivedLength
                    ? "Riprendi ricezione"
                    : "Avvia ricezione"}
              </span>
            </button>
          ) : (
            <button
              className={`button ${sending ? "danger" : "primary"} transfer-action`}
              disabled={
                !connected ||
                busy ||
                receiving ||
                fault ||
                (!sending && !source.trim())
              }
              aria-label={
                sending
                  ? `Interrompi · ${Math.round(progress)}%`
                  : "Invia programma alla macchina"
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
              {sending ? <Square size={22} /> : <Send size={22} />}
              <span className="toolbar-button-label">
                {sending
                  ? `Interrompi · ${Math.round(progress)}%`
                  : "Invia programma"}
              </span>
            </button>
          )}
          <button
            className="transfer-log-toggle"
            aria-label={`Dati ricevuti · ${received.length} caratteri`}
            aria-expanded={showLog}
            aria-pressed={showLog}
            aria-controls="serial-received-log"
            title={`Dati seriali ricevuti: ${received.length} caratteri`}
            onClick={() => setShowLog(!showLog)}
          >
            <Terminal size={22} />
            <span className="toolbar-button-label">
              Dati ricevuti<small>{received.length} caratteri</small>
            </span>
          </button>
        </div>
      </div>
      {statusContainer &&
        createPortal(
          <div className="serial-status" hidden={!visible}>
            <span
              className={`connection-state ${connected && !fault ? "online" : ""}`}
            >
              <i />
              {fault
                ? "Errore porta"
                : connected
                  ? "Collegato"
                  : "Non collegato"}
            </span>
            <div
              className={`serial-message ${error ? "error" : ""}`}
              role="status"
            >
              {message}
            </div>
            {sending && (
              <progress
                max="100"
                value={progress}
                aria-label="Avanzamento invio"
              />
            )}
            {machine?.importedFrom?.port && (
              <span
                className="transfer-port-hint"
                title="Seleziona la porta corrispondente nella finestra del browser."
              >
                Porta nel trasmettitore precedente:{" "}
                <strong>{machine.importedFrom.port}</strong>
              </span>
            )}
            {!getSerial() && (
              <span className="transfer-port-hint">
                La porta seriale richiede Chrome o Edge sul PC Windows collegato
                alla CNC.
              </span>
            )}
            {receiving && mode === "send" && (
              <span className="transfer-port-hint">
                Ricezione in corso: apri Ricezione per terminarla prima di
                inviare.
              </span>
            )}
            {showLog && (
              <section
                className="transfer-log-panel"
                id="serial-received-log"
                aria-label="Registro dati seriali"
              >
                <div className="transfer-log-head">
                  <strong>Dati ricevuti · {received.length} caratteri</strong>
                  {received && (
                    <button
                      className="icon-button"
                      aria-label="Salva dati ricevuti"
                      onClick={() => downloadText(received, "ricevuto.nc")}
                    >
                      <Download size={16} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    aria-label="Chiudi dati ricevuti"
                    onClick={() => setShowLog(false)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <textarea
                  className="receive-log"
                  aria-label="Dati seriali ricevuti"
                  value={received}
                  readOnly
                  placeholder="I dati ricevuti dalla porta appariranno qui. XON/XOFF sono gestiti dal collegamento."
                />
              </section>
            )}
          </div>,
          statusContainer,
        )}
    </>
  );
}
