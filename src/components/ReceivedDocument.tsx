import { useState } from "react";
import { FileCode2 } from "lucide-react";
import { Editor, type Palette } from "./Editor";
import type { Machine } from "../lib/codes";
import type { useReceivedDocument } from "../lib/useReceivedDocument";

const ignore = () => {};
export function ReceivedDocument({
  file,
  machine,
  palette,
  receiving,
  visible,
}: {
  file: ReturnType<typeof useReceivedDocument>;
  machine: Machine;
  palette: Palette;
  receiving: boolean;
  visible: boolean;
}) {
  const [follow, setFollow] = useState(true);
  return (
    <div className="received-column" hidden={!visible}>
      <section className="editor panel received-document">
        <div className="panel-head editor-head">
          <div className="file-tab">
            <FileCode2 size={16} />
            <input
              aria-label="Nome del file ricevuto"
              value={file.name}
              onChange={(event) =>
                file.setName(
                  event.target.value.replace(/[\\/:*?"<>|]/g, "_") ||
                    "ricevuto.nc",
                )
              }
            />
            {file.dirty && (
              <i className="unsaved" title="Dati ricevuti da salvare su file" />
            )}
          </div>
          <span className="badge">SOLA LETTURA</span>
        </div>
        <div className={`reception-bar ${receiving ? "tracking" : ""}`}>
          <span className="reception-position">
            {receiving
              ? file.text
                ? "Ricezione in corso"
                : "In attesa dei dati dalla macchina"
              : file.text
                ? "Dati acquisiti"
                : "Documento vuoto"}
          </span>
          <label>
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => setFollow(event.target.checked)}
            />
            Segui dati
          </label>
        </div>
        <Editor
          value={file.displayText}
          onChange={ignore}
          onCursor={ignore}
          machine={machine}
          palette={palette}
          simulationLine={null}
          followSimulation={false}
          readOnly
          ariaLabel="Programma ricevuto dalla macchina"
          emptyHint="Il programma ricevuto dalla macchina comparirà qui…"
          followEnd={visible && follow}
        />
        <div className="editor-status">
          <span className="received-count" data-count={file.text.length}>
            {file.text.length.toLocaleString("it-IT")} caratteri
          </span>
          <span>
            {file.text ? file.displayText.split("\n").length : 0} righe
          </span>
          <span>File ricevuto</span>
        </div>
      </section>
    </div>
  );
}
