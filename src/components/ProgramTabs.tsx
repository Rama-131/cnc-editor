import { useEffect, useRef } from "react";
import {
  FileCode2,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  X,
} from "lucide-react";
import type { ProgramDocument } from "../lib/useProgramDocuments";

export function ProgramTabs({
  documents,
  activeId,
  onSelect,
  onClose,
  onNew,
  previewVisible,
  onTogglePreview,
  showPreviewToggle,
}: {
  documents: ProgramDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  previewVisible: boolean;
  onTogglePreview: () => void;
  showPreviewToggle: boolean;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabs.current
      ?.querySelector<HTMLElement>(".program-tab.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);
  return (
    <div className="program-tabs-bar">
      <div
        className="program-tabs"
        role="tablist"
        aria-label="Programmi aperti"
        ref={tabs}
        onKeyDown={(event) => {
          if (
            !event.target ||
            (event.target as HTMLElement).getAttribute("role") !== "tab"
          )
            return;
          const index = documents.findIndex((doc) => doc.id === activeId);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % documents.length
              : event.key === "ArrowLeft"
                ? (index - 1 + documents.length) % documents.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? documents.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          onSelect(documents[next].id);
          tabs.current
            ?.querySelectorAll<HTMLElement>('[role="tab"]')
            [next]?.focus();
        }}
      >
        {documents.map((doc) => (
          <div
            className={`program-tab ${doc.id === activeId ? "active" : ""}`}
            key={doc.id}
          >
            <button
              id={`program-tab-${doc.id}`}
              role="tab"
              aria-selected={doc.id === activeId}
              aria-controls="program-panel"
              tabIndex={doc.id === activeId ? 0 : -1}
              aria-label={doc.name}
              title={doc.name}
              onClick={() => onSelect(doc.id)}
            >
              <FileCode2 size={14} />
              <span>{doc.name}</span>
              {doc.source !== doc.savedSource && (
                <i
                  className="document-dirty"
                  title="Modifiche non salvate su file"
                />
              )}
            </button>
            <button
              className="close-program"
              tabIndex={doc.id === activeId ? 0 : -1}
              aria-label={`Chiudi ${doc.name}`}
              title={`Chiudi ${doc.name}`}
              onClick={() => onClose(doc.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="program-tab-actions">
        <button
          className="icon-button"
          aria-label="Nuovo programma"
          title="Nuovo programma"
          onClick={onNew}
        >
          <Plus size={16} />
        </button>
        {showPreviewToggle && (
          <button
            className="examples-toggle simulation-toggle"
            aria-label={
              previewVisible ? "Nascondi simulazione" : "Mostra simulazione"
            }
            title={
              previewVisible ? "Nascondi simulazione" : "Mostra simulazione"
            }
            aria-expanded={previewVisible}
            aria-controls="simulation-panel"
            onClick={onTogglePreview}
          >
            {previewVisible ? (
              <PanelRightClose size={16} />
            ) : (
              <PanelRightOpen size={16} />
            )}
            <span>
              {previewVisible ? "Nascondi simulazione" : "Mostra simulazione"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
