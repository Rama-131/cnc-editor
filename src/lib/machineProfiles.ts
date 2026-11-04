import { defaultSerial, type SerialSettings } from "./serial";

export const serialControls = [
  "Fanuc",
  "Mitsubishi",
  "Altro controllo ISO",
] as const;
export const baudRates = [
  110, 300, 600, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200,
];
export const blockDelays = [0, 10, 25, 50, 100, 250];
export const MACHINES_KEY = "cnc.machines";
export type MachineProfile = {
  id: string;
  name: string;
  control: (typeof serialControls)[number];
  settings: SerialSettings;
};
export type MachineProfiles = {
  version: 1;
  machines: MachineProfile[];
  selectedId: string | null;
};

function validSettings(value: unknown): value is SerialSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as SerialSettings;
  return (
    baudRates.includes(v.baudRate) &&
    [7, 8].includes(v.dataBits) &&
    [1, 2].includes(v.stopBits) &&
    ["none", "even", "odd"].includes(v.parity) &&
    ["none", "hardware", "software"].includes(v.flowControl) &&
    ["CRLF", "CR", "LF"].includes(v.lineEnding) &&
    blockDelays.includes(v.delay) &&
    typeof v.wrap === "boolean"
  );
}
export function validMachine(value: unknown): value is MachineProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as MachineProfile;
  return (
    typeof v.id === "string" &&
    !!v.id &&
    typeof v.name === "string" &&
    !!v.name.trim() &&
    v.name.length <= 80 &&
    serialControls.includes(v.control) &&
    validSettings(v.settings)
  );
}
export function newMachine(): MachineProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    control: "Fanuc",
    settings: { ...defaultSerial },
  };
}
export function loadMachineProfiles(
  storage: Pick<Storage, "getItem">,
): MachineProfiles {
  const empty: MachineProfiles = { version: 1, machines: [], selectedId: null };
  try {
    const raw = storage.getItem(MACHINES_KEY);
    if (raw !== null) {
      const value = JSON.parse(raw);
      if (value?.version !== 1 || !Array.isArray(value.machines)) return empty;
      const machines: MachineProfile[] = [];
      for (const item of value.machines) {
        if (validMachine(item) && !machines.some((m) => m.id === item.id))
          machines.push(item);
      }
      return {
        version: 1,
        machines,
        selectedId:
          machines.find((m) => m.id === value.selectedId)?.id ??
          machines[0]?.id ??
          null,
      };
    }
    // Recover only profiles previously saved by the serial configurator.
    const machines = serialControls.flatMap((control) => {
      try {
        const settings = JSON.parse(
          storage.getItem(`cnc.serial.${control}`) ?? "null",
        );
        return validSettings(settings)
          ? [{ id: `legacy-${control}`, name: control, control, settings }]
          : [];
      } catch {
        return [];
      }
    });
    const selected = storage.getItem("cnc.serial.profile");
    return {
      version: 1,
      machines,
      selectedId:
        machines.find((m) => m.control === selected)?.id ??
        machines[0]?.id ??
        null,
    };
  } catch {
    return empty;
  }
}
