import { describe, expect, it } from "vitest";
import { importedMachines } from "../src/lib/importedMachineProfiles";
import { mergeImportedMachines, parseMch } from "../src/lib/machineImport";
import { validMachine } from "../src/lib/machineProfiles";
import { defaultSerial, encodeProgram } from "../src/lib/serial";
import { receiveOptions, ReceptionFilter } from "../src/lib/serialOptions";

describe("macchine importate dai sette file MCH originali", () => {
  it("usa i parametri attivi STANDARDSERIAL, preservando le differenze dai DEFAULT", () => {
    expect(
      importedMachines.map((m) => [
        m.name,
        m.settings.baudRate,
        m.settings.dataBits,
        m.settings.parity,
        m.settings.stopBits,
        m.settings.flowControl,
        m.settings.port?.dtr,
        m.settings.port?.rts,
        m.importedFrom?.port,
      ]),
    ).toEqual([
      ["DART VMC 1000A", 9600, 7, "even", 2, "software", true, true, "COM3"],
      ["FRESA QUARTZ", 9600, 7, "even", 1, "software", true, true, "COM3"],
      ["BIGLIA S131", 4800, 7, "even", 1, "software", true, true, "COM6"],
      ["HURCO VM1", 9600, 7, "even", 2, "software", false, true, "COM3"],
      ["MAZAK HTC 400", 9600, 7, "even", 2, "both", true, true, "COM3"],
      ["MOMAC TA-20", 9600, 7, "even", 1, "software", true, true, "COM5"],
      ["PUMA 300L", 4800, 7, "even", 2, "software", true, true, "COM3"],
    ]);
    expect(importedMachines.every(validMachine)).toBe(true);
    for (const m of importedMachines) {
      expect(m.settings.port).toMatchObject({ xon: "\\17", xoff: "\\19" });
      expect(m.settings).toMatchObject({
        delay: 0,
        wrap: false,
        lineEnding: "CRLF",
        transmit: {
          removeNul: true,
          handshakeTimeout: 0,
          waitForXon: false,
          beforeLineDelay: 0,
        },
        receive: {
          sendXon: false,
          timeout: 5,
          lineEnding: "auto",
          omitEmpty: false,
        },
      });
      expect(m.settings.directories).toBeUndefined();
      expect(m.control).toBe("Altro controllo ISO");
    }
  });
  it("non aggiunge delimitatori o ritardi assenti nei file originali", () => {
    for (const m of importedMachines) {
      const bytes = encodeProgram("O1234\0\nG1 X10\nM30", m.settings);
      expect(bytes.map((p) => new TextDecoder().decode(p)).join("")).toBe(
        "O1234\r\nG1 X10\r\nM30\r\n",
      );
    }
  });
  it("filtra ASCII0 su sei macchine e ASCII0TO31 sulla HURCO mantenendo le righe", () => {
    for (const m of importedMachines) {
      const filter = new ReceptionFilter(receiveOptions(m.settings));
      const expected =
        m.name === "HURCO VM1" ? "%\r\nO1\r\n%\r\n" : "%\r\nO1\t\r\n%\r\n";
      expect(
        filter.push("%\r\nO1\0\t\r") + filter.push("\n%\r\n") + filter.finish(),
      ).toBe(expected);
    }
  });
  it("aggiunge le sette macchine senza cambiare profili esistenti o selezione e non duplica al secondo tentativo", () => {
    const existing = {
      id: "utente",
      name: "FRESA QUARTZ",
      control: "Fanuc" as const,
      settings: { ...defaultSerial, baudRate: 19200 },
    };
    const current = {
      version: 1 as const,
      machines: [existing],
      selectedId: "utente",
    };
    const merged = mergeImportedMachines(current, importedMachines);
    expect(merged.machines).toHaveLength(8);
    expect(merged.machines[0]).toEqual(existing);
    expect(merged.selectedId).toBe("utente");
    expect(merged.machines.find((m) => m.id === "mch-fresaquartz")?.name).toBe(
      "FRESA QUARTZ (importata)",
    );
    expect(mergeImportedMachines(merged, importedMachines)).toEqual(merged);
    const edited = {
      ...merged,
      machines: merged.machines.map((m) =>
        m.id === "mch-puma300l"
          ? {
              ...m,
              name: "Puma personalizzata",
              settings: { ...m.settings, baudRate: 19200 },
            }
          : m,
      ),
    };
    expect(mergeImportedMachines(edited, importedMachines)).toEqual(edited);
  });
  it("rifiuta configurazioni che non può rappresentare fedelmente", () => {
    expect(() => parseMch("[INFO]\nPROTOCOL=FTP", "test.mch")).toThrow(
      "protocollo non supportato",
    );
    expect(() =>
      parseMch(
        "[INFO]\nPROTOCOL=STANDARDSERIAL\n[STANDARDSERIAL]\nBAUDRATE=veloce",
        "test.mch",
      ),
    ).toThrow();
  });
});
