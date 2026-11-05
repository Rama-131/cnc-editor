import { describe, expect, it } from "vitest";
import {
  defaultPalette,
  movementBlock,
  readPalette,
} from "../src/lib/editorAppearance";

const vivid = {
  g: "#4fa9ff",
  m: "#ff6be8",
  axis: "#42e8ff",
  value: "#ffe55b",
  comment: "#7dff6a",
  tool: "#ff9e45",
};
const storage = (p: unknown) => ({ getItem: () => JSON.stringify(p) });
describe("colorazione predefinita come nella foto", () => {
  it("colora movimenti e cicli in giallo e le istruzioni ausiliarie in bianco", () => {
    for (const line of [
      "N1 G0 G40 G90 G80 G94 G54",
      "G0 G54 X0 Y0 M8",
      "G43 Z25 H83 S1600 M3 T14",
      "G81 Z-5.5 R3 F160 L0",
      "G73 Z-41 Q1 R3 F90 L0",
      "G91 G30 Z0",
      "X#100",
      "G01X10Z-5",
    ])
      expect(movementBlock(line), line).toBe(true);
    for (const line of [
      "O0009",
      "T2 M6 (CENTRINO)",
      "G80 G90 G40 G94 G54",
      "M98 H50 L1",
      "G80",
      "%",
      "(G0 X100)",
      "; G81 Z-10",
      "M6 (esterno (X100) Z10)",
      'DPRNT["X10 G0"]',
    ])
      expect(movementBlock(line), line).toBe(false);
    expect(movementBlock("fine X10) M30", 1)).toBe(false);
    expect(movementBlock("fine) G1 X10", 1)).toBe(true);
  });
  it("aggiorna i vecchi colori predefiniti e aggiunge i nuovi campi", () => {
    expect(readPalette(storage(vivid))).toEqual(defaultPalette);
    expect(readPalette(storage(null))).toEqual(defaultPalette);
    expect(
      readPalette({
        getItem: () => {
          throw new Error("negato");
        },
      }),
    ).toEqual(defaultPalette);
  });
  it("mantiene le personalizzazioni precedenti e la scelta dello stile", () => {
    const previous = readPalette(storage({ ...vivid, g: "#ff8844" }));
    expect(previous.mode).toBe("tokens");
    expect(previous.g).toBe("#ff8844");
    const modified = {
      ...defaultPalette,
      motion: "#abcdef",
      lineNumber: "#12cdef",
      mode: "blocks" as const,
    };
    expect(readPalette(storage(modified))).toEqual(modified);
    expect(readPalette(storage({ ...modified, mode: "tokens" })).mode).toBe(
      "tokens",
    );
  });
});
