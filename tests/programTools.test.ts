import { describe, expect, it } from "vitest";
import {
  adjustmentChanges,
  adjustmentValue,
  adjacentToolChange,
  toolChangePositions,
} from "../src/lib/programTools";

function apply(
  source: string,
  changes: { from: number; to: number; insert: string }[],
) {
  for (const change of [...changes].reverse())
    source =
      source.slice(0, change.from) + change.insert + source.slice(change.to);
  return source;
}
describe("modifica dei valori programmati", () => {
  it("modifica soltanto i numeri F dei blocchi ISO e conserva commenti, spazi, macro e fine riga", () => {
    const source =
      "%\r\nO1\r\nN10G1X2F100S500 (F300 (F400))\r\n/1N20F.25;F8\r\n(F900\r\nF800)\r\nF#100\r\nF[100+2]\r\nN30 F200*42\r\n'F88'\r\nN40 F (VALORE) 400\r\n%";
    const result = adjustmentChanges(source, "F", "0,35");
    expect(result.changes).toHaveLength(3);
    expect(apply(source, result.changes)).toBe(
      source
        .replace("X2F100S500", "X2F0.35S500")
        .replace("N20F.25;", "N20F0.35;")
        .replace("(VALORE) 400", "(VALORE) 0.35"),
    );
  });
  it("distingue giri, velocità di taglio e limiti, anche dopo blocchi macro", () => {
    const source =
      "G97S600\nG96S200\nS240\nG92S1200\nG97S900\nG50S1800\nS700\nG10L2P1S8\nF#100\nS800\nG97S300";
    const result = adjustmentChanges(source, "S", "1000");
    expect(apply(source, result.changes)).toBe(
      "G97S1000\nG96S200\nS240\nG92S1200\nG97S1000\nG50S1800\nS1000\nG10L2P1S8\nF#100\nS800\nG97S1000",
    );
    expect(result.skipped).toBe(6);
  });
  it("applica la selezione solo alle parole interamente incluse e usa le modalità precedenti", () => {
    const source = "G96S150\nF.2 S200\nG97S700\nF.3";
    const from = source.indexOf("F.2");
    expect(
      apply(
        source,
        adjustmentChanges(source, "F", "0.4", { from, to: from + 3 }).changes,
      ),
    ).toBe(source.replace("F.2", "F0.4"));
    expect(
      adjustmentChanges(source, "F", "0.4", { from: from + 1, to: from + 3 })
        .changes,
    ).toEqual([]);
    expect(
      adjustmentChanges(source, "S", "900", { from, to: source.indexOf("G97") })
        .changes,
    ).toEqual([]);
  });
  it("accetta valori decimali espliciti e rifiuta valori non programmabili", () => {
    expect(adjustmentValue(" 0,25 ", "F")).toBe("0.25");
    expect(adjustmentValue("+.20", "F")).toBe("0.20");
    expect(adjustmentValue("0", "S")).toBe("0");
    for (const value of ["", "0", "-1", "NaN", "1e3", "#100", "1,2,3"])
      expect(adjustmentValue(value, "F")).toBeNull();
    expect(adjustmentChanges("F.2 F0.20", "F", ".200").changes).toEqual([]);
  });
});
describe("navigazione dei cambi utensile", () => {
  it("riconosce i richiami T del tornio, escludendo commenti, azzeramenti e macro", () => {
    const source =
      "%\nO1\n(T9999)\n/1N10T0101\nT0000\n;T0202\n(MSG\nT8888)\nN20T1212\nT#100\nT1.5\nM30";
    expect(toolChangePositions(source, "lathe")).toEqual([
      source.indexOf("T0101"),
      source.indexOf("T1212"),
    ]);
  });
  it("in fresatura si ferma su M6, distinguendo la preselezione T", () => {
    const source = "T1\nG0X1\nM06\nT2\nT3 M6\n(M6T4)\n; M6\nM30";
    expect(toolChangePositions(source, "mill")).toEqual([
      source.indexOf("M06"),
      source.indexOf("T3"),
    ]);
  });
  it("torna all’inizio e alla fine e gestisce i programmi privi di cambi", () => {
    expect(adjacentToolChange([10, 30], 10, 1)).toBe(30);
    expect(adjacentToolChange([10, 30], 30, 1)).toBe(10);
    expect(adjacentToolChange([10, 30], 10, -1)).toBe(30);
    expect(adjacentToolChange([], 0, 1)).toBeNull();
  });
});
