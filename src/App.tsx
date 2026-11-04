import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  BookOpen,
  Check,
  Cable,
  Code2,
  FileCode2,
  FolderOpen,
  Info,
  Palette as PaletteIcon,
  Plus,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { Editor, defaultPalette, type Palette } from "./components/Editor";
import { Simulation } from "./components/Simulation";
import { SerialPanel } from "./components/SerialPanel";
import { ReceivedDocument } from "./components/ReceivedDocument";
import { downloadText } from "./lib/files";
import { useReceivedDocument } from "./lib/useReceivedDocument";
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
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem("cnc.draft") ?? "null");
    if (typeof d?.source === "string" && typeof d?.name === "string")
      return d as { source: string; name: string; machine: Machine };
  } catch {}
  return null;
}
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
const initial = readDraft();
function currentPage(): "workspace" | "serial" | "receive" {
  if (window.location.hash === "#ricezione") return "receive";
  return window.location.hash === "#trasmissione" ? "serial" : "workspace";
}
const pageContent = {
  workspace: {
    eyebrow: "SIMULAZIONE CNC",
    title: "Dal codice al percorso.",
    description: "Scrivi il programma e segui il percorso utensile.",
  },
  serial: {
    eyebrow: "TRASMISSIONE CNC",
    title: "Dal programma alla macchina.",
    description:
      "Controlla il programma aperto e trasferiscilo al controllo CNC.",
  },
  receive: {
    eyebrow: "RICEZIONE CNC",
    title: "Dalla macchina al tuo file.",
    description:
      "Ricevi il programma dalla CNC in un documento dedicato e salvalo sul PC.",
  },
};
export default function App() {
  const [source, setSource] = useState(initial?.source ?? millSample),
    [saved, setSaved] = useState(initial?.source ?? millSample),
    [filename, setFilename] = useState(initial?.name ?? "O1001_piastra.nc"),
    [machine, setMachine] = useState<Machine>(
      initial?.machine === "lathe" ? "lathe" : "mill",
    ),
    [diameter, setDiameter] = useState(true),
    [palette, setPalette] = useState(readPalette),
    [showColors, setShowColors] = useState(false),
    [showGuide, setShowGuide] = useState(false),
    [cursor, setCursor] = useState({ line: 1, col: 1 }),
    [activeLine, setActiveLine] = useState<number | null>(null),
    [followSimulation, setFollowSimulation] = useState(true),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [receiving, setReceiving] = useState(false),
    [tab, setTab] = useState(currentPage);
  const reception = useReceivedDocument(setNotice);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = source !== saved;
  const result = useMemo(
    () => simulate(source, machine, diameter),
    [source, machine, diameter],
  );
  useEffect(() => {
    const updatePage = () => setTab(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        "cnc.draft",
        JSON.stringify({ source, name: filename, machine }),
      );
    } catch {
      setNotice("Spazio locale esaurito: salva il programma su file.");
    }
  }, [source, filename, machine]);
  useEffect(() => {
    try {
      localStorage.setItem("cnc.palette", JSON.stringify(palette));
    } catch {}
  }, [palette]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty || reception.dirty || receiving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty, reception.dirty, receiving]);
  const onCursor = useCallback(
      (line: number, col: number) => setCursor({ line, col }),
      [],
    ),
    onLine = useCallback((line: number | null) => setActiveLine(line), []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (tab === "receive") reception.save();
        else {
          downloadText(source, filename);
          setSaved(source);
          setNotice("Download del programma avviato.");
        }
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
  }, [source, filename, tab, reception.save]);
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
  function canReplace() {
    return (
      !dirty ||
      window.confirm(
        "Hai modifiche non salvate su file. Vuoi sostituire il programma aperto?",
      )
    );
  }
  function example(kind: Machine) {
    if (!canReplace()) return;
    const text = kind === "mill" ? millSample : latheSample;
    setMachine(kind);
    setSource(text);
    setSaved(text);
    setFilename(kind === "mill" ? "O1001_piastra.nc" : "O2001_albero.nc");
  }
  async function openFile(file: File) {
    if (!canReplace()) return;
    if (file.size > 2 * 1024 * 1024) {
      setNotice("Il file supera il limite di 2 MB.");
      return;
    }
    try {
      const text = await file.text();
      setSource(text);
      setSaved(text);
      setFilename(file.name);
      setNotice(
        tab === "workspace"
          ? "File aperto. Seleziona Fresatrice o Tornio prima di simulare."
          : "File aperto. Controlla il programma e i parametri prima dell’invio.",
      );
    } catch {
      setNotice("Impossibile leggere il file.");
    }
  }
  function saveFile() {
    downloadText(source, filename);
    setSaved(source);
    setNotice("Download del programma avviato.");
  }
  const codes = [
    "G0",
    "G1",
    "G2",
    "G3",
    "G4",
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
      <aside className="rail">
        <div className="app-mark">
          <Activity size={24} />
        </div>
        <a
          className={tab === "workspace" ? "rail-button active" : "rail-button"}
          title="Editor e simulazione"
          aria-label="Editor e simulazione"
          href="#simulazione"
          aria-current={tab === "workspace" ? "page" : undefined}
        >
          <Code2 size={21} />
        </a>
        <a
          className={tab === "serial" ? "rail-button active" : "rail-button"}
          title="Configuratore seriale"
          aria-label="Configuratore seriale"
          href="#trasmissione"
          aria-current={tab === "serial" ? "page" : undefined}
        >
          <Settings2 size={21} />
        </a>
        <a
          className={tab === "receive" ? "rail-button active" : "rail-button"}
          title="Ricezione dalla macchina"
          aria-label="Ricezione dalla macchina"
          href="#ricezione"
          aria-current={tab === "receive" ? "page" : undefined}
        >
          <ArrowDownToLine size={21} />
        </a>
        <div className="rail-spacer" />
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
          <div className="brand">
            CNC<span>studio</span>
            <span className="brand-divider" />
            <small>Il tuo spazio di lavorazione</small>
          </div>
          <div className="topbar-right">
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
          <div className="page-heading">
            <div>
              <div className="eyebrow">{pageContent[tab].eyebrow}</div>
              <h1>{pageContent[tab].title}</h1>
              <p>{pageContent[tab].description}</p>
            </div>
            <div className="file-actions">
              <input
                hidden
                type="file"
                ref={fileInput}
                accept=".nc,.cnc,.tap,.txt,.iso,.mpf,.gcode"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void openFile(file);
                  e.target.value = "";
                }}
              />
              <button
                className="button"
                hidden={tab === "receive"}
                onClick={() => fileInput.current?.click()}
              >
                <FolderOpen size={16} />
                Apri programma
              </button>
              <button
                className="button primary"
                onClick={saveFile}
                hidden={tab === "receive"}
              >
                <ArrowDownToLine size={16} />
                Salva file
              </button>
              <button
                className="button"
                hidden={tab !== "receive"}
                disabled={receiving}
                onClick={reception.clear}
              >
                <Plus size={16} />
                Nuova ricezione
              </button>
              <button
                className="button primary"
                hidden={tab !== "receive"}
                disabled={!reception.text}
                onClick={reception.save}
              >
                <ArrowDownToLine size={16} />
                Salva ricevuto
              </button>
            </div>
          </div>
          <div className="workspace-bar">
            <nav className="page-tabs" aria-label="Pagine dell’app">
              <a
                href="#simulazione"
                aria-current={tab === "workspace" ? "page" : undefined}
              >
                <Code2 size={16} />
                Simulazione
              </a>
              <a
                href="#trasmissione"
                aria-current={tab === "serial" ? "page" : undefined}
              >
                <Cable size={16} />
                Trasmissione
              </a>
              <a
                href="#ricezione"
                aria-current={tab === "receive" ? "page" : undefined}
              >
                <ArrowDownToLine size={16} />
                Ricezione {receiving && <i className="status-dot" />}
              </a>
            </nav>
            <div className="machine-select">
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
          </div>
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
          <div
            className={`workspace ${tab === "workspace" ? "simulation-page" : "transmission-page"}`}
          >
            <div className="editor-column" hidden={tab === "receive"}>
              <section className="editor panel">
                <div className="panel-head editor-head">
                  <div className="file-tab">
                    <FileCode2 size={16} />
                    <input
                      aria-label="Nome file"
                      value={filename}
                      onChange={(e) =>
                        setFilename(
                          e.target.value.replace(/[\\/:*?"<>|]/g, "_") ||
                            "programma.nc",
                        )
                      }
                    />
                    {dirty && (
                      <i
                        className="unsaved"
                        title="Modifiche da salvare su file"
                      />
                    )}
                  </div>
                  <div className="icon-group">
                    <button
                      className={`icon-button ${showColors ? "active" : ""}`}
                      title="Personalizza colori"
                      aria-label="Personalizza colori"
                      onClick={() => setShowColors(!showColors)}
                    >
                      <PaletteIcon size={16} />
                    </button>
                    <button
                      className="icon-button"
                      title="Nuovo programma"
                      aria-label="Nuovo programma"
                      onClick={() => {
                        if (canReplace()) {
                          setSource("%\nO0001\n\nM30\n%");
                          setSaved("");
                          setFilename("nuovo_programma.nc");
                        }
                      }}
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                </div>
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
                  hidden={tab !== "workspace"}
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
                  value={source}
                  onChange={setSource}
                  machine={machine}
                  palette={palette}
                  onCursor={onCursor}
                  simulationLine={tab === "workspace" ? activeLine : null}
                  followSimulation={tab === "workspace" && followSimulation}
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
              <div className="editor-tip">
                <div className="tip-icon">
                  <Info size={16} />
                </div>
                <p>
                  <strong>Un aiuto, proprio dove serve.</strong>
                  <br />
                  Passa il mouse sui codici{" "}
                  <span style={{ color: palette.g }}>G</span> e{" "}
                  <span style={{ color: palette.m }}>M</span> per scoprirne il
                  significato.
                </p>
              </div>
              <div className="examples" hidden={tab !== "workspace"}>
                <span>INIZIA DA UN ESEMPIO</span>
                <button onClick={() => example("mill")}>
                  <FileCode2 size={14} />
                  Profilo fresatura
                </button>
                <button onClick={() => example("lathe")}>
                  <FileCode2 size={14} />
                  Profilo tornitura
                </button>
              </div>
            </div>
            <ReceivedDocument
              file={reception}
              machine={machine}
              palette={palette}
              receiving={receiving}
              visible={tab === "receive"}
            />
            <div className="preview-column" hidden={tab !== "workspace"}>
              <Simulation
                result={result}
                machine={machine}
                onLine={onLine}
                active={tab === "workspace"}
              />
              <div className="preview-caption">
                <Check size={14} />
                <span>Aggiornamento automatico durante la scrittura</span>
                <span>
                  {activeLine === null ? "Pronto" : `Riga ${activeLine}`}
                </span>
              </div>
            </div>
            <div className="serial-column" hidden={tab === "workspace"}>
              <SerialPanel
                source={source}
                filename={filename}
                mode={tab === "receive" ? "receive" : "send"}
                receiving={receiving}
                receivedLength={reception.text.length}
                onReceive={reception.append}
                onReceivingChange={setReceiving}
              />
              <div className="machine-note">
                <Info size={15} />
                <p>
                  Il significato di alcuni codici varia con il controllo.
                  Verifica sempre il manuale Fanuc, Mitsubishi o del
                  costruttore.
                </p>
              </div>
            </div>
          </div>
        </main>
        <footer>
          <span>
            <i className="status-dot" />
            Bozza conservata in questo browser
          </span>
          <span>Editor ISO · Simulazione geometrica · Seriale RS-232</span>
        </footer>
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
