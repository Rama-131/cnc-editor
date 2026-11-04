import { useEffect, useRef, useState } from "react";
import {
  Check,
  LockKeyhole,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import {
  baudRates,
  blockDelays,
  newMachine,
  serialControls,
  type MachineProfile,
} from "../lib/machineProfiles";
import { defaultSerial, type SerialSettings } from "../lib/serial";

export function MachineSettings({
  machines,
  lockedId,
  visible,
  onSave,
  onDelete,
  onDirtyChange,
}: {
  machines: MachineProfile[];
  lockedId: string | null;
  visible: boolean;
  onSave: (profile: MachineProfile) => boolean;
  onDelete: (id: string) => boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<MachineProfile>(
    () => machines[0] ?? newMachine(),
  );
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const original = machines.find((m) => m.id === draft.id);
  const locked = lockedId === draft.id;
  const dirty = original
    ? JSON.stringify(draft) !== JSON.stringify(original)
    : !!draft.name.trim() ||
      draft.control !== "Fanuc" ||
      JSON.stringify(draft.settings) !== JSON.stringify(defaultSerial);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!visible) return;
    const save = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!locked) form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [visible, locked]);
  function edit(profile: MachineProfile) {
    if (profile.id === draft.id) return;
    if (
      dirty &&
      !window.confirm(
        "Le modifiche alla macchina non sono salvate. Vuoi abbandonarle?",
      )
    )
      return;
    setDraft(profile);
    setError("");
    setSavedMessage("");
  }
  function update<K extends keyof SerialSettings>(
    key: K,
    value: SerialSettings[K],
  ) {
    setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
    setSavedMessage("");
  }
  return (
    <section
      className="machine-settings"
      hidden={!visible}
      aria-label="Impostazioni macchine"
    >
      <aside className="machine-library" aria-label="Macchine salvate">
        <div className="panel-head">
          <span className="panel-title">
            Le mie macchine <small>{machines.length}</small>
          </span>
          <button
            className="icon-button"
            aria-label="Nuova macchina"
            title="Nuova macchina"
            onClick={() => edit(newMachine())}
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="machine-list">
          {machines.map((machine) => (
            <button
              key={machine.id}
              className={`machine-item ${machine.id === draft.id ? "active" : ""}`}
              aria-pressed={machine.id === draft.id}
              onClick={() => edit(machine)}
            >
              <Settings2 size={17} />
              <span>
                <strong>{machine.name}</strong>
                <small>{machine.control}</small>
              </span>
              {machine.id === lockedId && (
                <LockKeyhole size={14} aria-label="Macchina collegata" />
              )}
            </button>
          ))}
          {!machines.length && (
            <p className="machine-empty">
              Nessuna macchina salvata. Assegna un nome e salva la prima
              configurazione.
            </p>
          )}
        </div>
        <p className="machine-storage-note">
          Le macchine vengono conservate in questo browser su questo PC.
        </p>
      </aside>
      <div className="machine-config">
        <div className="settings-heading">
          <Settings2 size={21} />
          <div>
            <h2>{original ? original.name : "Nuova macchina"}</h2>
            {dirty && (
              <span className="settings-draft">Modifiche non salvate</span>
            )}
            <p>
              Salva i parametri della CNC per ritrovarla in Trasmissione e
              Ricezione.
            </p>
          </div>
        </div>
        {locked && (
          <p className="machine-lock" role="status">
            <LockKeyhole size={15} />
            Macchina collegata. Disconnetti la porta in Trasmissione o Ricezione
            per modificarla.
          </p>
        )}
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            if (locked) return;
            const name = draft.name.trim();
            if (!name) {
              setError("Inserisci il nome della macchina.");
              return;
            }
            if (
              machines.some(
                (m) =>
                  m.id !== draft.id &&
                  m.name.toLocaleLowerCase("it") ===
                    name.toLocaleLowerCase("it"),
              )
            ) {
              setError(
                "Esiste già una macchina con questo nome. Scegli un nome diverso.",
              );
              return;
            }
            if (onSave({ ...draft, name })) {
              setDraft((d) => ({ ...d, name }));
              setError("");
              setSavedMessage("Macchina salvata.");
            }
          }}
        >
          <fieldset disabled={locked} className="serial-fields machine-fields">
            <label>
              Nome macchina
              <input
                type="text"
                maxLength={80}
                required
                placeholder="Es. Tornio Fanuc"
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                  setSavedMessage("");
                }}
              />
            </label>
            <label>
              Controllo CNC
              <select
                value={draft.control}
                onChange={(e) => {
                  setDraft((d) => ({
                    ...d,
                    control: e.target.value as MachineProfile["control"],
                  }));
                  setSavedMessage("");
                }}
              >
                {serialControls.map((control) => (
                  <option key={control}>{control}</option>
                ))}
              </select>
            </label>
            <p className="field-hint full">
              Usa gli stessi parametri impostati sulla macchina. La porta del PC
              si sceglie al momento del collegamento.
            </p>
            <label>
              Baud rate
              <select
                value={draft.settings.baudRate}
                onChange={(e) => update("baudRate", +e.target.value)}
              >
                {baudRates.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Bit dati
              <select
                value={draft.settings.dataBits}
                onChange={(e) => update("dataBits", +e.target.value as 7 | 8)}
              >
                <option>7</option>
                <option>8</option>
              </select>
            </label>
            <label>
              Parità
              <select
                value={draft.settings.parity}
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
                value={draft.settings.stopBits}
                onChange={(e) => update("stopBits", +e.target.value as 1 | 2)}
              >
                <option>1</option>
                <option>2</option>
              </select>
            </label>
            <label>
              Controllo di flusso
              <select
                value={draft.settings.flowControl}
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
            <label>
              Fine riga
              <select
                value={draft.settings.lineEnding}
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
                value={draft.settings.delay}
                onChange={(e) => update("delay", +e.target.value)}
              >
                {blockDelays.map((v) => (
                  <option key={v} value={v}>
                    {v} ms
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.settings.wrap}
                onChange={(e) => update("wrap", e.target.checked)}
              />
              Delimitatori %
            </label>
          </fieldset>
          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}
          <div className="settings-actions">
            <button type="submit" className="button primary" disabled={locked}>
              <Save size={15} />
              Salva macchina
            </button>
            {original && dirty && (
              <button
                type="button"
                className="button"
                disabled={locked}
                onClick={() => {
                  setDraft(original);
                  setError("");
                  setSavedMessage("");
                }}
              >
                Annulla modifiche
              </button>
            )}
            {original && (
              <button
                type="button"
                className="button delete-machine"
                disabled={locked}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Eliminare la macchina “${original.name}” e le sue impostazioni?`,
                    )
                  )
                    return;
                  if (onDelete(original.id)) {
                    setDraft(
                      machines.find((m) => m.id !== original.id) ??
                        newMachine(),
                    );
                    setError("");
                    setSavedMessage("");
                  }
                }}
              >
                <Trash2 size={15} />
                Elimina macchina
              </button>
            )}
          </div>
          {savedMessage && (
            <p className="settings-saved" role="status">
              <Check size={15} />
              {savedMessage}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
