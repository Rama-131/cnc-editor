import { describe, expect, it } from "vitest";
import { simulate } from "../src/lib/simulator";
import { fanucG71Profile, fanucG71Program } from "./fixtures/fanucG71";

describe("G71 Fanuc a due righe, esterno tipo I", () => {
  it("esegue il profilo fornito dall’utente con sei passate a profondità radiale 2.52", () => {
    const result = simulate(fanucG71Program, "lathe");
    expect(result.issues).toEqual([]);
    expect(result.complete).toBe(true);
    const passes = result.steps.filter(
      (s) =>
        s.kind === "motion" &&
        s.action?.includes("passata") &&
        result.segments[s.segmentCount - 1].rapid === false,
    );
    expect(passes).toHaveLength(6);
    const expected = [29.98, 27.46, 24.94, 22.42, 19.9, 18.75];
    passes.forEach((pass, i) => {
      expect(pass.position.x).toBeCloseTo(expected[i], 8);
      expect(pass.line).toBe(6);
      expect(pass.spindleLimit).toBe(1200);
      expect(pass.workShift?.z).toBe(-266.2);
    });
    expect(passes[0].position.z).toBeCloseTo(-292.7, 6);
    expect(passes[1].position.z).toBeCloseTo(-206.11, 6);
    expect(passes[3].position.z).toBeCloseTo(-22.07, 6);
    expect(passes[5].position.z).toBeCloseTo(0.1, 6);
    expect(result.notes.join(" ")).toContain("ritrazioni convenzionali");
  });

  it("ricostruisce A135 sul raggio fisico e conserva U1/W0.1 come sovrametalli", () => {
    const result = simulate(fanucG71Program, "lathe");
    const atLabel = (label: string) =>
      result.steps
        .filter(
          (s) =>
            s.action === "G71 · profilo con sovrametallo" &&
            fanucG71Program.split("\n")[s.line - 1].startsWith(label),
        )
        .at(-1)!.position;
    expect(atLabel("N210").x).toBeCloseTo(20.4, 8);
    expect(atLabel("N210").z).toBeCloseTo(-1.55, 8);
    expect(atLabel("N230").x).toBeCloseTo(22.5, 8);
    expect(atLabel("N230").z).toBeCloseTo(-22.15, 8);
    expect(atLabel("N308").x).toBeCloseTo(30.5, 8);
    expect(atLabel("N308").z).toBeCloseTo(-293.15, 8);
    expect(atLabel("N310").x).toBeCloseTo(33, 8);
    expect(atLabel("N310").z).toBeCloseTo(-301.9, 8);
  });

  it("sostituisce lo spigolo R1.8 con un arco tangente che entra nei tratti disponibili", () => {
    const result = simulate(fanucG71Program, "lathe");
    const arc = result.steps.filter(
      (s) =>
        s.action === "G71 · profilo con sovrametallo" &&
        fanucG71Program.split("\n")[s.line - 1].startsWith("N270"),
    );
    expect(arc.length).toBeGreaterThan(8);
    expect(arc[0].position.x).toBeCloseTo(23.25, 8);
    expect(arc[0].position.z).toBeCloseTo(-203.5, 8);
    expect(arc.at(-1)!.position.x).toBeCloseTo(25.05, 8);
    expect(arc.at(-1)!.position.z).toBeCloseTo(-205.3, 8);
    for (const step of arc)
      expect(
        Math.hypot(step.position.x - 25.05, step.position.z + 203.5),
      ).toBeCloseTo(1.8, 8);
  });

  it("torna al punto iniziale e salta il profilo già usato, senza eseguirlo due volte", () => {
    const result = simulate(fanucG71Program, "lathe");
    const completed = result.steps.find(
      (s) => s.action === "G71 · completate 6 passate",
    )!;
    expect(completed.position).toEqual({ x: 32.5, y: 0, z: 1 });
    expect(result.segments.at(-1)?.to).toEqual({ x: 32.5, y: 0, z: 5 });
    const line =
      fanucG71Program.split("\n").findIndex((s) => s.startsWith("N200")) + 1;
    expect(result.segments.filter((s) => s.line === line)).toHaveLength(1);
  });

  it("gestisce un cilindro senza spallamento finale e distingue diametro/raggio dai parametri radiali", () => {
    for (const diameter of [true, false]) {
      const source = `G0 X${diameter ? 40 : 20} Z2\nG71 U2 R0.5\nG71 P10 Q20 U${diameter ? 1 : 0.5} W0.2\nN10 G0 X${diameter ? 20 : 10}\nN20 G1 Z-10\nM30`;
      const result = simulate(source, "lathe", diameter);
      expect(result.issues).toEqual([]);
      const passes = result.steps.filter(
        (s) =>
          s.action?.includes("passata") &&
          !result.segments[s.segmentCount - 1].rapid,
      );
      expect(passes.map((s) => s.position.x)).toEqual([18, 16, 14, 12, 10.5]);
      expect(passes.every((s) => Math.abs(s.position.z + 9.8) < 1e-8)).toBe(
        true,
      );
      expect(result.segments.at(-1)?.to).toEqual({ x: 20, y: 0, z: 2 });
    }
    const inches = simulate(
      "G20\nG0X2Z.1\nG71U.1R.02\nG71P10Q20U.02W.01\nN10G0X1\nN20G1Z-1",
      "lathe",
    );
    expect(inches.complete).toBe(true);
    const first = inches.steps.find(
      (s) =>
        s.action === "G71 · passata 1/5" &&
        !inches.segments[s.segmentCount - 1].rapid,
    )!;
    expect(first.position.x).toBeCloseTo(25.4 - 2.54, 8);
    expect(first.position.z).toBeCloseTo(-25.4 + 0.254, 8);
  });

  it("interrompe senza generare passate su profili mancanti, tasche, raccordi impossibili o altre forme del ciclo", () => {
    for (const profile of [
      fanucG71Profile.replace("N310", "N311"),
      fanucG71Profile.replace("X39.8 A135", "X30 A135"),
      fanucG71Profile.replace("R1.8", "R100"),
      fanucG71Profile.replace("A135", "A0"),
      fanucG71Profile.replace("N280 G1", "N280 G2"),
      fanucG71Profile.replace("N190 G0 X36.5", "N190 G0 X36.5 Z0"),
    ]) {
      const source = `G0X65Z1\nG71U2.52R.5\nG71P190Q310U1W.1\n${profile}`;
      const result = simulate(source, "lathe");
      expect(result.complete, profile).toBe(false);
      expect(result.segments, profile).toHaveLength(1);
      expect(result.issues[0].message).toContain("G71 non simulato");
    }
    for (const source of [
      "G71U0R.5",
      "G71U2R.5",
      "G71P190Q310",
      "G71U2R.5\nG0X10",
      "G0X65Z1\nG71U.00001R.5\nG71P190Q310\n" + fanucG71Profile,
    ]) {
      expect(simulate(source, "lathe").complete, source).toBe(false);
    }
    expect(simulate(fanucG71Program, "mill").complete).toBe(false);
    expect(
      simulate(
        "G0X65Z1\nG71U.00001R.5\nG71P190Q310\n" + fanucG71Profile,
        "lathe",
      ).issues[0].message,
    ).toContain("1000");
  });
});
