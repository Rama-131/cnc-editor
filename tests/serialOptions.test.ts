import { describe, it, expect } from "vitest";
import {
  defaultSerial,
  encodeProgram,
  prepareTransmission,
} from "../src/lib/serial";
import {
  controlText,
  defaultReceive,
  ReceptionFilter,
  validateSerialOptions,
} from "../src/lib/serialOptions";
import { loadMachineProfiles, MACHINES_KEY } from "../src/lib/machineProfiles";

const decode = (bytes: Uint8Array[]) =>
  new TextDecoder().decode(new Uint8Array(bytes.flatMap((b) => [...b])));
describe("opzioni RS232", () => {
  it("interpreta codici ASCII decimali, escape e barra inversa letterale", () => {
    expect(controlText("\\17\\19\\13\\10\\0\\\\\\t")).toBe(
      "\x11\x13\r\n\0\\\t",
    );
    for (const value of ["\\128", "\\x", "\\", "è"])
      expect(() => controlText(value)).toThrow();
  });
  it("applica trigger, filtri e sequenze soltanto al flusso inviato", () => {
    const source = "HEADER\n%\nIGNORE\nO1\0\nG1\tX10 ;\n%\nTRAILER";
    const settings = {
      ...defaultSerial,
      wrap: false,
      transmit: {
        startTrigger: "%",
        endTrigger: "%",
        ignoreLines: "IGNORE",
        removeCharacters: ";",
        removeNul: true,
        tabsToSpaces: true,
        removeSpaces: true,
        customLineEnding: true,
        lineEndingSequence: "\\10\\13",
        beforeFile: "\\2",
        afterFile: "\\3",
      },
    };
    expect(decode(encodeProgram(source, settings))).toBe(
      "\x02%\n\rO1\n\rG1X10\n\r%\n\r\x03",
    );
    expect(source).toContain("IGNORE\nO1\0");
    expect(() => encodeProgram("O1", settings)).toThrow("inizio non trovato");
    expect(() => encodeProgram("%\nO1", settings)).toThrow("fine non trovato");
  });
  it("segnala il limite parziale contando anche prefisso e fine riga", () => {
    const result = prepareTransmission("O1\nM30", {
      ...defaultSerial,
      wrap: false,
      transmit: { beforeFile: "\\2", stopAfter: 5 },
    });
    expect(result.limited).toBe(true);
    expect(result.total).toBe(5);
    expect(decode(result.packets)).toBe("\x02O1\r\n");
  });
  it("valida numeri, sequenze, XON/XOFF e dati salvati corrotti", () => {
    expect(
      validateSerialOptions({
        ...defaultSerial,
        transmit: { handshakeTimeout: NaN },
      }),
    ).toBeTruthy();
    expect(
      validateSerialOptions({ ...defaultSerial, transmit: { stopAfter: -1 } }),
    ).toBeTruthy();
    expect(
      validateSerialOptions({ ...defaultSerial, port: { xon: "\\19" } }),
    ).toContain("diversi");
    expect(
      validateSerialOptions({
        ...defaultSerial,
        flowControl: "none",
        transmit: { waitForXon: true },
      }),
    ).toContain("Software");
    const settings = {
      ...defaultSerial,
      receive: { timeout: 5 },
      port: { dtr: true },
    };
    const machine = { id: "1", name: "Fresa", control: "Fanuc", settings };
    const result = loadMachineProfiles({
      getItem: (k) =>
        k === MACHINES_KEY
          ? JSON.stringify({ version: 1, machines: [machine], selectedId: "1" })
          : null,
    });
    expect(result.machines[0].settings).toEqual(settings);
  });
});
describe("filtri di ricezione a pacchetti", () => {
  it("mantiene esattamente i dati originali senza filtri", () => {
    const f = new ReceptionFilter(defaultReceive);
    expect(f.push("O1\r") + f.push("\nM30\0") + f.finish()).toBe("O1\r\nM30\0");
  });
  it("gestisce trigger suddivisi e non usa l’apertura come chiusura", () => {
    const f = new ReceptionFilter({
      ...defaultReceive,
      startTrigger: "BEGIN",
      endTrigger: "END",
    });
    const output = ["noiseB", "EG", "INO1E", "N", "Djunk"]
      .map((t) => f.push(t))
      .join("");
    expect(output + f.finish()).toBe("BEGINO1END");
    expect(f.done).toBe(true);
    expect(f.push("extra")).toBe("");
    const percent = new ReceptionFilter({
      ...defaultReceive,
      startTrigger: "%",
      endTrigger: "%",
    });
    expect(percent.push("junk%\r\nO1\r\n%tail")).toBe("%\r\nO1\r\n%");
    expect(percent.done).toBe(true);
  });
  it("conserva CRLF spezzati e filtra righe e caratteri in ordine", () => {
    const f = new ReceptionFilter({
      ...defaultReceive,
      discardLineCharacters: "?",
      omitLineString: "SKIP",
      removeCharacters: "\\0",
      omitEmpty: true,
      lineEnding: "LF",
    });
    let result = "";
    for (const part of ["O1\0\r", "\nSK", "IP\r\n?bad\r", "\n  \nM30"])
      result += f.push(part);
    expect(result + f.finish()).toBe("O1\nM30");
  });
  it("rilascia un trigger finale incompleto all’arresto manuale", () => {
    const f = new ReceptionFilter({ ...defaultReceive, endTrigger: "END" });
    expect(f.push("O1EN") + f.finish()).toBe("O1EN");
  });
});
