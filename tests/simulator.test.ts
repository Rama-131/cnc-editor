import { describe, it, expect } from "vitest";
import { simulate } from "../src/lib/simulator";
import { codeInfo } from "../src/lib/codes";
import { millSample, latheSample } from "../src/lib/samples";
describe("simulazione CNC", () => {
  it("esegue entrambi gli esempi completi", () => {
    for (const [text, machine] of [
      [millSample, "mill"],
      [latheSample, "lathe"],
    ] as const) {
      const result = simulate(text, machine);
      expect(result.issues).toEqual([]);
      expect(result.segments.length).toBeGreaterThan(10);
      expect(result.distance).toBeGreaterThan(0);
    }
  });
  it("gestisce modalità assoluta, incrementale, pollici e moto modale", () => {
    const r = simulate("G21 G90\nG1 X10 Y5\nG91\nX2\nG20\nY1", "mill");
    expect(r.complete).toBe(true);
    expect(r.segments.at(-1)?.to).toEqual({ x: 12, y: 30.4, z: 0 });
  });
  it("interpreta X a diametro e incrementi U/W sul tornio", () => {
    const r = simulate("G0 X40 Z10\nG1 U-10 W-5", "lathe", true);
    expect(r.segments.at(-1)?.to).toEqual({ x: 15, y: 0, z: 5 });
    expect(simulate("G1 X40", "lathe", false).segments.at(-1)?.to.x).toBe(40);
  });
  it("ferma la simulazione davanti a cicli, macro e sottoprogrammi", () => {
    for (const text of [
      "G1 X1\nG71 P10 Q20\nX99",
      "G1 X1\n#1=3\nX99",
      "G1 X1\nM98 P2\nX99",
      "G1 X1\nG41\nX99",
    ]) {
      const r = simulate(text, "mill");
      expect(r.complete).toBe(false);
      expect(r.issues[0].line).toBe(2);
      expect(r.segments.at(-1)?.to.x).toBe(1);
    }
  });
  it("non confonde G90 sul tornio con la modalità assoluta", () => {
    expect(simulate("G90 X10 Z-5", "lathe").complete).toBe(false);
    expect(codeInfo("G090", "lathe").title).toContain("Ciclo");
    expect(codeInfo("G090", "mill").title).toContain("assolute");
  });
  it("calcola cerchi interi e archi elicoidali", () => {
    const r = simulate("G0 X10\nG3 X10 Y0 I-10 J0 Z5", "mill");
    expect(r.complete).toBe(true);
    expect(r.segments.at(-1)?.to).toEqual({ x: 10, y: 0, z: 5 });
    expect(r.segments.some((s) => s.to.x < -9.9)).toBe(true);
    expect(r.distance).toBeCloseTo(10 + Math.hypot(20 * Math.PI, 5), 1);
  });
  it("rispetta il verso degli archi nei tre piani", () => {
    const xy = simulate("G17 G0 X10 Y0\nG3 X0 Y10 I-10 J0", "mill");
    expect(xy.complete).toBe(true);
    expect(xy.distance).toBeCloseTo(10 + 5 * Math.PI, 1);
    const zx = simulate("G18 G0 Z10 X0\nG3 Z0 X10 K-10 I0", "mill");
    expect(zx.complete).toBe(true);
    expect(zx.distance).toBeCloseTo(xy.distance, 5);
    const yz = simulate("G19 G0 Y10 Z0\nG3 Y0 Z10 J-10 K0", "mill");
    expect(yz.distance).toBeCloseTo(xy.distance, 5);
  });
  it("distingue archi R minori e maggiori", () => {
    const short = simulate("G0 X10\nG3 X0 Y10 R10", "mill");
    const long = simulate("G0 X10\nG3 X0 Y10 R-10", "mill");
    expect(short.complete).toBe(true);
    expect(long.complete).toBe(true);
    expect(short.distance).toBeCloseTo(10 + 5 * Math.PI, 1);
    expect(long.distance).toBeCloseTo(10 + 15 * Math.PI, 1);
  });
  it("segnala gli archi impossibili", () => {
    expect(simulate("G2 X100 R1", "mill").complete).toBe(false);
    expect(simulate("G2 X10 I1", "mill").complete).toBe(false);
  });
  it("esclude commenti e termina a M30", () => {
    const r = simulate("(G71)\nG1 X1 ; G41\nM30\nG1 X99", "mill");
    expect(r.complete).toBe(true);
    expect(r.segments).toHaveLength(1);
  });
  it("rifiuta movimenti senza modalità dopo G80", () => {
    expect(simulate("G1 X1\nG80\nX3", "mill").complete).toBe(false);
  });
  it("registra i cambi origine anche senza movimento, compreso l’ultimo blocco", () => {
    const r = simulate("G54\nG1 X10\nG55\nG1 X20\nG56\nM30", "mill");
    expect(r.complete).toBe(true);
    expect(
      r.steps
        .filter((step) => step.kind === "origin")
        .map((step) => [step.line, step.origin, step.segmentCount]),
    ).toEqual([
      [1, "G54", 0],
      [3, "G55", 1],
      [5, "G56", 2],
    ]);
    expect(r.steps.at(-1)?.origin).toBe("G56");
    expect(r.steps.at(-1)?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(r.segments.map((segment) => segment.origin)).toEqual(["G54", "G55"]);
    expect(r.segments[1].from).toEqual({ x: 0, y: 0, z: 0 });
  });
  it("mantiene la posizione ripetendo la stessa origine", () => {
    const r = simulate("G54\nG1 X10\nG54\nG91 X2", "mill");
    expect(r.complete).toBe(true);
    expect(r.steps[2].position.x).toBe(10);
    expect(r.segments.at(-1)?.to.x).toBe(12);
  });
  it("riconosce G54–G59 e mantiene l’origine su tutti i punti di un arco", () => {
    const origins = simulate(
      [54, 55, 56, 57, 58, 59]
        .map((n) => `G${n}\nG0 X10\nG3 X10 Y0 I-10 J0`)
        .join("\n"),
      "mill",
    );
    expect(origins.complete).toBe(true);
    expect([
      ...new Set(origins.segments.map((segment) => segment.origin)),
    ]).toEqual(["G54", "G55", "G56", "G57", "G58", "G59"]);
    for (const step of origins.steps.filter((step) => step.kind === "motion"))
      expect(step.origin).toBe(origins.segments[step.segmentCount - 1].origin);
  });
  it("non inventa un’origine quando il programma non la specifica", () => {
    const r = simulate("G1 X10\nG55\nX20", "mill");
    expect(r.segments[0].origin).toBeNull();
    expect(r.segments[1].origin).toBe("G55");
    expect(r.segments[1].from.x).toBe(0);
  });
  it("esclude origini nei commenti, dopo M30 e dopo un blocco non supportato", () => {
    const done = simulate("(G59)\nG054\nG1 X10 ; G58\nM30\nG55", "mill");
    expect(done.complete).toBe(true);
    expect(
      done.steps
        .filter((step) => step.kind === "origin")
        .map((step) => step.origin),
    ).toEqual(["G54"]);
    const partial = simulate("G54\nG1 X10\nG71\nG55", "mill");
    expect(partial.complete).toBe(false);
    expect(partial.steps.at(-1)?.origin).toBe("G54");
    expect(simulate("G54 G55 X10", "mill").complete).toBe(false);
  });
  it("mantiene unità, piano e programmazione a diametro cambiando origine sul tornio", () => {
    const r = simulate(
      "G21 G18\nG54\nG0 X40 Z5\nG1 X30 Z-10\nG55\nG0 X60 Z10\nG1 U-10 W-5",
      "lathe",
    );
    expect(r.complete).toBe(true);
    expect(r.segments.at(-1)?.to).toEqual({ x: 25, y: 0, z: 5 });
    expect(r.segments.at(-1)?.origin).toBe("G55");
    expect(r.segments[2].from).toEqual({ x: 0, y: 0, z: 0 });
  });
});
