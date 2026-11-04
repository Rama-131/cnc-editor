import type { Point } from "./simulator";

export class RoughingError extends Error {
  constructor(
    public line: number,
    message: string,
  ) {
    super(`G71 non simulato: ${message}`);
  }
}
type Vertex = { point: Point; line: number; radius: number; rapid: boolean };
export type RoughingMove = {
  to: Point;
  rapid: boolean;
  line: number;
  action: string;
};
export type RoughingHeader = { depth: number; retract: number; line: number };
const epsilon = 1e-7;
const clean = (text: string) =>
  text
    .replace(/\([^)]*\)/g, "")
    .replace(/;.*$/, "")
    .trim()
    .toUpperCase();
const word = /([A-Z])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/g;

function profileVertices(
  lines: string[],
  from: number,
  to: number,
  start: Point,
  unit: number,
  diameter: boolean,
) {
  const vertices: Vertex[] = [];
  let position = { ...start };
  for (let i = from; i <= to; i++) {
    const text = clean(lines[i]);
    if (!text) continue;
    const words = [...text.matchAll(word)];
    const values: Record<string, number> = {};
    if (
      text.replace(word, "").replace(/\s/g, "") ||
      !words.length ||
      new Set(words.map((w) => w[1])).size !== words.length
    )
      throw new RoughingError(i + 1, "sintassi del profilo non supportata.");
    for (const match of words) values[match[1]] = Number(match[2]);
    if (
      Object.keys(values).some(
        (k) => !["N", "G", "X", "Z", "A", "R", "F"].includes(k),
      ) ||
      Object.values(values).some((v) => !Number.isFinite(v))
    )
      throw new RoughingError(
        i + 1,
        "il profilo deve contenere G0/G1, X/Z, A o raccordi R; altre funzioni non sono supportate.",
      );
    if (!vertices.length) {
      if (
        ![0, 1].includes(values.G) ||
        !("X" in values) ||
        ["Z", "A", "R"].some((k) => k in values)
      )
        throw new RoughingError(
          i + 1,
          "il tipo I deve iniziare con G0/G1 e la sola quota X.",
        );
    } else if ("G" in values && values.G !== 1) {
      throw new RoughingError(
        i + 1,
        "sono supportati profili lineari tipo I; G2/G3 e tasche richiedono un altro interprete.",
      );
    }
    if (vertices.length && !["X", "Z", "A", "R"].some((k) => k in values))
      continue;
    const next: Point = { ...position };
    if ("X" in values) next.x = values.X * unit * (diameter ? 0.5 : 1);
    if ("Z" in values) next.z = values.Z * unit;
    if ("A" in values) {
      if ("X" in values === "Z" in values)
        throw new RoughingError(
          i + 1,
          "A richiede una sola quota X oppure Z per calcolare l’altra.",
        );
      const angle = ((values.A % 360) * Math.PI) / 180;
      const direction = "X" in values ? Math.sin(angle) : Math.cos(angle);
      const delta = "X" in values ? next.x - position.x : next.z - position.z;
      const length = delta / direction;
      if (
        Math.abs(direction) < epsilon ||
        !Number.isFinite(length) ||
        length <= epsilon
      )
        throw new RoughingError(
          i + 1,
          "angolo A incompatibile con la quota e il verso del profilo.",
        );
      if ("X" in values) next.z = position.z + length * Math.cos(angle);
      else next.x = position.x + length * Math.sin(angle);
    }
    if (
      Object.values(next).some(
        (v) => !Number.isFinite(v) || Math.abs(v) > 1000000,
      ) ||
      next.x < 0
    )
      throw new RoughingError(i + 1, "quota del profilo non valida.");
    if (
      vertices.length &&
      (next.x < position.x - epsilon || next.z > position.z + epsilon)
    )
      throw new RoughingError(
        i + 1,
        "supportata la sgrossatura esterna tipo I con X crescente e Z decrescente; tasche e inversioni non simulate.",
      );
    const radius = (values.R ?? 0) * unit;
    if (radius < 0 || radius > 1000000)
      throw new RoughingError(i + 1, "raccordo R non valido.");
    if (
      !vertices.length ||
      Math.hypot(next.x - position.x, next.z - position.z) > epsilon ||
      radius
    )
      vertices.push({
        point: next,
        line: i + 1,
        radius,
        rapid: values.G === 0,
      });
    position = next;
  }
  if (vertices.length < 2)
    throw new RoughingError(from + 1, "profilo incompleto.");
  return vertices;
}

