import { describe, expect, it } from "vitest";
import { simulate } from "../src/lib/simulator";
import { codeInfo } from "../src/lib/codes";

describe("spostamento origine Fanuc G10 P0", () => {
  it("legge il blocco della schermata senza trasformare Z-266.2 in un movimento", () => {
    const result = simulate(
      "%\nO0030\nN10G10P0Z-266.2\nN20T1212G97S600M4\nN30G0X75Z0.1M8\nN40G1X-2F0.18\nM30\n%",
      "lathe",
    );
    expect(result.complete).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.segments).toHaveLength(2);
    expect(result.steps[0]).toMatchObject({
      kind: "origin",
      line: 3,
      origin: null,
      workShift: { x: 0, y: 0, z: -266.2 },
      position: { x: 0, y: 0, z: 0 },
      segmentCount: 0,
    });
    expect(result.segments[0]).toMatchObject({
      from: { x: 0, y: 0, z: 0 },
      to: { x: 37.5, y: 0, z: 0.1 },
      rapid: true,
      line: 5,
    });
    expect(result.segments[1]).toMatchObject({
      to: { x: -1, y: 0, z: 0.1 },
      rapid: false,
      line: 6,
    });
  });

  it("ricalcola le quote durante G10 lasciando ferma la posizione fisica e conservando G1", () => {
    const result = simulate("G1X40Z5\nG10P0X10Z-100\nW-5", "lathe");
    expect(result.complete).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.steps[1]).toMatchObject({
      kind: "origin",
      position: { x: 15, y: 0, z: 105 },
      segmentCount: 1,
    });
    const oldPosition = result.segments[0].to;
    const shift = result.steps[1].workShift!;
    expect(result.steps[1].position.x + shift.x).toBe(oldPosition.x);
    expect(result.steps[1].position.z + shift.z).toBe(oldPosition.z);
    expect(result.segments[1]).toMatchObject({
      from: { x: 15, y: 0, z: 105 },
      to: { x: 15, y: 0, z: 100 },
      rapid: false,
    });
    expect(result.distance).toBeCloseTo(Math.hypot(20, 5) + 5);
  });

  it("sostituisce lo shift assoluto, mantiene gli assi omessi e non azzera ripetendo G10", () => {
    const result = simulate(
      "G10P0X20Z-100\nG1X40Z-5\nG10P0Z-200\nG10P0Z-200\nZ0",
      "lathe",
    );
    expect(result.complete).toBe(true);
    expect(result.steps[2]).toMatchObject({
      workShift: { x: 10, y: 0, z: -200 },
      position: { x: 20, y: 0, z: 95 },
    });
    expect(result.steps[3].position).toEqual(result.steps[2].position);
    expect(result.segments[0].workShift).toEqual({ x: 10, y: 0, z: -100 });
    expect(result.segments[1].from).toEqual({ x: 20, y: 0, z: 95 });
    expect(result.segments[1].to).toEqual({ x: 20, y: 0, z: 0 });
  });

  it("rispetta U/W incrementali, pollici e X a diametro o raggio", () => {
    for (const diameter of [true, false]) {
      const scale = diameter ? 0.5 : 1;
      const result = simulate(
        "G20\nG10P0X2Z-10\nG1X4Z1\nG10P0U1W-2\nW1",
        "lathe",
        diameter,
      );
      expect(result.complete).toBe(true);
      const shift = result.steps.at(-1)!.workShift!;
      expect(shift.x).toBeCloseTo(3 * 25.4 * scale);
      expect(shift.z).toBeCloseTo(-12 * 25.4);
      expect(result.segments[1].from.x).toBeCloseTo(3 * 25.4 * scale);
      expect(result.segments[1].from.z).toBeCloseTo(3 * 25.4);
      expect(result.segments[1].to.z).toBeCloseTo(4 * 25.4);
    }
  });

  it("mantiene lo shift esterno passando tra G54 e G55 senza inventare un G54", () => {
    const result = simulate("G10P0Z-100\nG54\nG1Z-10\nG55\nG1Z-20", "lathe");
    expect(result.complete).toBe(true);
    expect(result.steps.map((s) => s.origin)).toEqual([
      null,
      "G54",
      "G54",
      "G55",
      "G55",
    ]);
    expect(result.steps.every((s) => s.workShift?.z === -100)).toBe(true);
    expect(result.segments[1].from).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("rifiuta altre forme G10 o blocchi ambigui senza applicarne lo shift", () => {
    for (const block of [
      "G10Z-10",
      "G10P1Z-10",
      "G10L2P0Z-10",
      "G10P0",
      "G10P0Y10",
      "G10P0X10U2",
      "G10P0Z10W2",
      "G10P0P1Z10",
      "G10P0X1X2",
      "G0G10P0Z10",
      "G10P0Z10M30",
      "G10P0Z1000001",
      "G10P0Z#1",
    ]) {
      const result = simulate(`G1X1\n${block}\nG1X99`, "lathe");
      expect(result.complete, block).toBe(false);
      expect(result.issues[0].line, block).toBe(2);
      expect(result.segments, block).toHaveLength(1);
      expect(result.steps.at(-1)?.workShift, block).toBeNull();
    }
    expect(simulate("G10P0Z-10", "mill").issues[0].message).toContain("Tornio");
  });

  it("registra G10 senza moti ma conserva le interruzioni per altri codici", () => {
    const onlyShift = simulate("G10P0Z-266.2", "lathe");
    expect(onlyShift.complete).toBe(true);
    expect(onlyShift.segments).toEqual([]);
    expect(onlyShift.steps).toHaveLength(1);
    expect(onlyShift.distance).toBe(0);
    const stopped = simulate("G10P0Z-266.2\nG1X10\nM98P2\nG1X99", "lathe");
    expect(stopped.issues).toEqual([
      { line: 3, message: "M98 non simulato. Anteprima interrotta." },
    ]);
    expect(stopped.segments).toHaveLength(1);
    expect(simulate("G1X10\nM30\nG10P0Z-266.2", "lathe").steps).toHaveLength(1);
    expect(codeInfo("G010", "lathe").description).toContain("G10 P0");
  });
});
