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
  Search,
  Replace,
  ArrowUp,
  ArrowDown,
  StepBack,
  StepForward,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Printer,
  ClipboardList,
  X,
} from "lucide-react";
import {
  Editor,
  defaultPalette,
  type EditorHandle,
  type EditorHistory,
  type EditorSearchMode,
  type Palette,
} from "./components/Editor";
import { Simulation } from "./components/Simulation";
import { SerialPanel } from "./components/SerialPanel";
import { ReceivedDocument } from "./components/ReceivedDocument";
import { ProgramTabs } from "./components/ProgramTabs";
import { MachineSettings } from "./components/MachineSettings";
import { ProgramAdjustment } from "./components/ProgramAdjustment";
import { SaveAsDialog } from "./components/SaveAsDialog";
import {
  ToolListDialog,
  ToolListContent,
  type ToolListDocument,
} from "./components/ToolListDialog";
import { createToolList, toolListText } from "./lib/toolList";
import { downloadText } from "./lib/files";
import type { AdjustmentWord, TextRange } from "./lib/programTools";
import { useMachineProfiles } from "./lib/useMachineProfiles";
import {
  openMachineFiles,
  saveMachineFile,
  extensions,
} from "./lib/machineFiles";
import { directoryOptions } from "./lib/serialOptions";
import { useReceivedDocument } from "./lib/useReceivedDocument";
import { useProgramDocuments } from "./lib/useProgramDocuments";
import { simulate } from "./lib/simulator";
import { codeInfo, type Machine } from "./lib/codes";
import { millSample, latheSample } from "./lib/samples";
import { readPalette, type PaletteColor } from "./lib/editorAppearance";
const colorNames: Record<PaletteColor, string> = {
  motion: "Movimenti e quote",
  auxiliary: "Istruzioni ausiliarie",
  lineNumber: "Numeri di riga",
  g: "Codici G",
  m: "Codici M",
  axis: "Coordinate e assi",
  value: "Valori numerici",
  comment: "Commenti",
  tool: "Utensili e correttori",
};
function currentPage(): "workspace" | "serial" | "receive" | "settings" {
  if (window.location.hash === "#impostazioni") return "settings";
  if (window.location.hash === "#ricezione") return "receive";
  return window.location.hash === "#trasmissione" ? "serial" : "workspace";
}
const pageTitle = {
  workspace: "Scrittura / Simulazione",
  serial: "Trasmissione",
  receive: "Ricezione",
  settings: "Impostazioni",
};
type SaveAsTarget =
  | { kind: "program"; id: string; name: string }
  | { kind: "receive"; name: string };

