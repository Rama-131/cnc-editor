import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BookOpen,
  Code2,
  FileCode2,
  FolderOpen,
  Info,
  Palette as PaletteIcon,
  Plus,
  RotateCcw,
  Settings2,
  Cable,
  Space,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import {
  Editor,
  defaultPalette,
  type EditorHandle,
  type EditorHistory,
  type Palette,
} from "./components/Editor";
import { Simulation } from "./components/Simulation";
import { SerialPanel } from "./components/SerialPanel";
import { ReceivedDocument } from "./components/ReceivedDocument";
import { ProgramTabs } from "./components/ProgramTabs";
import { MachineSettings } from "./components/MachineSettings";
import { useMachineProfiles } from "./lib/useMachineProfiles";
import { downloadText } from "./lib/files";
import { useReceivedDocument } from "./lib/useReceivedDocument";
import { useProgramDocuments } from "./lib/useProgramDocuments";
import { simulate } from "./lib/simulator";
import { codeInfo, type Machine } from "./lib/codes";
import { millSample, latheSample } from "./lib/samples";
const colorNames: Record<keyof Palette, string> = {
  g: "Codici G",
  m: "Codici M",
  axis: "Coordinate e assi",
  value: "Valori numerici",
  comment: "Commenti",
  tool: "Utensili e correttori",
};
function readPalette(): Palette {
  try {
    const p = JSON.parse(localStorage.getItem("cnc.palette") ?? "null");
    if (
      p &&
      Object.keys(defaultPalette).every((k) => /^#[a-f\d]{6}$/i.test(p[k]))
    )
      return p;
  } catch {}
  return defaultPalette;
}
function currentPage(): "workspace" | "serial" | "receive" | "settings" {
  if (window.location.hash === "#impostazioni") return "settings";
  if (window.location.hash === "#ricezione") return "receive";
  return window.location.hash === "#trasmissione" ? "serial" : "workspace";
}
const pageTitle = {
  workspace: "Simulazione",
  serial: "Trasmissione",
  receive: "Ricezione",
  settings: "Impostazioni",
};

export default function App() {
  const [palette, setPalette] = useState(readPalette),
    [showColors, setShowColors] = useState(false),
    [showExamples, setShowExamples] = useState(false),
    [showGuide, setShowGuide] = useState(false),
    [cursor, setCursor] = useState({ line: 1, col: 1 }),
    [activeLine, setActiveLine] = useState<number | null>(null),
    [followSimulation, setFollowSimulation] = useState(true),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [receiving, setReceiving] = useState(false),
    [lockedMachine, setLockedMachine] = useState<string | null>(null),
    [machineSettingsDirty, setMachineSettingsDirty] = useState(false),
    [history, setHistory] = useState<EditorHistory>({
      canUndo: false,
      canRedo: false,
    }),
    [tab, setTab] = useState(currentPage);
  const programs = useProgramDocuments(setNotice);
  const machineProfiles = useMachineProfiles(setNotice);
  const { active, machine, diameter } = programs;
  const source = active?.source ?? "";
  const filename = active?.name ?? "programma.nc";
  const setSource = (source: string) => {
    if (active) programs.update(active.id, { source });
  };
  const setMachine = (machine: Machine) => programs.configure({ machine });
  const setDiameter = (diameter: boolean) => programs.configure({ diameter });
  const reception = useReceivedDocument(setNotice);
  const fileInput = useRef<HTMLInputElement>(null);
  const programEditor = useRef<EditorHandle>(null);
  const simulationVisible =
    tab === "workspace" && programs.previewVisible && !!active;
  const onHistoryChange = useCallback(
    (next: EditorHistory) =>
      setHistory((current) =>
        current.canUndo === next.canUndo && current.canRedo === next.canRedo
          ? current
          : next,
      ),
    [],
  );
  const result = useMemo(
    () => simulate(source, machine, diameter),
    [source, machine, diameter],
  );
  useEffect(() => {
    const updatePage = () => {
      setTab(currentPage());
      setShowExamples(false);
    };
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("cnc.palette", JSON.stringify(palette));
    } catch {}
  }, [palette]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (
        programs.dirty ||
        reception.dirty ||
        receiving ||
        machineSettingsDirty
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [programs.dirty, reception.dirty, receiving, machineSettingsDirty]);
  const onCursor = useCallback(
      (line: number, col: number) => setCursor({ line, col }),
      [],
    ),
    onLine = useCallback((line: number | null) => setActiveLine(line), []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (tab === "settings") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (tab === "receive") reception.save();
        else saveFile();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (tab === "receive")
          setNotice(
            "Per aprire un file usa la pagina Simulazione o Trasmissione.",
          );
        else fileInput.current?.click();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active, tab, reception.save, programs.update]);
  useEffect(() => {
    if (!showExamples) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".editor-examples, .examples-toggle")
      )
        setShowExamples(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowExamples(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showExamples]);
  useEffect(() => {
    if (!showGuide) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGuide(false);
      if (event.key === "Tab") {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            ".guide button, .guide input",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [showGuide]);
  function selectProgram(id: string) {
    if (id !== programs.activeId) setActiveLine(null);
    setShowExamples(false);
    setShowColors(false);
    programs.select(id);
  }
  function closeProgram(id: string) {
    if (programs.close(id) && active?.id === id) setActiveLine(null);
  }
  function newProgram() {
    let name = "nuovo_programma.nc",
      number = 1;
    while (programs.documents.some((doc) => doc.name === name))
      name = `nuovo_programma_${++number}.nc`;
    setActiveLine(null);
    programs.open([
      { name, source: "%\nO0001\n\nM30\n%", machine, diameter, saved: false },
    ]);
  }
  function example(kind: Machine) {
    const text = kind === "mill" ? millSample : latheSample;
    setActiveLine(null);
    programs.open([
      {
        name: kind === "mill" ? "O1001_piastra.nc" : "O2001_albero.nc",
        source: text,
        machine: kind,
        diameter,
        saved: true,
      },
    ]);
    setShowExamples(false);
  }
  async function openFiles(files: File[]) {
    const loaded = await Promise.all(
      files.map(async (file) => {
        if (file.size > 2 * 1024 * 1024)
          return { error: `${file.name}: supera il limite di 2 MB.` };
        try {
          return {
            program: {
              source: await file.text(),
              name: file.name,
              machine,
              diameter,
              saved: true,
            },
          };
        } catch {
          return { error: `Impossibile leggere ${file.name}.` };
        }
      }),
    );
    const opened = loaded.flatMap((item) =>
      item.program ? [item.program] : [],
    );
    if (opened.length) {
      setActiveLine(null);
      programs.open(opened);
    }
    const errors = loaded.flatMap((item) => (item.error ? [item.error] : []));
    setNotice(
      errors.length
        ? errors.join(" ")
        : `${opened.length === 1 ? "File aperto" : `${opened.length} file aperti`}. Seleziona Fresatrice o Tornio prima di simulare o inviare.`,
    );
  }
  function saveFile() {
    if (!active) return;
    downloadText(source, filename);
    programs.update(active.id, { savedSource: source });
    setNotice("Download del programma avviato.");
  }
  const codes = [
    "G0",
    "G1",
    "G2",
    "G3",
    "G4",
    "G10",
    "G17",
    "G18",
    "G19",
    "G20",
    "G21",
    "G28",
    "G40",
    "G41",
    "G42",
    "G43",
    "G49",
    "G54",
    "G55",
    "G56",
    "G57",
    "G58",
    "G59",
    "G70",
    "G71",
    "G72",
    "G73",
    "G74",
    "G75",
    "G76",
    "G80",
    "G81",
    "G83",
    "G84",
    "G90",
    "G91",
    "G92",
    "G94",
    "G95",
    "G96",
    "G97",
    "G98",
    "G99",
    "M0",
    "M1",
    "M2",
    "M3",
    "M4",
    "M5",
    "M6",
    "M7",
    "M8",
    "M9",
    "M19",
    "M26",
    "M30",
    "M98",
    "M99",
  ]
    .map((c) => codeInfo(c, machine))
    .filter((c) =>
      `${c.code} ${c.title}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className="app">
      <aside className="rail" aria-label="Pagine dell’app">
        <div className="app-mark">
          <Activity size={24} />
        </div>
        <a
          className={tab === "workspace" ? "rail-button active" : "rail-button"}
          title="Simulazione"
          aria-label="Simulazione"
          href="#simulazione"
          aria-current={tab === "workspace" ? "page" : undefined}
        >
          <Code2 size={21} />
        </a>
        <a
          className={tab === "serial" ? "rail-button active" : "rail-button"}
          title="Trasmissione"
          aria-label="Trasmissione"
          href="#trasmissione"
          aria-current={tab === "serial" ? "page" : undefined}
        >
          <Cable size={21} />
        </a>
        <a
          className={tab === "receive" ? "rail-button active" : "rail-button"}
          title="Ricezione"
          aria-label="Ricezione"
          href="#ricezione"
          aria-current={tab === "receive" ? "page" : undefined}
        >
          <ArrowDownToLine size={21} />
          {receiving && <i className="status-dot" />}
        </a>
        <div className="rail-spacer" />
        <a
          className={tab === "settings" ? "rail-button active" : "rail-button"}
          title="Impostazioni"
          aria-label="Impostazioni"
          href="#impostazioni"
          aria-current={tab === "settings" ? "page" : undefined}
        >
          <Settings2 size={21} />
        </a>
        <button
          className="rail-button"
          title="Guida codici G e M"
          aria-label="Guida codici G e M"
          onClick={() => setShowGuide(true)}
        >
          <BookOpen size={20} />
        </button>
        <span className="rail-version">v0.1</span>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="app-context">
            <div className="brand">
              CNC<span>studio</span>
            </div>
            <h1>{pageTitle[tab]}</h1>
          </div>
          <div
            className="machine-select"
            role="group"
            aria-label="Impostazioni macchina"
            hidden={tab !== "workspace"}
          >
            <span>Macchina</span>
            <select
              aria-label="Tipo macchina"
              value={machine}
              onChange={(e) => setMachine(e.target.value as Machine)}
            >
              <option value="mill">Fresatrice · 3 assi</option>
              <option value="lathe">Tornio · XZ</option>
            </select>
            {machine === "lathe" && tab === "workspace" && (
              <select
                aria-label="Modalità asse X tornio"
                value={diameter ? "diameter" : "radius"}
                onChange={(e) => setDiameter(e.target.value === "diameter")}
              >
                <option value="diameter">X a diametro</option>
                <option value="radius">X a raggio</option>
              </select>
            )}
          </div>
          <div
            className="file-actions"
            role="group"
            aria-label="Comandi file"
            hidden={tab === "settings"}
          >
            <input
              hidden
              type="file"
              multiple
              ref={fileInput}
              accept=".nc,.cnc,.tap,.txt,.iso,.mpf,.gcode"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                if (files.length) void openFiles(files);
                e.target.value = "";
              }}
            />
            <button
              className="button"
              aria-label="Apri programma"
              title="Apri programma"
              hidden={tab === "receive"}
              onClick={() => fileInput.current?.click()}
            >
              <FolderOpen size={16} />
              <span className="file-action-label">Apri</span>
            </button>
            <button
              className="button primary"
              aria-label="Salva file"
              title="Salva file"
              onClick={saveFile}
              disabled={!active}
              hidden={tab === "receive"}
            >
              <ArrowDownToLine size={16} />
              <span className="file-action-label">Salva</span>
            </button>
            <button
              className="button"
              aria-label="Nuova ricezione"
              title="Nuova ricezione"
              hidden={tab !== "receive"}
              disabled={receiving}
              onClick={reception.clear}
            >
              <Plus size={16} />
              <span className="file-action-label">Nuova</span>
            </button>
            <button
              className="button primary"
              aria-label="Salva ricevuto"
              title="Salva ricevuto"
              hidden={tab !== "receive"}
              disabled={!reception.text}
              onClick={reception.save}
            >
              <ArrowDownToLine size={16} />
              <span className="file-action-label">Salva</span>
            </button>
          </div>
          <div
            className={`topbar-right ${tab === "settings" ? "settings-topbar-right" : ""}`}
          >
            <span className="local-pill">
              <i />
              Progetto locale
            </span>
            <button
              className="icon-button"
              title="Guida codici"
              aria-label="Apri guida codici"
              onClick={() => setShowGuide(true)}
            >
              <BookOpen size={17} />
            </button>
          </div>
        </header>
        <main>
          {notice && (
            <div className="notice" role="status">
              <Info size={15} />
              {notice}
              <button
                className="icon-button"
                aria-label="Chiudi notifica"
                onClick={() => setNotice("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {tab !== "receive" && tab !== "settings" && (
            <ProgramTabs
              documents={programs.documents}
              activeId={programs.activeId}
              onSelect={selectProgram}
              onClose={closeProgram}
              onRename={(id, name) => programs.update(id, { name })}
              onNew={newProgram}
              previewVisible={programs.previewVisible}
              onTogglePreview={programs.togglePreview}
              showPreviewToggle={tab === "workspace" && !!active}
            />
          )}
          <div
            className={`workspace ${tab === "workspace" ? `simulation-page${simulationVisible ? "" : " editor-only"}` : "transmission-page"}`}
            hidden={tab === "settings"}
          >
            <div className="editor-column" hidden={tab === "receive"}>
              {active ? (
                <section
                  className="editor panel"
                  role="tabpanel"
                  id="program-panel"
                  aria-labelledby={`program-tab-${active.id}`}
                >
                  <div className="panel-head editor-head editor-toolbar">
                    <div className="icon-group">
                      <button
                        className="icon-button"
                        aria-label="Annulla modifica"
                        title="Annulla (Ctrl+Z)"
                        disabled={!history.canUndo}
                        onClick={() => programEditor.current?.undo()}
                      >
                        <Undo2 size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Ripristina modifica"
                        title="Ripristina (Ctrl+Y)"
                        disabled={!history.canRedo}
                        onClick={() => programEditor.current?.redo()}
                      >
                        <Redo2 size={16} />
                      </button>
                      <button
                        className="examples-toggle spacing-button"
                        title="Inserisci spazi tra i codici"
                        aria-label="Inserisci spazi"
                        onClick={() => {
                          setShowExamples(false);
                          setShowColors(false);
                          programEditor.current?.insertSpaces();
                        }}
                      >
                        <Space size={15} />
                        <span>Spazi</span>
                      </button>
                      <button
                        className="examples-toggle"
                        hidden={tab !== "workspace"}
                        aria-label="Esempi di programma"
                        aria-expanded={showExamples}
                        onClick={() => {
                          setShowExamples(!showExamples);
                          setShowColors(false);
                        }}
                      >
                        <FileCode2 size={13} />
                        Esempi
                      </button>
                      <button
                        className={`icon-button ${showColors ? "active" : ""}`}
                        title="Personalizza colori"
                        aria-label="Personalizza colori"
                        onClick={() => {
                          setShowColors(!showColors);
                          setShowExamples(false);
                        }}
                      >
                        <PaletteIcon size={16} />
                      </button>
                    </div>
                  </div>
                  {showExamples && tab === "workspace" && (
                    <div
                      className="examples editor-examples"
                      role="group"
                      aria-label="Programmi di esempio"
                    >
                      <span>PROGRAMMI DI ESEMPIO</span>
                      <button onClick={() => example("mill")}>
                        <FileCode2 size={14} />
                        Profilo fresatura
                      </button>
                      <button onClick={() => example("lathe")}>
                        <FileCode2 size={14} />
                        Profilo tornitura
                      </button>
                      <p>
                        Passa il mouse sui codici G e M per visualizzarne il
                        significato. La guida completa è disponibile dalla barra
                        di sinistra.
                      </p>
                    </div>
                  )}
                  {showColors && (
                    <div className="color-settings">
                      <div className="color-settings-head">
                        <strong>Colori dell’editor</strong>
                        <button
                          className="text-button"
                          onClick={() => setPalette(defaultPalette)}
                        >
                          <RotateCcw size={12} />
                          Ripristina
                        </button>
                      </div>
                      {(Object.keys(defaultPalette) as (keyof Palette)[]).map(
                        (key) => (
                          <label key={key}>
                            <input
                              aria-label={`Colore ${colorNames[key]}`}
                              type="color"
                              value={palette[key]}
                              onChange={(e) =>
                                setPalette((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                            />
                            {colorNames[key]}
                          </label>
                        ),
                      )}
                    </div>
                  )}
                  <div
                    className={`execution-bar ${activeLine !== null ? "tracking" : ""}`}
                    hidden={!simulationVisible}
                  >
                    <span className="execution-position">
                      {activeLine === null
                        ? "Avvia la simulazione per seguire il codice"
                        : `Riga in simulazione: ${activeLine}`}
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={followSimulation}
                        onChange={(e) => setFollowSimulation(e.target.checked)}
                      />
                      Segui riga
                    </label>
                  </div>
                  <Editor
                    ref={programEditor}
                    documentId={active.id}
                    openDocumentIds={programs.documents.map((doc) => doc.id)}
                    onHistoryChange={onHistoryChange}
                    value={source}
                    onChange={setSource}
                    machine={machine}
                    palette={palette}
                    onCursor={onCursor}
                    simulationLine={simulationVisible ? activeLine : null}
                    followSimulation={simulationVisible && followSimulation}
                  />
                  <div className="editor-status">
                    <span>
                      Ln {cursor.line}, Col {cursor.col}
                    </span>
                    <span>{source.split("\n").length} righe</span>
                    <span>G-code / ISO</span>
                    <span>UTF-8</span>
                  </div>
                </section>
              ) : (
                <section
                  className="editor panel empty-programs"
                  id="program-panel"
                >
                  <FileCode2 size={32} />
                  <h2>Nessun programma aperto</h2>
                  <p>
                    Usa Apri per scegliere i file oppure + per creare un
                    programma.
                  </p>
                </section>
              )}
            </div>
            <ReceivedDocument
              file={reception}
              machine={machine}
              palette={palette}
              receiving={receiving}
              visible={tab === "receive"}
            />
            <div
              className="preview-column"
              id="simulation-panel"
              hidden={!simulationVisible}
            >
              <Simulation
                key={active?.id ?? "empty"}
                result={result}
                machine={machine}
                onLine={onLine}
                active={simulationVisible}
              />
            </div>
            <div className="serial-column" hidden={tab === "workspace"}>
              <SerialPanel
                source={source}
                filename={filename}
                machines={machineProfiles.machines}
                selectedId={machineProfiles.selectedId}
                onSelectMachine={(id) => {
                  if (!lockedMachine) machineProfiles.select(id);
                }}
                onLockChange={setLockedMachine}
                mode={tab === "receive" ? "receive" : "send"}
                receiving={receiving}
                receivedLength={reception.text.length}
                onReceive={reception.append}
                onReceivingChange={setReceiving}
              />
            </div>
          </div>
          <MachineSettings
            machines={machineProfiles.machines}
            lockedId={lockedMachine}
            visible={tab === "settings"}
            onDirtyChange={setMachineSettingsDirty}
            onSave={(profile) =>
              lockedMachine !== profile.id &&
              machineProfiles.save(profile, !lockedMachine)
            }
            onDelete={(id) =>
              lockedMachine !== id && machineProfiles.remove(id)
            }
          />
        </main>
      </div>
      {showGuide && (
        <div className="modal-backdrop" onClick={() => setShowGuide(false)}>
          <section
            className="guide modal"
            role="dialog"
            aria-modal="true"
            aria-label="Guida codici G e M"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowGuide(false);
            }}
          >
            <div className="panel-head">
              <div className="panel-title">
                <BookOpen size={18} />
                Guida codici G e M
              </div>
              <button
                className="icon-button"
                aria-label="Chiudi guida"
                onClick={() => setShowGuide(false)}
                autoFocus
              >
                <X size={19} />
              </button>
            </div>
            <p>
              Riferimento generale per{" "}
              {machine === "lathe" ? "tornio" : "fresatrice"}. Consulta il
              manuale del tuo controllo per le varianti.
            </p>
            <input
              className="search-input"
              aria-label="Cerca codice"
              placeholder="Cerca un codice o una funzione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="code-list">
              {codes.map((c) => (
                <article key={c.code}>
                  <code>{c.code}</code>
                  <div>
                    <strong>{c.title}</strong>
                    <p>{c.description}</p>
                  </div>
                </article>
              ))}
              {!codes.length && <p>Nessun codice corrispondente.</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
