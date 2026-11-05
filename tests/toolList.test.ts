import { describe, expect, it } from "vitest";
import { createToolList, toolListText } from "../src/lib/toolList";

describe("lista utensili da preparare", () => {
  it("riconosce cambi e preselezioni in fresatura, con descrizioni e correttori del vero utensile attivo", () => {
    const source =
      "O9\nT2 M6 (CENTRINO)\nG43 Z25 H83 S1600 M3 T14\nM98 H50 L1\nT14 M6 (PUNTA 9 HSS)\nG43 H67 T16\nT16 M6 (INCASSATORE)\nG43 H89 T10\nT2 M6\nM30";
    const result = createToolList(source, "mill");
    expect(
      result.tools.map((t) => [
        t.label,
        t.descriptions.join(""),
        t.offsets,
        t.changes,
        t.firstLine,
      ]),
    ).toEqual([
      ["T2", "CENTRINO", ["H83"], 2, 2],
      ["T14", "PUNTA 9 HSS", ["H67"], 1, 3],
      ["T16", "INCASSATORE", ["H89"], 1, 6],
      ["T10", "", [], 0, 8],
    ]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].message).toContain("M98");
    expect(toolListText(result, "pezzo.txt")).toContain(
      "T14\tPUNTA 9 HSS\tH67\t1 richiami\t3",
    );
  });
  it("riconosce T e M6 su righe diverse, commenti adiacenti e righe compatte", () => {
    const result = createToolList(
      "(FRESA (DIAMETRO 10))\nT001\nM06\nG43H01Z10\nT02;PUNTA\nM6\nH2\nT0\nM6",
      "mill",
    );
    expect(
      result.tools.map((t) => [t.number, t.descriptions, t.offsets, t.changes]),
    ).toEqual([
      [1, ["FRESA (DIAMETRO 10)"], ["H1"], 1],
      [2, ["PUNTA"], ["H2"], 1],
    ]);
    expect(result.notes[0].message).toContain("M6 senza");
  });
  it("raggruppa nel tornio lo stesso utensile con correttori diversi e ignora T zero", () => {
    const result = createToolList(
      "T0101 (SGROSSATORE)\nG1X20\nT0102\nT1212 (PUNTA)\nT0000\nT0001\nT3\nT101101",
      "lathe",
    );
    expect(
      result.tools.map((t) => [t.number, t.codes, t.offsets, t.changes]),
    ).toEqual([
      [1, ["T0101", "T0102"], ["Offset 01", "Offset 02"], 2],
      [12, ["T1212"], ["Offset 12"], 1],
      [3, ["T3"], [], 1],
      [101101, ["T101101"], [], 1],
    ]);
    expect(result.notes[0].message).toContain("oltre quattro cifre");
  });
  it("non inventa valori per macro, non legge utensili nei commenti o nelle espressioni e conserva i T numerici nei blocchi con quote parametriche", () => {
    const result = createToolList(
      '(T99 M6)\n; T88\nDPRNT["T77"]\n#100=[T66]\nT2M6G0X#100\nT#500\nM6\nT3 T[1+1] M6',
      "mill",
    );
    expect(result.tools.map((t) => [t.number, t.changes])).toEqual([
      [2, 1],
      [3, 0],
    ]);
    expect(result.notes.some((n) => n.message.includes("parametrico"))).toBe(
      true,
    );
  });
  it("segnala esplicitamente i programmi senza utensili", () => {
    const result = createToolList("G0 X0\nM30", "mill");
    expect(result.tools).toEqual([]);
    expect(toolListText(result, "vuoto.nc")).toContain(
      "Nessun utensile numerico rilevato",
    );
  });
  it("ignora i richiami apparenti dentro stringhe ed espressioni multilinea", () => {
    const result = createToolList(
      'DPRNT["TESTO\nT99 M6\n"]\n#100=[1+\nT88]\nT3 M6 (REALE)',
      "mill",
    );
    expect(result.tools.map((t) => t.number)).toEqual([3]);
  });
});
