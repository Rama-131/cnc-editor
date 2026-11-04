import { useEffect, useRef, useState } from "react";
import { FileCode2, Plus, X } from "lucide-react";
import type { ProgramDocument } from "../lib/useProgramDocuments";

export function ProgramTabs({
  documents,
  activeId,
  onSelect,
  onClose,
  onRename,
  onNew,
}: {
  documents: ProgramDocument[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onNew: () => void;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const renameSession = useRef<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");
  function startRename(doc: ProgramDocument) {
    renameSession.current = doc.id;
    setName(doc.name);
    setRenaming(doc.id);
  }
  function finishRename(commit: boolean, focusTab = false) {
    const id = renameSession.current;
    if (!id) return;
    renameSession.current = null;
    if (commit)
      onRename(id, name.trim().replace(/[\\/:*?"<>|]/g, "_") || "programma.nc");
    setRenaming(null);
    if (focusTab)
      requestAnimationFrame(() =>
        document.getElementById(`program-tab-${id}`)?.focus(),
      );
  }
  useEffect(() => {
    if (renaming) {
      renameInput.current?.focus();
      renameInput.current?.select();
    }
  }, [renaming]);
  useEffect(() => {
    const target =
      activeId && activeId === documents.at(-1)?.id
        ? ".program-tab-actions"
        : ".program-tab.active";
    tabs.current
      ?.querySelector<HTMLElement>(target)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);
  return (
    <div className="program-tabs-bar">
      <div className="program-tabs" ref={tabs}>
        <div
          className="program-tab-list"
          role="tablist"
          aria-label="Programmi aperti"
          onKeyDown={(event) => {
            if (
              !event.target ||
              (event.target as HTMLElement).getAttribute("role") !== "tab"
            )
              return;
            const index = documents.findIndex((doc) => doc.id === activeId);
            if (event.key === "F2" && index >= 0) {
              event.preventDefault();
              startRename(documents[index]);
              return;
            }
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
              {renaming === doc.id ? (
                <input
                  ref={renameInput}
                  id={`program-tab-${doc.id}`}
                  className="tab-rename"
                  aria-label="Nome file"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => finishRename(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      finishRename(event.key === "Enter", true);
                    }
                  }}
                />
              ) : (
                <button
                  id={`program-tab-${doc.id}`}
                  role="tab"
                  aria-selected={doc.id === activeId}
                  aria-controls="program-panel"
                  tabIndex={doc.id === activeId ? 0 : -1}
                  aria-label={doc.name}
                  title={`${doc.name} · Doppio clic per rinominare`}
                  onClick={() => onSelect(doc.id)}
                  onDoubleClick={() => startRename(doc)}
                >
                  <FileCode2 size={14} />
                  <span>{doc.name}</span>
                  {doc.source !== doc.savedSource && (
                    <i
                      className={`document-dirty${doc.id === activeId ? " unsaved" : ""}`}
                      title="Modifiche non salvate su file"
                    />
                  )}
                </button>
              )}
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
            className="new-program-button"
            aria-label="Nuovo programma"
            title="Nuovo programma"
            onClick={onNew}
          >
            <Plus size={16} />
            <span>Nuovo</span>
          </button>
        </div>
      </div>
    </div>
  );
}
