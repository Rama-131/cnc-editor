import { describe, expect, it } from "vitest";
import { gcodeSpacingChanges } from "../src/lib/gcodeSpacing";
import { simulate } from "../src/lib/simulator";

function spaced(source: string) {
  let result = source;
  for (const change of gcodeSpacingChanges(source).reverse())
    result =
      result.slice(0, change.from) + change.insert + result.slice(change.from);
  return result;
}

describe("spaziatura G-code", () => {
  it("separa i codici mantenendo segni, decimali, zeri e maiuscole/minuscole", () => {
    expect(spaced("N010G01X+20.Z-.5F0.20M08\ng21g90x.25y-10t0101")).toBe(
      "N010 G01 X+20. Z-.5 F0.20 M08\ng21 g90 x.25 y-10 t0101",
    );
    expect(spaced("/1N10G0X20\n/G1Z-5M8\nG 1X2")).toBe(
      "/1N10 G0 X20\n/G1 Z-5 M8\nG 1 X2",
    );
  });

  it("conserva commenti annidati, multilinea, Unicode e commenti a fine riga", () => {
    const source =
      "(😀 G1X99 (M8S10))G1X2(commento)Z3M8;G0X999\r\n" +
      "(INIZIO G1X88\rG1X99 (M3)\nFINE)G0X4Z5";
    expect(spaced(source)).toBe(
      "(😀 G1X99 (M8S10))G1 X2(commento)Z3 M8;G0X999\r\n" +
        "(INIZIO G1X88\rG1X99 (M3)\nFINE)G0 X4 Z5",
    );
    expect(spaced("G1X2(commento non chiuso\nG1X99")).toBe(
      "G1 X2(commento non chiuso\nG1X99",
    );
  });

  it("preserva i blocchi con macro, stringhe, checksum o sintassi sconosciuta", () => {
    const source = [
      "N10G1X[#100+2]Z-5",
      "IF[#1EQ2]GOTO100",
      "WHILE1DO1",
      "G1X#100Z-5",
      "N10G1 X10*42",
      'PRINT "G1X10 (; M8)"',
      "PRINT 'G1X10 (; M8)'",
      "G1X1.2.3Z4",
    ].join("\n");
    expect(spaced(source)).toBe(source);
    expect(spaced(source + "\nG1X10Z5")).toBe(source + "\nG1 X10 Z5");
  });

  it("inserisce soltanto spazi, mantiene le righe e non duplica quelli esistenti", () => {
    const source = "%\r\nO1001\rN10G0X10\n\tG1  X20Y5\r\n\r\nM30\n%\n";
    const result = spaced(source);
    expect(result).toBe("%\r\nO1001\rN10 G0 X10\n\tG1  X20 Y5\r\n\r\nM30\n%\n");
    expect(result.replaceAll(" ", "")).toBe(source.replaceAll(" ", ""));
    expect(gcodeSpacingChanges(result)).toEqual([]);
    expect(gcodeSpacingChanges("")).toEqual([]);
  });

  it("mantiene gli stessi percorsi e riferimenti alle righe in fresatura e tornitura", () => {
    for (const [source, machine] of [
      ["G21G17G90\nG54\nG0X10Y0\nG3X0Y10I-10J0F200\nM30", "mill"],
      [
        "G21G18\nG54\nT0101\nG97S1200M3\nG0X40Z5\nG1Z-20F.2\nG1U-10W-5\nM30",
        "lathe",
      ],
    ] as const) {
      const original = simulate(source, machine);
      expect(original.complete).toBe(true);
      expect(simulate(spaced(source), machine)).toEqual(original);
    }
  });
});
