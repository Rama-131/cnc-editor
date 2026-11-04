import { describe, expect, it } from "vitest";
import { simulate } from "../src/lib/simulator";
import { planG70 } from "../src/lib/turningRoughing";
import { fanucG70Program } from "./fixtures/fanucG71";

describe("G70 finitura del profilo P/Q", () => {
  it("ripercorre il profilo dell’utente senza i sovrametalli del G71, con A135 e R1.8", () => {
    const result = simulate(fanucG70Program, "lathe");
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(true);
    const lines = fanucG70Program.split("\n");
    const finishing = result.steps.filter(
      (step) => step.action === "G70 · finitura del profilo nominale",
    );
    const at = (label: string) =>
      finishing.filter((step) => lines[step.line - 1].startsWith(label)).at(-1)!
        .position;
    expect(at("N210").x).toBeCloseTo(19.9, 8);
    expect(at("N210").z).toBeCloseTo(-1.65, 8);
    expect(at("N308").x).toBeCloseTo(30, 8);
    expect(at("N308").z).toBeCloseTo(-293.25, 8);
    expect(at("N310")).toEqual({ x: 32.5, y: 0, z: -302 });
    const arc = finishing.filter((step) =>
      lines[step.line - 1].startsWith("N270"),
    );
    expect(arc.length).toBeGreaterThan(8);
    expect(arc[0].position).toEqual({ x: 22.75, y: 0, z: -203.6 });
    for (const step of arc)
      expect(
        Math.hypot(step.position.x - 24.55, step.position.z + 203.6),
      ).toBeCloseTo(1.8, 8);
    expect(
      finishing.every(
        (step) => step.workShift?.z === -266.2 && step.spindleLimit === 1200,
      ),
    ).toBe(true);
    const changedAllowance = simulate(
      fanucG70Program.replace("Q310 U1 W0.1", "Q310 U2 W0.3"),
      "lathe",
    );
    expect(changedAllowance.complete).toBe(true);
    expect(
      changedAllowance.steps
        .filter((step) => step.action === "G70 · finitura del profilo nominale")
        .map((step) => step.position),
    ).toEqual(finishing.map((step) => step.position));
  });

  it("torna al punto del richiamo e prosegue dopo G70 senza ripetere la sgrossatura", () => {
    const result = simulate(fanucG70Program, "lathe");
    const completed = result.steps.find(
      (step) => step.action === "G70 · finitura completata",
    )!;
    expect(completed.position).toEqual({ x: 32.5, y: 0, z: 1 });
    expect(result.segments.at(-1)).toMatchObject({
      from: { x: 32.5, y: 0, z: 1 },
      to: { x: 40, y: 0, z: 10 },
      rapid: true,
    });
    const profileLine =
      fanucG70Program.split("\n").findIndex((line) => line.startsWith("N200")) +
      1;
    expect(
      result.segments.filter((segment) => segment.line === profileLine),
    ).toHaveLength(2);
    expect(
      result.steps.filter(
        (step) => step.action === "G71 · completate 6 passate",
      ),
    ).toHaveLength(1);
    expect(
      result.notes.some((note) => note.includes("G70: profilo nominale")),
    ).toBe(true);
  });

  it("rispetta diametro, raggio e pollici anche nella finitura", () => {
    for (const diameter of [true, false]) {
      const result = simulate(
        `G0X${diameter ? 40 : 20}Z2\nG71U2R.5\nG71P10Q20U1W.2\nN10G0X${diameter ? 20 : 10}\nN20G1Z-10\nG70P10Q20`,
        "lathe",
        diameter,
      );
      expect(result.complete).toBe(true);
      expect(
        result.steps
          .filter(
            (step) => step.action === "G70 · finitura del profilo nominale",
          )
          .at(-1)?.position,
      ).toEqual({ x: 10, y: 0, z: -10 });
    }
    const inches = simulate(
      "G20\nG0X2Z.1\nG71U.1R.02\nG71P10Q20U.02W.01\nN10G0X1\nN20G1Z-1\nG70P10Q20",
      "lathe",
    );
    expect(inches.complete).toBe(true);
    expect(
      inches.steps
        .filter((step) => step.action === "G70 · finitura del profilo nominale")
        .at(-1)?.position,
    ).toEqual({ x: 12.7, y: 0, z: -25.4 });
  });

  it("interrompe su riferimenti o parametri G70 non supportati senza inventare movimenti di finitura", () => {
    for (const block of [
      "G70P190",
      "G70P190Q999",
      "G70P310Q190",
      "G70P0Q310",
      "G70P190Q310U1",
      "G70P190P200Q310",
      "G70P190Q310M3",
      "G0G70P190Q310",
    ]) {
      const result = simulate(
        fanucG70Program.replace("N330 G70 P190 Q310", block),
        "lathe",
      );
      expect(result.complete, block).toBe(false);
      expect(result.issues[0].message, block).toContain("G70 non simulato");
      expect(
        result.steps.some((step) => step.action?.startsWith("G70")),
        block,
      ).toBe(false);
    }
    expect(simulate("G70P10Q20", "mill").complete).toBe(false);
    expect(simulate("G0X1\nM30\nG70P10Q20", "lathe").complete).toBe(true);
  });

  it("attribuisce al G70 gli errori del profilo e rifiuta riferimenti in avanti", () => {
    const lines = fanucG70Program.replace("R1.8", "R100").split("\n");
    const callIndex = lines.findIndex((line) => line.includes("G70"));
    expect(() =>
      planG70({
        lines,
        callIndex,
        start: { x: 32.5, y: 0, z: 1 },
        unit: 1,
        diameter: true,
        p: 190,
        q: 310,
      }),
    ).toThrow(/G70 non simulato: raccordi R troppo grandi/);
    const forward = simulate(
      "G0X40Z2\nG70P10Q20\nN10G0X20\nN20G1Z-10",
      "lathe",
    );
    expect(forward.complete).toBe(false);
    expect(forward.issues[0].message).toContain("prima del richiamo");
  });
});