function roundedProfile(vertices: Vertex[]) {
  const trims = vertices.map((vertex, i) => {
    if (!vertex.radius) return 0;
    if (!i || i === vertices.length - 1)
      throw new RoughingError(
        vertex.line,
        "R richiede un tratto prima e uno dopo lo spigolo.",
      );
    const a = vertices[i - 1].point,
      b = vertex.point,
      c = vertices[i + 1].point;
    const before = Math.hypot(b.x - a.x, b.z - a.z),
      after = Math.hypot(c.x - b.x, c.z - b.z);
    if (before < epsilon || after < epsilon)
      throw new RoughingError(vertex.line, "raccordo R su un tratto nullo.");
    const dot =
      ((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) /
      (before * after);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle < epsilon || Math.PI - angle < epsilon)
      throw new RoughingError(vertex.line, "raccordo R su tratti collineari.");
    return vertex.radius * Math.tan(angle / 2);
  });
  for (let i = 1; i < vertices.length; i++) {
    const a = vertices[i - 1],
      b = vertices[i];
    if (
      trims[i - 1] + trims[i] >
      Math.hypot(b.point.x - a.point.x, b.point.z - a.point.z) + epsilon
    )
      throw new RoughingError(
        b.line,
        "raccordi R troppo grandi per i tratti disponibili.",
      );
  }
  const points: { point: Point; line: number }[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const vertex = vertices[i];
    if (!vertex.radius) {
      points.push(vertex);
      continue;
    }
    const a = vertices[i - 1].point,
      b = vertex.point,
      c = vertices[i + 1].point;
    const lengthA = Math.hypot(b.x - a.x, b.z - a.z),
      lengthB = Math.hypot(c.x - b.x, c.z - b.z);
    const incoming = { x: (b.x - a.x) / lengthA, z: (b.z - a.z) / lengthA };
    const outgoing = { x: (c.x - b.x) / lengthB, z: (c.z - b.z) / lengthB };
    const begin = {
      x: b.x - incoming.x * trims[i],
      y: b.y,
      z: b.z - incoming.z * trims[i],
    };
    const end = {
      x: b.x + outgoing.x * trims[i],
      y: b.y,
      z: b.z + outgoing.z * trims[i],
    };
    const sign = Math.sign(incoming.x * outgoing.z - incoming.z * outgoing.x);
    const center = {
      x: begin.x - incoming.z * vertex.radius * sign,
      z: begin.z + incoming.x * vertex.radius * sign,
    };
    const startAngle = Math.atan2(begin.z - center.z, begin.x - center.x);
    let sweep = Math.atan2(end.z - center.z, end.x - center.x) - startAngle;
    if (sign > 0 && sweep <= 0) sweep += 2 * Math.PI;
    if (sign < 0 && sweep >= 0) sweep -= 2 * Math.PI;
    const count = Math.min(
      512,
      Math.max(8, Math.ceil((Math.abs(sweep) * vertex.radius) / 0.25)),
    );
    if (points.length + count + 1 > 100000)
      throw new RoughingError(
        vertex.line,
        "profilo raccordato oltre 100.000 segmenti.",
      );
    points.push({ point: begin, line: vertex.line });
    for (let j = 1; j <= count; j++) {
      const angle = startAngle + (sweep * j) / count;
      points.push({
        point:
          j === count
            ? end
            : {
                x: center.x + vertex.radius * Math.cos(angle),
                y: b.y,
                z: center.z + vertex.radius * Math.sin(angle),
              },
        line: vertex.line,
      });
    }
  }
  return points;
}

