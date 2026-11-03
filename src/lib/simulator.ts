import type { Machine } from "./codes";
export type Point = { x: number; y: number; z: number };
export type Segment = { from: Point; to: Point; rapid: boolean; line: number };
export type Simulation = {
  segments: Segment[];
  issues: { line: number; message: string }[];
  complete: boolean;
  distance: number;
};
const axes = ["X", "Y", "Z"] as const;
const planeAxes = {
  17: ["x", "y", "z", "I", "J"],
  18: ["z", "x", "y", "K", "I"],
  19: ["y", "z", "x", "J", "K"],
} as const;
export function simulate(
  source: string,
  machine: Machine,
  diameter = true,
): Simulation {
  const segments: Segment[] = [];
  const issues: Simulation["issues"] = [];
  let pos: Point = { x: 0, y: 0, z: 0 },
    absolute = true,
    unit = 1,
    motion = 0,
    plane: 17 | 18 | 19 = machine === "lathe" ? 18 : 17,
    distance = 0;
  let origin = 54;
  let ended = false;
  function fail(line: number, message: string) {
    issues.push({ line, message });
  }
  function add(to: Point, rapid: boolean, line: number) {
    const from = { ...pos };
    distance += Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    segments.push({ from, to: { ...to }, rapid, line });
    pos = { ...to };
  }
  const lines = source.split(/\r?\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = n + 1;
    let text = lines[n]
      .replace(/\([^)]*\)/g, "")
      .replace(/;.*$/, "")
      .trim()
      .toUpperCase();
    if (!text || /^%$/.test(text)) continue;
    if (ended) break;
    if (/[#[\]]/.test(text) || /\b(?:IF|WHILE|GOTO)\b/.test(text)) {
      fail(line, "Macro o espressioni non simulate. Anteprima interrotta.");
      break;
    }
    if (/^\//.test(text)) {
      fail(
        line,
        "Blocco opzionale: esito dipendente dalla macchina. Anteprima interrotta.",
      );
      break;
    }
    const words = [
      ...text.matchAll(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g),
    ];
    const residue = text
      .replace(/([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g, "")
      .replace(/[%\s]/g, "");
    if (residue || !words.length) {
      fail(line, "Sintassi non supportata. Anteprima interrotta.");
      break;
    }
    const vals: Record<string, number> = {};
    const gs: number[] = [];
    const ms: number[] = [];
    for (const w of words) {
      const v = Number(w[2]);
      if (w[1] === "G") gs.push(v);
      else if (w[1] === "M") ms.push(v);
      else vals[w[1]] = v;
    }
    const allowedG = [
      0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 40, 49, 54, 55, 56, 57, 58, 59, 80, 90,
      91, 94, 95, 96, 97, 98, 99,
    ];
    const bad = gs.find(
      (g) =>
        !allowedG.includes(g) || (machine === "lathe" && [90, 91].includes(g)),
    );
    if (bad !== undefined) {
      fail(
        line,
        `G${bad} non simulato${machine === "lathe" && bad === 90 ? " (ciclo di tornitura)" : ""}. Anteprima interrotta.`,
      );
      break;
    }
    const unknownM = ms.find(
      (m) => ![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 19, 30].includes(m),
    );
    if (unknownM !== undefined) {
      fail(line, `M${unknownM} non simulato. Anteprima interrotta.`);
      break;
    }
    const unknownWord = Object.keys(vals).find(
      (k) =>
        ![
          "N",
          "O",
          "X",
          "Y",
          "Z",
          "I",
          "J",
          "K",
          "R",
          "F",
          "S",
          "T",
          "P",
          ...(machine === "lathe" ? ["U", "W"] : []),
        ].includes(k),
    );
    if (unknownWord) {
      fail(
        line,
        `Indirizzo ${unknownWord} non simulato. Anteprima interrotta.`,
      );
      break;
    }
    for (const g of gs) {
      if (g === 90) absolute = true;
      if (g === 91) absolute = false;
      if (g === 20) unit = 25.4;
      if (g === 21) unit = 1;
      if ([17, 18, 19].includes(g)) plane = g as 17 | 18 | 19;
      if (g <= 3) motion = g;
      if (g === 80) motion = -1;
    }
    const nextOrigin = gs.find((g) => g >= 54 && g <= 59);
    if (nextOrigin !== undefined) {
      if (origin !== undefined && origin !== nextOrigin && segments.length) {
        fail(
          line,
          "Cambio origine pezzo: offset sconosciuti. Anteprima interrotta.",
        );
        break;
      }
      origin = nextOrigin;
    }
    if (gs.includes(4)) continue;
    const hasAxis = axes.some((a) => a in vals) || "U" in vals || "W" in vals;
    const hasArc =
      [2, 3].includes(motion) && ["I", "J", "K", "R"].some((k) => k in vals);
    if (hasAxis && motion === -1) {
      fail(line, "Manca un comando di movimento dopo G80.");
      break;
    }
    if (
      machine === "lathe" &&
      (("X" in vals && "U" in vals) || ("Z" in vals && "W" in vals))
    ) {
      fail(
        line,
        "Quote assolute e incrementali dello stesso asse nel medesimo blocco.",
      );
      break;
    }
    if (!hasAxis && !hasArc) {
      if (ms.some((m) => m === 2 || m === 30)) ended = true;
      continue;
    }
    const target = { ...pos };
    for (const a of axes) {
      if (a in vals) {
        const k = a.toLowerCase() as keyof Point;
        const scale = a === "X" && machine === "lathe" && diameter ? 0.5 : 1;
        target[k] = (absolute ? 0 : pos[k]) + vals[a] * unit * scale;
      }
    }
    if (machine === "lathe") {
      if ("U" in vals) target.x = pos.x + vals.U * unit * (diameter ? 0.5 : 1);
      if ("W" in vals) target.z = pos.z + vals.W * unit;
    }
    if (
      !Object.values(target).every(
        (v) => Number.isFinite(v) && Math.abs(v) <= 1000000,
      )
    ) {
      fail(line, "Coordinata non valida.");
      break;
    }
    if (motion < 2) add(target, motion === 0, line);
    else {
      const [a, b, c, ia, ib] = planeAxes[plane];
      const sx = pos[a],
        sy = pos[b],
        ex = target[a],
        ey = target[b];
      let cx: number, cy: number;
      if ("R" in vals) {
        const radius = Math.abs(vals.R * unit),
          dx = ex - sx,
          dy = ey - sy,
          chord = Math.hypot(dx, dy);
        if (!chord || chord > 2 * radius + 1e-6) {
          fail(
            line,
            "Arco R impossibile: raggio insufficiente o cerchio completo senza centro.",
          );
          break;
        }
        const h = Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4));
        const side = (motion === 3 ? 1 : -1) * (vals.R < 0 ? -1 : 1);
        cx = (sx + ex) / 2 - ((side * dy) / chord) * h;
        cy = (sy + ey) / 2 + ((side * dx) / chord) * h;
      } else {
        if (!(ia in vals) && !(ib in vals)) {
          fail(line, `Arco privo di centro ${ia}/${ib} o raggio R.`);
          break;
        }
        cx = sx + (vals[ia] ?? 0) * unit;
        cy = sy + (vals[ib] ?? 0) * unit;
      }
      const radius = Math.hypot(sx - cx, sy - cy),
        endRadius = Math.hypot(ex - cx, ey - cy);
      if (
        radius < 1e-8 ||
        Math.abs(radius - endRadius) > Math.max(0.01, radius * 0.001)
      ) {
        fail(line, "Centro e punto finale dell’arco non coerenti.");
        break;
      }
      const start = Math.atan2(sy - cy, sx - cx);
      let sweep = Math.atan2(ey - cy, ex - cx) - start;
      if (motion === 3 && sweep <= 1e-10) sweep += Math.PI * 2;
      if (motion === 2 && sweep >= -1e-10) sweep -= Math.PI * 2;
      const count = Math.min(
        2048,
        Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(radius, 1)) / 0.5)),
      );
      const base = { ...pos };
      for (let j = 1; j <= count; j++) {
        const t = j / count;
        const p = { ...base };
        p[a] = cx + radius * Math.cos(start + sweep * t);
        p[b] = cy + radius * Math.sin(start + sweep * t);
        p[c] = base[c] + (target[c] - base[c]) * t;
        add(j === count ? target : p, false, line);
      }
    }
    if (ms.some((m) => m === 2 || m === 30)) ended = true;
    if (segments.length > 100000) {
      fail(line, "Limite di 100.000 segmenti raggiunto. Riduci il programma.");
      break;
    }
  }
  return { segments, issues, complete: issues.length === 0, distance };
}
