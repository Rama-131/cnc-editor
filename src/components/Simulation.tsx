import { useEffect, useId, useMemo, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Plus,
  Minus,
  ScanLine,
} from "lucide-react";
import type { Point, Simulation as Result } from "../lib/simulator";
import type { Machine } from "../lib/codes";
type View = "ISO" | "XY" | "XZ" | "YZ";
const project = (p: Point, v: View): [number, number] =>
  v === "XY"
    ? [p.x, -p.y]
    : v === "XZ"
      ? [p.z, -p.x]
      : v === "YZ"
        ? [p.y, -p.z]
        : [(p.x - p.y) * 0.866, (p.x + p.y) * 0.5 - p.z];

function AxisIndicator({ view }: { view: View }) {
  const id = useId();
  const axes: (keyof Point)[] =
    view === "ISO"
      ? ["x", "y", "z"]
      : view === "XY"
        ? ["x", "y"]
        : view === "XZ"
          ? ["x", "z"]
          : ["y", "z"];
  const colors = { x: "#ef8f88", y: "#77dca9", z: "#83b6ed" };
  const origin = view === "ISO" ? [70, 80] : [32, 100];
  const length = view === "ISO" ? 50 : 60;

  return (
    <svg
      className={`axis-indicator ${view === "ISO" ? "axis-isometric" : ""}`}
      viewBox="0 0 140 128"
      role="img"
      aria-label={`Versi positivi degli assi ${axes.map((axis) => `+${axis.toUpperCase()}`).join(", ")}`}
    >
      {axes.map((axis) => {
        const unit = { x: 0, y: 0, z: 0 };
        unit[axis] = 1;
        const [dx, dy] = project(unit, view);
        const magnitude = Math.hypot(dx, dy);
        const x = origin[0] + (dx / magnitude) * length;
        const y = origin[1] + (dy / magnitude) * length;
        const arrow = `${id}-${axis}`;
        return (
          <g key={axis}>
            <defs>
              <marker
                id={arrow}
                viewBox="0 0 6 6"
                markerWidth="4"
                markerHeight="4"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0 0L6 3L0 6Z" fill={colors[axis]} />
              </marker>
            </defs>
            <line
              x1={origin[0]}
              y1={origin[1]}
              x2={x}
              y2={y}
              stroke={colors[axis]}
              strokeWidth="3"
              strokeLinecap="round"
              markerEnd={`url(#${arrow})`}
            />
            <text
              x={x + (dx / magnitude) * 15}
              y={y + (dy / magnitude) * 15}
              fill={colors[axis]}
              fontSize="17"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="central"
            >
              +{axis.toUpperCase()}
            </text>
          </g>
        );
      })}
      <circle cx={origin[0]} cy={origin[1]} r="3.5" fill="#d4e0e9" />
    </svg>
  );
}
export function Simulation({
  result,
  machine,
  onLine,
  active = true,
}: {
  result: Result;
  machine: Machine;
  onLine: (n: number | null) => void;
  active?: boolean;
}) {
  const [view, setView] = useState<View>(machine === "lathe" ? "XZ" : "ISO"),
    [progress, setProgress] = useState(100),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1),
    [zoom, setZoom] = useState(1),
    [rapids, setRapids] = useState(true);
  const [trackedResult, setTrackedResult] = useState<Result | null>(null);
  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);
  useEffect(() => {
    setView(machine === "lathe" ? "XZ" : "ISO");
  }, [machine]);
  useEffect(() => {
    setPlaying(false);
    setProgress(100);
    setTrackedResult(null);
  }, [result]);
  useEffect(() => {
    if (!playing || !active) return;
    const timer = setInterval(
      () =>
        setProgress((p) => {
          const next = p + 0.7 * speed;
          if (next >= 100) setPlaying(false);
          return Math.min(100, next);
        }),
      40,
    );
    return () => clearInterval(timer);
  }, [playing, speed, active]);
  const count = Math.round((result.segments.length * progress) / 100),
    segment = result.segments[Math.max(0, count - 1)];
  const currentPoint = count > 0 ? segment?.to : segment?.from;
  const currentLine = trackedResult === result ? (segment?.line ?? null) : null;
  useEffect(() => {
    onLine(currentLine);
  }, [currentLine, onLine]);
  const drawing = useMemo(() => {
    const points = result.segments.flatMap((s) => [
      project(s.from, view),
      project(s.to, view),
    ]);
    points.push([0, 0]);
    let minX = 0,
      maxX = 0,
      minY = 0,
      maxY = 0;
    for (const [x, y] of points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const scale =
      Math.min(
        500 / Math.max(10, maxX - minX),
        320 / Math.max(10, maxY - minY),
      ) * zoom;
    const at = (p: [number, number]) => [
      320 + (p[0] - (minX + maxX) / 2) * scale,
      205 + (p[1] - (minY + maxY) / 2) * scale,
    ];
    const path = (rapid: boolean) =>
      result.segments
        .slice(0, count)
        .filter((s) => s.rapid === rapid)
        .map((s) => {
          const a = at(project(s.from, view)),
            b = at(project(s.to, view));
          return `M${a[0].toFixed(2)},${a[1].toFixed(2)}L${b[0].toFixed(2)},${b[1].toFixed(2)}`;
        })
        .join("");
    return {
      cut: path(false),
      rapid: path(true),
      tool: currentPoint ? at(project(currentPoint, view)) : null,
      origin: at([0, 0]),
    };
  }, [result, view, zoom, count, currentPoint]);
  return (
    <section className="simulation panel">
      <div className="panel-head">
        <div className="panel-title">
          <ScanLine size={16} />
          <span>Simulazione percorso</span>
        </div>
        <span className="badge">
          {machine === "lathe" ? "TORNIO" : "FRESATRICE"}
        </span>
      </div>
      <div className="view-toolbar">
        <div className="segmented">
          {(["ISO", "XY", "XZ", "YZ"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={view === v ? "selected" : ""}
            >
              {v === "ISO" ? "3D" : v}
            </button>
          ))}
        </div>
        <div className="icon-group">
          <button
            className="icon-button"
            title="Riduci"
            aria-label="Riduci vista"
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.3))}
          >
            <Minus size={15} />
          </button>
          <button
            className="icon-button"
            title="Ingrandisci"
            aria-label="Ingrandisci vista"
            onClick={() => setZoom((z) => Math.min(8, z * 1.3))}
          >
            <Plus size={15} />
          </button>
          <button
            className="icon-button"
            title="Adatta alla vista"
            aria-label="Adatta alla vista"
            onClick={() => setZoom(1)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="viewport">
        <div className="viewport-label">
          {view === "ISO" ? "VISTA ISOMETRICA" : `PIANO ${view}`}
          <span>Coordinate pezzo · mm</span>
        </div>
        <svg
          viewBox="0 0 640 410"
          role="img"
          aria-label="Percorso utensile simulato"
        >
          <defs>
            <pattern
              id="grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M24 0H0V24"
                fill="none"
                stroke="#25303a"
                strokeWidth=".6"
              />
            </pattern>
            <radialGradient id="shade">
              <stop offset="0" stopColor="#1b252e" />
              <stop offset="1" stopColor="#141b22" />
            </radialGradient>
          </defs>
          <rect width="640" height="410" fill="url(#shade)" />
          <rect width="640" height="410" fill="url(#grid)" />
          <g opacity=".5">
            <path
              d={`M${drawing.origin[0] - 10} ${drawing.origin[1]}h20M${drawing.origin[0]} ${drawing.origin[1] - 10}v20`}
              stroke="#a6b3c1"
            />
            <text
              x={drawing.origin[0] + 8}
              y={drawing.origin[1] + 17}
              fill="#8291a1"
              fontSize="10"
            >
              0
            </text>
          </g>
          {rapids && (
            <path
              d={drawing.rapid}
              fill="none"
              stroke="#6c91b5"
              strokeWidth="1.1"
              strokeDasharray="5 5"
            />
          )}
          <path
            d={drawing.cut}
            fill="none"
            stroke="#72dfb0"
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
          {drawing.tool && (
            <g>
              <circle
                cx={drawing.tool[0]}
                cy={drawing.tool[1]}
                r="11"
                fill="#77e3b022"
              />
              <circle
                cx={drawing.tool[0]}
                cy={drawing.tool[1]}
                r="4"
                fill="#a1f3ce"
                stroke="#14271f"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        <AxisIndicator view={view} />
        <div className="viewport-legend">
          <span>
            <i className="legend-line" />
            Lavorazione
          </span>
          <label>
            <input
              type="checkbox"
              checked={rapids}
              onChange={(e) => setRapids(e.target.checked)}
            />
            Rapidi
          </label>
        </div>
      </div>
      <div className="playback">
        <button
          className="play-button"
          disabled={!result.segments.length}
          aria-label={playing ? "Pausa simulazione" : "Avvia simulazione"}
          onClick={() => {
            setTrackedResult(result);
            if (progress >= 100) setProgress(0);
            setPlaying(!playing);
          }}
        >
          {playing ? (
            <Pause size={15} />
          ) : (
            <Play size={15} fill="currentColor" />
          )}
        </button>
        <button
          className="icon-button"
          title="Riavvolgi"
          aria-label="Riavvolgi simulazione"
          onClick={() => {
            setTrackedResult(result);
            setProgress(0);
            setPlaying(false);
          }}
        >
          <RotateCcw size={15} />
        </button>
        <input
          aria-label="Avanzamento simulazione"
          type="range"
          min="0"
          max="100"
          step=".1"
          value={progress}
          onChange={(e) => {
            setTrackedResult(result);
            setPlaying(false);
            setProgress(+e.target.value);
          }}
        />
        <select
          aria-label="Velocità simulazione"
          value={speed}
          onChange={(e) => setSpeed(+e.target.value)}
        >
          <option value=".5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </div>
      <div className="coordinates">
        {(["x", "y", "z"] as const).map((a) => (
          <div key={a}>
            <span>{a.toUpperCase()}</span>
            <strong>{(currentPoint?.[a] ?? 0).toFixed(3)}</strong>
          </div>
        ))}
        <div>
          <span>PERCORSO</span>
          <strong>
            {result.distance.toFixed(1)} <small>mm</small>
          </strong>
        </div>
      </div>
      <div className={`sim-note ${!result.complete ? "warning" : ""}`}>
        {result.issues.length ? (
          <>
            <strong>Anteprima parziale · riga {result.issues[0].line}</strong>
            <span>{result.issues[0].message}</span>
          </>
        ) : (
          <>
            <span className="status-dot" />
            <span>
              Anteprima geometrica · {result.segments.length} segmenti
            </span>
          </>
        )}
      </div>
      <p className="scope-note">
        {machine === "lathe"
          ? "Profilo utensile XZ; nessuna asportazione del materiale. "
          : "Percorso utensile; nessuna verifica collisioni. "}
        Cicli, macro e compensazioni non simulati. I rapidi reali possono
        differire.
      </p>
    </section>
  );
}
