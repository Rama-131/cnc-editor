import { useState } from "react";
import {
  loadMachineProfiles,
  MACHINES_KEY,
  validMachine,
  type MachineProfile,
  type MachineProfiles,
} from "./machineProfiles";

export function useMachineProfiles(onNotice: (message: string) => void) {
  const [state, setState] = useState<MachineProfiles>(() => {
    try {
      return loadMachineProfiles(localStorage);
    } catch {
      return { version: 1, machines: [], selectedId: null };
    }
  });
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