export default function App() {
  const [palette, setPalette] = useState(() => readPalette()),
    [showColors, setShowColors] = useState(false),
    [showExamples, setShowExamples] = useState(false),
    [showGuide, setShowGuide] = useState(false),
    [saveAsTarget, setSaveAsTarget] = useState<SaveAsTarget | null>(null),
    [toolListDocument, setToolListDocument] = useState<ToolListDocument | null>(
      null,
    ),
    [editorSearch, setEditorSearch] = useState<EditorSearchMode | null>(null),
    [cursor, setCursor] = useState({ line: 1, col: 1 }),
    [activeLine, setActiveLine] = useState<number | null>(null),
    [followSimulation, setFollowSimulation] = useState(true),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [receiving, setReceiving] = useState(false),
    [transmitting, setTransmitting] = useState(false),
    [lockedMachine, setLockedMachine] = useState<string | null>(null),
    [machineSettingsDirty, setMachineSettingsDirty] = useState(false),
    [adjustment, setAdjustment] = useState<{
      word: AdjustmentWord;
      selection?: TextRange;
    } | null>(null),
    [history, setHistory] = useState<EditorHistory>({
      canUndo: false,
      canRedo: false,
    }),
    [tab, setTab] = useState(currentPage);
  const [transferStatusHost, setTransferStatusHost] =
    useState<HTMLDivElement | null>(null);
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
  const reception = useReceivedDocument(setNotice, machineProfiles.selected);
  const fileInput = useRef<HTMLInputElement>(null);
  const programEditor = useRef<EditorHandle>(null);
  useEffect(() => setAdjustment(null), [active?.id, tab, source]);
  useEffect(() => {
    setSaveAsTarget(null);
    setToolListDocument(null);
  }, [active?.id, tab]);
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
  const onSearchChange = useCallback((mode: EditorSearchMode | null) => {
    setEditorSearch(mode);
    if (mode !== null) {
      setShowColors(false);
      setShowExamples(false);
      setAdjustment(null);
    }
  }, []);
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
      if (event.defaultPrevented) return;
      if (tab === "settings") return;
      if (toolListDocument) {
        if (
          (event.ctrlKey || event.metaKey) &&
          ["p", "s", "o"].includes(event.key.toLowerCase())
        ) {
          event.preventDefault();
          if (event.key.toLowerCase() === "p") printProgram();
        }
        return;
      }
      if (saveAsTarget) {
        if (
          (event.ctrlKey || event.metaKey) &&
          ["s", "o", "p"].includes(event.key.toLowerCase())
        )
          event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) openSaveAs();
        else if (tab === "receive") reception.save();
        else saveFile();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printProgram();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        if (tab === "receive")
          setNotice(
            "Per aprire un file usa la pagina Scrittura / Simulazione o Trasmissione.",
          );
        else void chooseFiles();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [
    active,
    tab,
    reception.save,
    reception.text,
    receiving,
    transmitting,
    programs.update,
    saveAsTarget,
    toolListDocument,
    machineProfiles.selected,
  ]);
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
    if (!showColors) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowColors(false);
        programEditor.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showColors]);
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
  function editorAction(action: () => void) {
    setShowExamples(false);
    setShowColors(false);
    setAdjustment(null);
    action();
  }
  function openAdjustment(word: AdjustmentWord) {
    setShowExamples(false);
    setShowColors(false);
    programEditor.current?.closeSearch();
    if (adjustment?.word === word) {
      setAdjustment(null);
      programEditor.current?.focus();
      return;
    }
    setAdjustment({ word, selection: programEditor.current?.selection() });
  }
  function toggleExamples() {
    programEditor.current?.closeSearch();
    setAdjustment(null);
    setShowColors(false);
    setShowExamples(!showExamples);
  }
  function toggleColors() {
    programEditor.current?.closeSearch();
    setAdjustment(null);
    setShowExamples(false);
    setShowColors(!showColors);
  }
  function goToTool(direction: -1 | 1) {
    editorAction(() => {
      if (!programEditor.current?.goToTool(direction))
        setNotice("Nessun cambio utensile riconosciuto nel programma attivo.");
    });
  }
  function findText(direction: -1 | 1) {
    editorAction(() => {
      if (!programEditor.current?.find(direction))
        setNotice("Testo non trovato nel programma attivo.");
    });
  }
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
    let name = "nuovo_programma.txt",
      number = 1;
    while (programs.documents.some((doc) => doc.name === name))
      name = `nuovo_programma_${++number}.txt`;
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
  async function chooseFiles() {
    try {
      const files = await openMachineFiles(machineProfiles.selected);
      if (files) await openFiles(files);
      else fileInput.current?.click();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setNotice(
          `Apertura non riuscita: ${e instanceof Error ? e.message : String(e)}`,
        );
    }
  }
  async function saveProgram(
    document: NonNullable<typeof active>,
    name: string,
  ) {
    try {
      const result = await saveMachineFile(
        document.source,
        name,
        "send",
        machineProfiles.selected,
      );
      programs.update(document.id, {
        name: result.name,
        savedSource: document.source,
      });
      setNotice(
        result.downloaded
          ? `Download di ${result.name} avviato.`
          : `File salvato: ${result.name}.`,
      );
      return true;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setNotice(
          `Salvataggio non riuscito: ${e instanceof Error ? e.message : String(e)}`,
        );
      return false;
    }
  }
  async function saveFile() {
    if (active) await saveProgram(active, filename);
  }
  function printProgram() {
    if (
      receiving ||
      transmitting ||
      tab === "settings" ||
      (tab === "receive" ? !reception.text : !active)
    )
      return;
    window.print();
  }
  function openSaveAs() {
    if (tab === "receive") {
      if (reception.text)
        setSaveAsTarget({
          kind: "receive",
          name:
            reception.name === "ricevuto.nc" && machineProfiles.selected
              ? `ricevuto.${directoryOptions(machineProfiles.selected.settings).receive.extension.replace(/^\./, "")}`
              : reception.name,
        });
    } else if (active && tab !== "settings") {
      const configured = machineProfiles.selected?.settings.directories?.send;
      setSaveAsTarget({
        kind: "program",
        id: active.id,
        name: configured
          ? `${active.name.replace(/\.[^.]+$/, "")}.${configured.extension.replace(/^\./, "")}`
          : active.name,
      });
    }
  }
  async function confirmSaveAs(name: string) {
    if (!saveAsTarget) return;
    if (saveAsTarget.kind === "receive") {
      if (!(await reception.saveAs(name))) return;
    } else {
      const document = programs.documents.find(
        (doc) => doc.id === saveAsTarget.id,
      );
      if (!document) {
        setSaveAsTarget(null);
        return;
      }
      if (!(await saveProgram(document, name))) return;
    }
    setSaveAsTarget(null);
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
          title={pageTitle.workspace}
          aria-label={pageTitle.workspace}
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
              Rama <span>Edit</span>
            </div>
            <h1>{pageTitle[tab]}</h1>
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
              accept={
                machineProfiles.selected
                  ? extensions(machineProfiles.selected, "send")
                      .map((e) => `.${e}`)
                      .join(",")
                  : ".nc,.cnc,.tap,.txt,.iso,.mpf,.gcode"
              }
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
              onClick={() => void chooseFiles()}
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
            <button
              className="button"
              aria-label="Salva con nome"
              title="Salva con nome (Ctrl+Maiusc+S)"
              disabled={tab === "receive" ? !reception.text : !active}
              onClick={openSaveAs}
            >
              <Save size={16} />
              <span className="file-action-label">Salva con nome</span>
            </button>
            <button
              className="button"
              aria-label="Stampa programma"
              title={
                receiving || transmitting
                  ? "Stampa disponibile al termine del trasferimento"
                  : "Stampa programma (Ctrl+P)"
              }
              disabled={
                receiving ||
                transmitting ||
                (tab === "receive" ? !reception.text : !active)
              }
              onClick={printProgram}
            >
              <Printer size={16} />
              <span className="file-action-label">Stampa</span>
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
            />
          )}
          <div
            className="panel-head editor-head editor-toolbar"
            role="toolbar"
            aria-label="Comandi del programma"
            hidden={tab === "settings" || (tab === "workspace" && !active)}
          >
            <div className="icon-group">
              <div
                className="program-tools"
                hidden={tab === "receive" || !active}
              >
                <div
                  className="toolbar-group"
                  role="group"
                  aria-label="Modifica programma"
                  data-label="Modifica"
                >
                  <button
                    className="icon-button"
                    aria-label="Annulla modifica"
                    title="Annulla (Ctrl+Z)"
                    disabled={!history.canUndo}
                    onClick={() => programEditor.current?.undo()}
                  >
                    <Undo2 size={16} />
                    <span className="toolbar-button-label">Annulla</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Ripristina modifica"
                    title="Ripristina (Ctrl+Y)"
                    disabled={!history.canRedo}
                    onClick={() => programEditor.current?.redo()}
                  >
                    <Redo2 size={16} />
                    <span className="toolbar-button-label">Ripristina</span>
                  </button>
                  <button
                    className="examples-toggle spacing-button"
                    title="Aggiungi spazi tra i codici"
                    aria-label="Aggiungi spazi"
                    onClick={() => {
                      setShowExamples(false);
                      setShowColors(false);
                      programEditor.current?.insertSpaces();
                    }}
                  >
                    <Space size={15} />
                    <span className="toolbar-button-label">Aggiungi spazi</span>
                  </button>
                </div>
                <div
                  className="toolbar-group"
                  hidden={tab !== "workspace"}
                  role="group"
                  aria-label="Modifica avanzamento e giri"
                  data-label="Parametri"
                >
                  <button
                    className="examples-toggle adjust-button"
                    title="Aggiusta avanzamento F"
                    aria-label="Aggiusta avanzamento"
                    aria-expanded={adjustment?.word === "F"}
                    aria-pressed={adjustment?.word === "F"}
                    onClick={() => openAdjustment("F")}
                  >
                    <b>F</b>
                    <span className="toolbar-button-label">Avanzamento</span>
                  </button>
                  <button
                    className="examples-toggle adjust-button"
                    title="Aggiusta giri mandrino S"
                    aria-label="Aggiusta giri mandrino"
                    aria-expanded={adjustment?.word === "S"}
                    aria-pressed={adjustment?.word === "S"}
                    onClick={() => openAdjustment("S")}
                  >
                    <b>S</b>
                    <span className="toolbar-button-label">Giri mandrino</span>
                  </button>
                </div>
                <div
                  className="toolbar-group"
                  hidden={tab !== "workspace"}
                  role="group"
                  aria-label="Ricerca e sostituzione"
                  data-label="Trova"
                >
                  <button
                    className="icon-button"
                    title="Trova (Ctrl+F)"
                    aria-label="Trova"
                    aria-expanded={editorSearch === "find"}
                    aria-pressed={editorSearch === "find"}
                    onClick={() =>
                      editorAction(() => programEditor.current?.toggleSearch())
                    }
                  >
                    <Search size={16} />
                    <span className="toolbar-button-label">Trova</span>
                  </button>
                  <button
                    className="icon-button"
                    title="Trova precedente (Maiusc+F3)"
                    aria-label="Trova precedente"
                    onClick={() => findText(-1)}
                  >
                    <ArrowUp size={15} />
                    <span className="toolbar-button-label">
                      Trova precedente
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    title="Trova prossimo (F3)"
                    aria-label="Trova prossimo"
                    onClick={() => findText(1)}
                  >
                    <ArrowDown size={15} />
                    <span className="toolbar-button-label">Trova prossimo</span>
                  </button>
                  <button
                    className="icon-button"
                    title="Sostituisci (Ctrl+H)"
                    aria-label="Sostituisci"
                    aria-expanded={editorSearch === "replace"}
                    aria-pressed={editorSearch === "replace"}
                    onClick={() =>
                      editorAction(() =>
                        programEditor.current?.toggleSearch(true),
                      )
                    }
                  >
                    <Replace size={16} />
                    <span className="toolbar-button-label">Sostituisci</span>
                  </button>
                </div>
                <div
                  className="toolbar-group"
                  role="group"
                  aria-label="Cambi utensile"
                  data-label="Utensili"
                >
                  <button
                    className="icon-button"
                    hidden={tab !== "workspace"}
                    title="Cambio utensile precedente"
                    aria-label="Cambio utensile precedente"
                    onClick={() => goToTool(-1)}
                  >
                    <StepBack size={16} />
                    <span className="toolbar-button-label">
                      Cambio utensile precedente
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    hidden={tab !== "workspace"}
                    title="Prossimo cambio utensile"
                    aria-label="Prossimo cambio utensile"
                    onClick={() => goToTool(1)}
                  >
                    <StepForward size={16} />
                    <span className="toolbar-button-label">
                      Prossimo cambio utensile
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Crea lista utensili"
                    title="Crea lista utensili"
                    aria-pressed={!!toolListDocument}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setShowColors(false);
                      setShowExamples(false);
                      setToolListDocument({
                        name: filename,
                        source,
                        machine,
                        list: createToolList(source, machine),
                      });
                    }}
                  >
                    <ClipboardList size={18} />
                    <span className="toolbar-button-label">
                      Crea lista utensili
                    </span>
                  </button>
                </div>
                <div
                  className="toolbar-group"
                  role="group"
                  aria-label="Aspetto dell’editor"
                  data-label="Aspetto"
                >
                  <button
                    className="examples-toggle"
                    hidden={tab !== "workspace"}
                    aria-label="Esempi di programma"
                    aria-expanded={showExamples}
                    aria-pressed={showExamples}
                    onClick={toggleExamples}
                  >
                    <FileCode2 size={13} />
                    <span className="toolbar-button-label">Esempi</span>
                  </button>
                  <button
                    className={`icon-button ${showColors ? "active" : ""}`}
                    title="Personalizza colori"
                    aria-label="Personalizza colori"
                    aria-expanded={showColors}
                    aria-pressed={showColors}
                    onClick={toggleColors}
                  >
                    <PaletteIcon size={16} />
                    <span className="toolbar-button-label">Colori</span>
                  </button>
                  {tab === "workspace" && (
                    <button
                      className="examples-toggle simulation-toggle"
                      aria-label={
                        programs.previewVisible
                          ? "Nascondi simulazione"
                          : "Mostra simulazione"
                      }
                      title={
                        programs.previewVisible
                          ? "Nascondi simulazione"
                          : "Mostra simulazione"
                      }
                      aria-expanded={programs.previewVisible}
                      aria-pressed={programs.previewVisible}
                      aria-controls="simulation-panel"
                      onClick={programs.togglePreview}
                    >
                      {programs.previewVisible ? (
                        <PanelRightClose size={16} />
                      ) : (
                        <PanelRightOpen size={16} />
                      )}
                      <span className="toolbar-button-label">
                        {programs.previewVisible
                          ? "Nascondi simulazione"
                          : "Mostra simulazione"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
              <SerialPanel
                visible={tab === "serial" || tab === "receive"}
                statusContainer={transferStatusHost}
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
                onSendingChange={setTransmitting}
              />
            </div>
          </div>
          <div
            className="transfer-status-host"
            ref={setTransferStatusHost}
            hidden={tab !== "serial" && tab !== "receive"}
          />
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
                  {adjustment && tab === "workspace" && (
                    <ProgramAdjustment
                      key={`${active.id}-${adjustment.word}`}
                      word={adjustment.word}
                      source={source}
                      selection={adjustment.selection}
                      onClose={() => {
                        setAdjustment(null);
                        programEditor.current?.focus();
                      }}
                      onApply={(value, range) => {
                        const count =
                          programEditor.current?.adjust(
                            adjustment.word,
                            value,
                            range,
                          ) ?? 0;
                        setAdjustment(null);
                        setNotice(
                          `${count} ${count === 1 ? "valore" : "valori"} ${adjustment.word} ${count === 1 ? "modificato" : "modificati"}. Annulla ripristina i valori precedenti.`,
                        );
                      }}
                    />
                  )}
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
                      <label className="color-mode">
                        Colorazione
                        <select
                          aria-label="Stile colorazione"
                          value={palette.mode}
                          onChange={(e) =>
                            setPalette((p) => ({
                              ...p,
                              mode: e.target.value as Palette["mode"],
                            }))
                          }
                        >
                          <option value="blocks">Colori per riga</option>
                          <option value="tokens">Colori per codice</option>
                        </select>
                      </label>
                      {(
                        (palette.mode === "blocks"
                          ? ["motion", "auxiliary", "comment", "lineNumber"]
                          : [
                              "g",
                              "m",
                              "axis",
                              "value",
                              "comment",
                              "tool",
                              "lineNumber",
                            ]) as PaletteColor[]
                      ).map((key) => (
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
                      ))}
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
                    onSearchChange={onSearchChange}
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
                diameter={diameter}
                onMachineChange={setMachine}
                onDiameterChange={setDiameter}
                onLine={onLine}
                active={simulationVisible}
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
      {toolListDocument && (
        <ToolListDialog
          document={toolListDocument}
          transferActive={receiving || transmitting}
          onClose={() => setToolListDocument(null)}
          onMachineChange={(next) => {
            setMachine(next);
            setToolListDocument(
              (d) =>
                d && {
                  ...d,
                  machine: next,
                  list: createToolList(d.source, next),
                },
            );
          }}
          onPrint={printProgram}
          onSave={() =>
            downloadText(
              toolListText(toolListDocument.list, toolListDocument.name),
              toolListDocument.name.replace(/\.[^.]+$/, "") + "_utensili.txt",
            )
          }
        />
      )}
      {saveAsTarget && (
        <SaveAsDialog
          initialName={saveAsTarget.name}
          receiving={saveAsTarget.kind === "receive" && receiving}
          onConfirm={confirmSaveAs}
          onClose={() => setSaveAsTarget(null)}
        />
      )}
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
      <section className="print-document" aria-label="Programma da stampare">
        {toolListDocument ? (
          <>
            <h1>Lista utensili · {toolListDocument.name}</h1>
            <ToolListContent list={toolListDocument.list} />
          </>
        ) : (
          <>
            <h1>{tab === "receive" ? reception.name : filename}</h1>
            <pre>{tab === "receive" ? reception.displayText : source}</pre>
          </>
        )}
      </section>
    </div>
  );
}