export function planG71(options: {
  lines: string[];
  callIndex: number;
  start: Point;
  unit: number;
  diameter: boolean;
  p: number;
  q: number;
  allowanceX: number;
  allowanceZ: number;
  header: RoughingHeader;
}) {
  const {
    lines,
    callIndex,
    start,
    unit,
    diameter,
    p,
    q,
    allowanceX,
    allowanceZ,
    header,
  } = options;
  const fail = (message: string): never => {
    throw new RoughingError(callIndex + 1, message);
  };
  if (
    ![p, q].every((v) => Number.isInteger(v) && v > 0) ||
    allowanceX < 0 ||
    allowanceZ < 0
  )
    fail(
      "P/Q devono essere numeri di blocco positivi e U/W sovrametalli non negativi per la lavorazione esterna.",
    );
  const labels = lines.map((line, index) => ({
    label: Number(clean(line).match(/^N\s*(\d+)(?![\d.])/)?.[1]),
    index,
  }));
  const starts = labels.filter((v) => v.label === p),
    ends = labels.filter((v) => v.label === q);
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0].index <= callIndex ||
    ends[0].index <= starts[0].index
  )
    fail(`profilo N${p}–N${q} mancante, ambiguo o fuori ordine.`);
  const endIndex = ends[0].index;
  if (endIndex - starts[0].index > 10000) fail("profilo oltre 10.000 blocchi.");
  const vertices = profileVertices(
    lines,
    starts[0].index,
    endIndex,
    start,
    unit,
    diameter,
  );
  const profile = roundedProfile(vertices).map((v) => ({
    point: { ...v.point, x: v.point.x + allowanceX, z: v.point.z + allowanceZ },
    line: v.line,
  }));
  if (
    Object.values(start).some(
      (v) => !Number.isFinite(v) || Math.abs(v) > 1000000,
    ) ||
    start.x <= profile[0].point.x + epsilon ||
    vertices.at(-1)!.point.x > start.x + epsilon
  )
    fail(
      "il punto iniziale X deve essere esterno al profilo e al sovrametallo; verifica il posizionamento prima del ciclo.",
    );
  const minimum = profile[0].point.x;
  const passes = Math.ceil((start.x - minimum) / header.depth - epsilon);
  if (!Number.isFinite(passes) || passes < 1 || passes > 1000)
    fail(
      "numero di passate oltre il limite di 1000; verifica la profondità U.",
    );
  const moves: RoughingMove[] = [];
  let position = { ...start };
  const emit = (to: Point, rapid: boolean, line: number, action: string) => {
    if (
      Object.values(to).some(
        (v) => !Number.isFinite(v) || Math.abs(v) > 1000000,
      )
    )
      fail("coordinate generate fuori limite.");
    if (
      Math.hypot(to.x - position.x, to.y - position.y, to.z - position.z) >
      epsilon
    ) {
      if (moves.length >= 100000) fail("limite di 100.000 segmenti raggiunto.");
      moves.push({ to, rapid, line, action });
    }
    position = to;
  };
  for (let pass = 1; pass <= passes; pass++) {
    const radius = Math.max(minimum, start.x - pass * header.depth);
    let stopZ: number | undefined;
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1].point,
        b = profile[i].point;
      if (b.x > radius + epsilon) {
        stopZ = a.z + ((b.z - a.z) * (radius - a.x)) / (b.x - a.x);
        break;
      }
    }
    stopZ ??= profile.at(-1)!.point.z;
    if (stopZ > start.z + epsilon)
      fail("intersezione della passata con il profilo non valida.");
    const action = `G71 · passata ${pass}/${passes}`;
    emit({ ...start, x: radius }, vertices[0].rapid, callIndex + 1, action);
    emit({ ...start, x: radius, z: stopZ }, false, callIndex + 1, action);
    emit(
      { ...start, x: radius + header.retract, z: stopZ + header.retract },
      true,
      callIndex + 1,
      action,
    );
    emit({ ...start, x: radius + header.retract }, true, callIndex + 1, action);
  }
  // Final contour pass leaves the programmed X/Z allowances in place.
  const contourAction = "G71 · profilo con sovrametallo";
  profile.forEach((v, i) =>
    emit(v.point, i === 0 && vertices[0].rapid, v.line, contourAction),
  );
  const clearance = Math.max(start.x, position.x) + header.retract;
  emit(
    { ...position, x: clearance },
    true,
    callIndex + 1,
    "G71 · ritorno al punto iniziale",
  );
  emit(
    { ...start, x: clearance },
    true,
    callIndex + 1,
    "G71 · ritorno al punto iniziale",
  );
  emit({ ...start }, true, callIndex + 1, "G71 · ritorno al punto iniziale");
  return { moves, endIndex, passes };
}
