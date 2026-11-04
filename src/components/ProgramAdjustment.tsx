import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  adjustmentChanges,
  adjustmentValue,
  type AdjustmentWord,
  type TextRange,
} from "../lib/programTools";

export function ProgramAdjustment({
  word,
  source,
  selection,
  onApply,
  onClose,
}: {
  word: AdjustmentWord;
  source: string;
  selection?: TextRange;
  onApply: (value: string, range?: TextRange) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [scope, setScope] = useState(selection ? "selection" : "program");
  const input = useRef<HTMLInputElement>(null);
  const range = scope === "selection" ? selection : undefined;
  const normalized = adjustmentValue(value, word);
  const { changes, skipped, matching } = adjustmentChanges(
    source,
    word,
    value,
    range,
  );
  const title =
    word === "F" ? "Aggiusta avanzamento" : "Aggiusta giri mandrino";
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      className="program-adjustment"
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        if (normalized !== null && changes.length) onApply(normalized, range);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="adjustment-heading">
        <strong>
          {title} · {word}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Chiudi modifica valori"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      <div className="adjustment-fields">
        <label>
          Nuovo valore {word}
          <input
            ref={input}
            type="text"
            inputMode="decimal"
            aria-label={`Nuovo valore ${word}`}
            placeholder={word === "F" ? "Es. 0,25" : "Es. 1200"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-invalid={!!value && normalized === null}
          />
        </label>
        <label>
          Applica a
          <select
            aria-label="Dove applicare la modifica"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="program">Programma intero</option>
            {selection && <option value="selection">Solo selezione</option>}
          </select>
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={normalized === null || !changes.length}
        >
          Applica
        </button>
      </div>
      <p className="adjustment-preview" role="status">
        {normalized === null
          ? value
            ? word === "F"
              ? "Inserisci un avanzamento maggiore di zero."
              : "Inserisci un numero di giri maggiore o uguale a zero."
            : "Inserisci il nuovo valore."
          : changes.length
            ? `${changes.length} ${changes.length === 1 ? "valore sarà modificato" : "valori saranno modificati"}.`
            : matching
              ? "I valori hanno già il valore indicato."
              : `Nessun valore ${word} modificabile in questa area.`}
        {word === "S" && skipped > 0 && ` ${skipped} valori S esclusi.`}
      </p>
      <p className="adjustment-hint">
        {word === "F"
          ? "Modifica i valori F numerici esistenti. Le unità di avanzamento restano quelle del programma."
          : "Modifica i valori S in modalità giri. Esclude G96 (velocità di taglio), limiti G50/G92 e modalità non determinata."}{" "}
        Commenti e macro restano invariati. Annulla ripristina i valori
        precedenti.
      </p>
    </form>
  );
}
