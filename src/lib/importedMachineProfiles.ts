import { parseMch } from "./machineImport";
import machine0 from "../data/machines/DARTVMC1000A.mch?raw";
import machine1 from "../data/machines/FRESAQUARTZ.mch?raw";
import machine2 from "../data/machines/BIGLIAS131.mch?raw";
import machine3 from "../data/machines/HURCOVM1.mch?raw";
import machine4 from "../data/machines/MAZAKHTC400.mch?raw";
import machine5 from "../data/machines/MOMACTA20.mch?raw";
import machine6 from "../data/machines/PUMA300L.mch?raw";

export const importedMachines = [
  parseMch(machine0, "DARTVMC1000A.mch"),
  parseMch(machine1, "FRESAQUARTZ.mch"),
  parseMch(machine2, "BIGLIAS131.mch"),
  parseMch(machine3, "HURCOVM1.mch"),
  parseMch(machine4, "MAZAKHTC400.mch"),
  parseMch(machine5, "MOMACTA20.mch"),
  parseMch(machine6, "PUMA300L.mch"),
];
