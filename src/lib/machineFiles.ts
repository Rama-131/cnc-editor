import { downloadText } from "./files";
import type { MachineProfile } from "./machineProfiles";
import { directoryOptions } from "./serialOptions";

export type Direction = "send" | "receive";
type Directory = { name: string; kind: "directory" };
type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};
type PickerWindow = Window & {
  showDirectoryPicker?: (options: object) => Promise<Directory>;
  showOpenFilePicker?: (options: object) => Promise<FileHandle[]>;
  showSaveFilePicker?: (options: object) => Promise<FileHandle>;
};
const key = (id: string, direction: Direction) => `${id}:${direction}`;
const cache = new Map<string, Directory>();
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("cnc-machine-directories", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("folders");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
export const canChooseDirectory = () =>
  typeof window !== "undefined" &&
  !!(window as PickerWindow).showDirectoryPicker;
export async function machineDirectory(id: string, direction: Direction) {
  const idKey = key(id, direction);
  if (cache.has(idKey)) return cache.get(idKey);
  const database = await db();
  const directory = await new Promise<Directory | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("folders")
        .objectStore("folders")
        .get(idKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    },
  );
  if (directory) cache.set(idKey, directory);
  return directory;
}
export async function chooseMachineDirectory(id: string, direction: Direction) {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker)
    throw new Error("Per scegliere le cartelle usa Chrome o Edge su Windows.");
  const directory = await picker.call(window, {
    id: `cnc-${direction}`,
    mode: "read",
  });
  await storeDirectory(id, direction, directory);
  return directory;
}
export async function storeDirectory(
  id: string,
  direction: Direction,
  directory?: Directory,
) {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("folders", "readwrite"),
      store = tx.objectStore("folders");
    if (directory) store.put(directory, key(id, direction));
    else store.delete(key(id, direction));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  if (directory) cache.set(key(id, direction), directory);
  else cache.delete(key(id, direction));
}
export function extensions(machine: MachineProfile, direction: Direction) {
  const options = directoryOptions(machine.settings)[direction];
  return Array.from(
    new Set(
      [options.extension, ...options.additionalExtensions.split(/[;,\s]+/)]
        .map((s) => s.replace(/^\./, "").toLowerCase())
        .filter((s) => /^[a-z0-9]{1,12}$/.test(s)),
    ),
  );
}
function fileTypes(machine: MachineProfile, direction: Direction, name = "") {
  const extra = name.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase();
  const exts = Array.from(
    new Set([...extensions(machine, direction), ...(extra ? [extra] : [])]),
  );
  return [
    {
      description: "Programmi CNC e file di testo",
      accept: { "text/plain": exts.map((s) => `.${s}`) },
    },
  ];
}
// A directory is a starting location for the browser's native dialogs. The OS
// still asks the user to choose the file and confirm any overwrite.
export async function openMachineFiles(
  machine?: MachineProfile,
): Promise<File[] | null> {
  if (!machine || !(window as PickerWindow).showOpenFilePicker) return null;
  const startIn = await machineDirectory(machine.id, "send").catch(
    () => undefined,
  );
  if (!startIn) return null;
  const handles = await (window as PickerWindow).showOpenFilePicker!({
    startIn,
    multiple: true,
    types: fileTypes(machine, "send"),
  });
  return Promise.all(handles.map((h) => h.getFile()));
}
export async function saveMachineFile(
  text: string,
  name: string,
  direction: Direction,
  machine?: MachineProfile,
) {
  const picker = (window as PickerWindow).showSaveFilePicker;
  const startIn =
    machine && picker
      ? await machineDirectory(machine.id, direction).catch(() => undefined)
      : undefined;
  if (!startIn || !machine || !picker) {
    downloadText(text, name);
    return { name, downloaded: true };
  }
  const handle = await picker.call(window, {
    startIn,
    suggestedName: name,
    types: fileTypes(machine, direction, name),
  });
  const writer = await handle.createWritable();
  try {
    await writer.write(
      new Blob([text], {
        type: "text/plain;charset=utf-8",
        endings: "transparent",
      }),
    );
    await writer.close();
  } catch (e) {
    await writer.abort().catch(() => {});
    throw e;
  }
  return { name: handle.name, downloaded: false };
}
