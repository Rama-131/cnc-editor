import { describe, expect, it } from "vitest";
import { createProgram, restorePrograms } from "../src/lib/useProgramDocuments";

function storage(values: Record<string, unknown>) {
  return {
    getItem: (key: string) =>
      key in values ? JSON.stringify(values[key]) : null,
  };
}

describe("schede dei programmi", () => {
  it("migra la bozza precedente senza considerarla salvata sul PC e normalizza le righe", () => {
    const result = restorePrograms(
      storage({
        "cnc.draft": {
          source: "G0X10\r\nG1Z-5\rM30",
          name: "tornio.nc",
          machine: "lathe",
        },
      }),
    );
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]).toMatchObject({
      name: "tornio.nc",
      source: "G0X10\nG1Z-5\nM30",
      machine: "lathe",
      savedSource: null,
    });
    expect(result.activeId).toBe(result.documents[0].id);
  });
  it("ripristina ordine, selezione, impostazioni e stato salvato delle singole schede", () => {
    const result = restorePrograms(
      storage({
        "cnc.workspace": {
          version: 1,
          activeId: "b",
          previewVisible: false,
          documents: [
            {
              id: "a",
              name: "a.nc",
              source: "G1X1",
              machine: "mill",
              diameter: true,
              saved: false,
            },
            {
              id: "b",
              name: "b.nc",
              source: "G1Z-2",
              machine: "lathe",
              diameter: false,
              saved: true,
            },
          ],
        },
      }),
    );
    expect(result.documents.map((doc) => doc.id)).toEqual(["a", "b"]);
    expect(result.activeId).toBe("b");
    expect(result.previewVisible).toBe(false);
    expect(result.documents[0].savedSource).toBeNull();
    expect(result.documents[1]).toMatchObject({
      savedSource: "G1Z-2",
      machine: "lathe",
      diameter: false,
    });
  });
  it("mantiene vuota un’area in cui tutti i file sono stati chiusi, senza riaprire la vecchia bozza", () => {
    const result = restorePrograms(
      storage({
        "cnc.workspace": { version: 1, documents: [], activeId: null },
        "cnc.draft": { source: "G1X99", name: "chiuso.nc" },
      }),
    );
    expect(result.documents).toEqual([]);
    expect(result.activeId).toBeNull();
  });
  it("assegna identità separate anche a file con lo stesso nome e non rende sporca una semplice apertura CRLF", () => {
    const input = {
      name: "uguale.nc",
      source: "G1X1\r\nM30",
      machine: "mill" as const,
      diameter: true,
      saved: true,
    };
    const a = createProgram(input),
      b = createProgram(input);
    expect(a.id).not.toBe(b.id);
    expect(a.source).toBe("G1X1\nM30");
    expect(a.savedSource).toBe(a.source);
    expect(createProgram({ ...input, saved: false }).savedSource).toBeNull();
  });
  it("recupera una bozza modificata anche se supera il limite applicato ai file importati", () => {
    const source = "(" + "X".repeat(2 * 1024 * 1024) + ")";
    const result = restorePrograms(
      storage({
        "cnc.workspace": {
          version: 1,
          activeId: "big",
          documents: [
            {
              id: "big",
              name: "bozza.nc",
              source,
              machine: "mill",
              saved: false,
            },
          ],
        },
      }),
    );
    expect(result.activeId).toBe("big");
    expect(result.documents[0].source).toBe(source);
    expect(result.documents[0].savedSource).toBeNull();
  });
});
