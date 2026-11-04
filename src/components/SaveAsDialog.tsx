import { useEffect, useId, useRef, useState } from "react";
import { Save, X } from "lucide-react";
import { fileExtension, fileNameError, saveAsFilename } from "../lib/files";

export function SaveAsDialog({
  initialName,
  receiving = false,
  onConfirm,
  onClose,
}: {
  initialName: string;
  receiving?: boolean;
  onConfirm: (name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const originalExtension = fileExtension(initialName);
  const [name, setName] = useState(initialName);
  const [format, setFormat] = useState(originalExtension || "nc");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const result = saveAsFilename(name, format, originalExtension);
  const hasOriginalFormat =
    originalExtension && !["nc", "txt"].includes(originalExtension);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    input.current?.focus();
    const dot = initialName.lastIndexOf(".");
    input.current?.setSelectionRange(0, dot > 0 ? dot : initialName.length);
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="save-as-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          if (!busy) onClose();
      }}
    >
      <form
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const problem = fileNameError(result);
          if (problem) {
            setError(problem);
            input.current?.focus();
            return;
          }
          setBusy(true);
          try {
            await onConfirm(result);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="save-as-heading">
          <Save size={21} />
          <h2 id={titleId}>Salva con nome</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Chiudi Salva con nome"
            title="Chiudi"
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>
        <div className="save-as-fields">
          <label>
            Nome file
            <input
              ref={input}
              disabled={busy}
              type="text"
              required
              aria-label="Nome file"
              value={name}
              aria-invalid={!!error}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const next = event.target.value;
                setName(next);
                const extension = fileExtension(next);
                if (
                  ["nc", "txt", originalExtension].includes(extension) &&
                  extension
                )
                  setFormat(extension);
                setError("");
              }}
            />
          </label>
          <label>
            Formato
            <select
              aria-label="Formato file"
              disabled={busy}
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                setName(
                  saveAsFilename(name, event.target.value, originalExtension),
                );
                setError("");
              }}
            >
              <option value="nc">Programma CNC (*.NC)</option>
              <option value="txt">File di testo (*.TXT)</option>
              {hasOriginalFormat && (
                <option value={originalExtension}>
                  Formato attuale (*.{originalExtension.toUpperCase()})
                </option>
              )}
            </select>
          </label>
          <div className="save-as-preview">
            <span>Nome del file da salvare</span>
            <output aria-live="polite">{result || "—"}</output>
          </div>
          {error && (
            <p className="save-as-error" role="alert">
              {error}
            </p>
          )}
          <p className="save-as-hint">
            {receiving
              ? "Verranno salvati i dati ricevuti fino alla conferma; la ricezione continua."
              : "Il file verrà salvato sul PC con il nome scelto. Se hai associato una cartella alla macchina, si aprirà la finestra di salvataggio del browser."}
          </p>
        </div>
        <div className="save-as-actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            type="submit"
            className="button primary"
            aria-label="Conferma salvataggio con nome"
            disabled={busy || !name.trim()}
          >
            <Save size={16} />
            Salva
          </button>
        </div>
      </form>
    </dialog>
  );
}
