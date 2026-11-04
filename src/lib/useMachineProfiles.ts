import { useEffect, useRef, useState } from "react";
import { importedMachines } from "./importedMachineProfiles";
import { MACHINE_IMPORT_KEY, mergeImportedMachines } from "./machineImport";
import {
  loadMachineProfiles,
  MACHINES_KEY,
  validMachine,
  type MachineProfile,
  type MachineProfiles,
} from "./machineProfiles";

export function useMachineProfiles(onNotice: (message: string) => void) {
  const [initial] = useState(() => {
    let saved: MachineProfiles = { version: 1, machines: [], selectedId: null };
    let pending = true;
    try {
      saved = loadMachineProfiles(localStorage);
      pending = localStorage.getItem(MACHINE_IMPORT_KEY) !== "1";
    } catch {}
    return {
      profiles: pending
        ? mergeImportedMachines(saved, importedMachines)
        : saved,
      pending,
    };
  });
  const [state, setState] = useState<MachineProfiles>(initial.profiles);
  const imported = useRef(!initial.pending);
  useEffect(() => {
    if (imported.current) return;
    try {
      // Persist the profiles before marking the batch as applied. If the marker
      // write fails, stable IDs make retrying the batch safe on the next load.
      localStorage.setItem(MACHINES_KEY, JSON.stringify(state));
      localStorage.setItem(MACHINE_IMPORT_KEY, "1");
      imported.current = true;
    } catch {
      onNotice(
        "Le sette macchine importate sono disponibili in questa sessione, ma non è stato possibile salvarle nel browser. Abilita i dati del sito o libera spazio prima di chiudere.",
      );
    }
  }, [state, onNotice]);
  function commit(next: MachineProfiles) {
    try {
      localStorage.setItem(MACHINES_KEY, JSON.stringify(next));
      setState(next);
      return true;
    } catch {
      onNotice(
        "Impossibile salvare le macchine nel browser. Libera spazio o abilita il salvataggio dei dati del sito e riprova.",
      );
      return false;
    }
  }
  function save(machine: MachineProfile, select: boolean) {
    const profile = { ...machine, name: machine.name.trim() };
    if (!validMachine(profile)) return false;
    const exists = state.machines.some((m) => m.id === profile.id);
    return commit({
      ...state,
      machines: exists
        ? state.machines.map((m) => (m.id === profile.id ? profile : m))
        : [...state.machines, profile],
      selectedId: select ? profile.id : state.selectedId,
    });
  }
  function remove(id: string) {
    const machines = state.machines.filter((m) => m.id !== id);
    return commit({
      ...state,
      machines,
      selectedId:
        state.selectedId === id ? (machines[0]?.id ?? null) : state.selectedId,
    });
  }
  function select(id: string) {
    if (id !== state.selectedId && state.machines.some((m) => m.id === id))
      commit({ ...state, selectedId: id });
  }
  return {
    machines: state.machines,
    selectedId: state.selectedId,
    selected: state.machines.find((m) => m.id === state.selectedId),
    save,
    remove,
    select,
  };
}
