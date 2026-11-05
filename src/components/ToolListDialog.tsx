import { useEffect, useId, useRef } from "react";
import { ClipboardList, Download, Printer, X } from "lucide-react";
import type { Machine } from "../lib/codes";
import type { ToolList } from "../lib/toolList";

export type ToolListDocument = {
  name: string;
  source: string;
  machine: Machine;
  list: ToolList;
};
export function ToolListContent({ list }: { list: ToolList }) {
  return (
    <>
      <p className="tool-list-count">
        {list.tools.length}{" "}
        {list.tools.length === 1 ? "utensile rilevato" : "utensili rilevati"}{" "}
        nel file aperto
      </p>
      {list.tools.length ? (
        <div className="tool-list-table-wrap">
          <table className="tool-list-table">
            <thead>
              <tr>
                <th>Utensile</th>
                <th>Descrizione</th>
                <th>Correttori</th>
                <th>Richiami</th>
                <th>Prima riga</th>
              </tr>
            </thead>
            <tbody>
              {list.tools.map((tool) => (
                <tr key={tool.number}>
                  <td>
                    <strong>{tool.label}</strong>
                    {(tool.codes.length > 1 ||
                      tool.codes[0] !== tool.label) && (
                      <small>{tool.codes.join(", ")}</small>
                    )}
                  </td>
                  <td>{tool.descriptions.join(" / ") || "—"}</td>
                  <td>{tool.offsets.join(", ") || "—"}</td>
                  <td>
                    {tool.changes ? (
                      tool.changes
                    ) : (
                      <span className="tool-preselection">
                        Solo preselezione
                      </span>
                    )}
                  </td>
                  <td>{tool.firstLine}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="tool-list-empty">
          Nessun utensile numerico rilevato nel programma.
        </p>
      )}
      {list.notes.length > 0 && (
        <ul className="tool-list-notes">
          {list.notes.map((note, i) => (
            <li key={i}>
              Riga {note.line}: {note.message}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ToolListDialog({
  document,
  transferActive,
  onMachineChange,
  onClose,
  onPrint,
  onSave,
}: {
  document: ToolListDocument;
  transferActive: boolean;
  onMachineChange: (machine: Machine) => void;
  onClose: () => void;
  onPrint: () => void;
  onSave: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="tool-list-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom)
        )
          onClose();
      }}
    >
      <div className="tool-list-heading">
        <ClipboardList size={22} />
        <div>
          <h2 id={titleId}>Lista utensili da preparare</h2>
          <p>{document.name}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Chiudi lista utensili"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <div className="tool-list-body">
        <label className="tool-list-machine">
          Interpretazione
          <select
            aria-label="Tipo lista utensili"
            value={document.machine}
            onChange={(e) => onMachineChange(e.target.value as Machine)}
          >
            <option value="mill">Fresatrice · T e M6</option>
            <option value="lathe">Tornio · T e correttore</option>
          </select>
        </label>
        <ToolListContent list={document.list} />
        <p className="tool-list-hint">
          Le descrizioni provengono dai commenti adiacenti ai richiami T. In
          fresatura, gli utensili senza M6 sono indicati come sole preselezioni.
          Nel tornio i richiami a tre o quattro cifre sono separati in numero
          utensile e correttore.
        </p>
      </div>
      <div className="tool-list-actions">
        <button
          className="button"
          disabled={transferActive}
          title={
            transferActive
              ? "Stampa disponibile al termine del trasferimento"
              : "Stampa lista utensili"
          }
          onClick={onPrint}
        >
          <Printer size={16} />
          Stampa lista
        </button>
        <button className="button primary" onClick={onSave}>
          <Download size={16} />
          Salva lista TXT
        </button>
        <button className="button" onClick={onClose}>
          Chiudi
        </button>
      </div>
    </dialog>
  );
}
