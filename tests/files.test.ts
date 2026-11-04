import { describe, expect, it } from "vitest";
import { fileExtension, fileNameError, saveAsFilename } from "../src/lib/files";

describe("nomi dei file da salvare", () => {
  it("riconosce le estensioni TXT e NC senza distinguere maiuscole e minuscole", () => {
    expect(fileExtension("O1234.TXT")).toBe("txt");
    expect(fileExtension("pezzo.Nc")).toBe("nc");
    expect(fileExtension("programma")).toBe("");
  });
  it("aggiunge o cambia il formato senza duplicare l’estensione", () => {
    expect(saveAsFilename("lavorazione", "txt")).toBe("lavorazione.txt");
    expect(saveAsFilename("O1234.TXT", "txt")).toBe("O1234.TXT");
    expect(saveAsFilename("pezzo.nc", "txt")).toBe("pezzo.txt");
    expect(saveAsFilename("pezzo.txt", "nc")).toBe("pezzo.nc");
    expect(saveAsFilename("profilo.v2", "txt")).toBe("profilo.v2.txt");
  });
  it("conserva il formato originale oppure lo converte in TXT su richiesta", () => {
    expect(saveAsFilename("lavoro.T", "t", "t")).toBe("lavoro.T");
    expect(saveAsFilename("lavoro.T", "txt", "t")).toBe("lavoro.txt");
    expect(saveAsFilename("  nuovo  ", "tap", "tap")).toBe("nuovo.tap");
  });
  it("rifiuta nomi vuoti, riservati o non validi su Windows", () => {
    for (const name of [
      "",
      ".txt",
      "CON.txt",
      "aux.NC",
      "COM1.txt",
      "LPT9.nc",
      "nome/pezzo.txt",
      'nome"pezzo.nc',
      "file?.txt",
      "nome.",
      "nome ",
      "a".repeat(256) + ".txt",
    ])
      expect(fileNameError(name)).toBeTruthy();
  });
  it("accetta nomi normali, revisioni e caratteri Unicode", () => {
    for (const name of [
      "O1234.TXT",
      "Pezzo revisione 2.nc",
      "albero.v2.TAP",
      "lavorazione_è.txt",
    ])
      expect(fileNameError(name)).toBeNull();
  });
});
