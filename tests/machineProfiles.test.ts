import { describe, expect, it } from "vitest";
import { loadMachineProfiles, MACHINES_KEY } from "../src/lib/machineProfiles";
import { defaultSerial } from "../src/lib/serial";

function storage(entries: Record<string, unknown>) {
  return {
    getItem: (key: string) =>
      key in entries
        ? typeof entries[key] === "string"
          ? (entries[key] as string)
          : JSON.stringify(entries[key])
        : null,
  };
}
describe("configurazioni delle macchine", () => {
  it("recupera i vecchi profili senza cambiare i parametri o la selezione", () => {
    const fanuc = { ...defaultSerial, baudRate: 4800 };
    const mitsubishi = {
      ...defaultSerial,
      dataBits: 8,
      parity: "none",
      flowControl: "hardware",
      lineEnding: "CR",
      wrap: false,
    };
    const result = loadMachineProfiles(
      storage({
        "cnc.serial.Fanuc": fanuc,
        "cnc.serial.Mitsubishi": mitsubishi,
        "cnc.serial.profile": "Mitsubishi",
      }),
    );
    expect(result.machines.map((m) => [m.name, m.settings])).toEqual([
      ["Fanuc", fanuc],
      ["Mitsubishi", mitsubishi],
    ]);
    expect(result.selectedId).toBe(result.machines[1].id);
  });
  it("conserva una lista vuota salvata senza far ricomparire i profili eliminati", () => {
    expect(
      loadMachineProfiles(
        storage({
          [MACHINES_KEY]: { version: 1, machines: [], selectedId: null },
          "cnc.serial.Fanuc": defaultSerial,
        }),
      ).machines,
    ).toEqual([]);
  });
  it("esclude i parametri non validi e gli ID duplicati e recupera una selezione valida", () => {
    const machine = {
      id: "uno",
      name: "Tornio",
      control: "Fanuc",
      settings: defaultSerial,
    };
    const result = loadMachineProfiles(
      storage({
        [MACHINES_KEY]: {
          version: 1,
          selectedId: "mancante",
          machines: [
            machine,
            machine,
            {
              ...machine,
              id: "due",
              settings: { ...defaultSerial, baudRate: -1 },
            },
          ],
        },
      }),
    );
    expect(result.machines).toEqual([machine]);
    expect(result.selectedId).toBe("uno");
  });
  it("gestisce dati corrotti e l’accesso negato al salvataggio locale", () => {
    expect(
      loadMachineProfiles(storage({ [MACHINES_KEY]: "{errato" })).machines,
    ).toEqual([]);
    expect(
      loadMachineProfiles({
        getItem: () => {
          throw new Error("accesso negato");
        },
      }).machines,
    ).toEqual([]);
  });
});
