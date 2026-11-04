import { describe, expect, it } from "vitest";
import { simulate } from "../src/lib/simulator";
import { codeInfo } from "../src/lib/codes";

describe("comandi ausiliari della configurazione tornio", () => {
  it("registra M26 come contropunta avanti senza cambiare posizione, percorso o moto modale", () => {
    const result = simulate("G10P0Z-266.2\nG1X40Z-5\nM26\nW-2", "lathe");
    expect(result.complete).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.steps[2]).toMatchObject({
      kind: "auxiliary",
      action: "Contropunta avanti · movimento non rappresentato",
      line: 3,
      position: { x: 20, y: 0, z: -5 },
      segmentCount: 1,
      workShift: { z: -266.2 },
    });
    expect(result.segments[1]).toMatchObject({
      from: { x: 20, y: 0, z: -5 },
      to: { x: 20, y: 0, z: -7 },
      rapid: false,
    });
    expect(result.distance).toBeCloseTo(Math.hypot(20, 5) + 2);
    expect(simulate("M26", "mill").complete).toBe(false);
    expect(codeInfo("M26", "lathe").title).toBe("Contropunta avanti");
  });

  it("mantiene il limite G92 S durante movimenti, cambi origine e comandi ausiliari", () => {
    const result = simulate(
      "G1X10\nG92S1200\nZ-5\nM26\nG54\nG10P0Z-100\nG97S2000M3\nG1X20\nG92S900\nZ-10",
      "lathe",
    );
    expect(result.complete).toBe(true);
    expect(result.segments).toHaveLength(4);
    expect(result.steps[0].spindleLimit).toBeNull();
    const firstLimit = result.steps[1];
    expect(firstLimit).toMatchObject({
      kind: "auxiliary",
      action: "Limite mandrino · 1200 giri/min",
      spindleLimit: 1200,
      position: { x: 5, y: 0, z: 0 },
      segmentCount: 1,
    });
    expect(
      result.steps.slice(1, -2).every((step) => step.spindleLimit === 1200),
    ).toBe(true);
    expect(result.steps.at(-1)?.spindleLimit).toBe(900);
    expect(result.segments[1].rapid).toBe(false);
    expect(simulate("G92S1200", "lathe").segments).toEqual([]);
  });

  it("non confonde il limite giri con G92 di filettatura o impostazione coordinate", () => {
    for (const block of [
      "G92X20Z-10F2",
      "G92S1200X0",
      "G92",
      "G92S0",
      "G92S-10",
      "G92S1000001",
      "G92S1200S900",
      "G92S1200M3",
      "G0G92S1200",
    ]) {
      const result = simulate(`G1X10\n${block}\nG1X99`, "lathe");
      expect(result.complete, block).toBe(false);
      expect(result.issues[0].line, block).toBe(2);
      expect(result.segments, block).toHaveLength(1);
      expect(result.steps.at(-1)?.spindleLimit, block).toBeNull();
    }
    expect(simulate("G92S1200", "mill").complete).toBe(false);
    expect(simulate("M30\nG92S1200\nM26", "lathe").steps).toEqual([]);
  });

  it("interpreta insieme i blocchi visibili nella schermata dell’utente", () => {
    const source =
      "%\nO0030\nN10 G10 P0 Z-266.2\nN20 T1212 G97 S600 M4\nN30 G0 X75 Z0.1 M8\nN40 G1 X-2 F0.18\nN50 G0 X250 Z2 M9\nN52 T1111 G97 S600 M4\nN54 G0 X70 Z0 M8\nN56 G1 X-2 F0.16\nN58 G0 X250 Z2 G97 S350 M9\nN60 T707 G97 S600 M3\nN70 G0 Z1\nN80 X0 M8\nN90 G1 Z-8 F0.04\nN100 G0 Z1 M9\nN110 X250 M5\nN120 M26\nN130 G4 U3\nN132 G92 S1200\nM30\n%";
    const result = simulate(source, "lathe");
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(true);
    expect(result.steps.find((step) => step.line === 18)?.action).toContain(
      "Contropunta avanti",
    );
    expect(result.steps.at(-1)).toMatchObject({ line: 20, spindleLimit: 1200 });
    expect(result.segments.every((s) => s.workShift?.z === -266.2)).toBe(true);
  });
});
