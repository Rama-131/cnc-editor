import { useCallback, useEffect, useState } from "react";
import type { Machine } from "./codes";
import { millSample } from "./samples";

export type ProgramDocument = {
  id: string;
  name: string;
  source: string;
  savedSource: string | null;
  machine: Machine;
  diameter: boolean;
};
type Workspace = {
  documents: ProgramDocument[];
  activeId: string | null;
  previewVisible: boolean;
  machine: Machine;
  diameter: boolean;
};
type ProgramInput = {
  name: string;
  source: string;
  machine: Machine;
  diameter: boolean;
  saved: boolean;
};
export function createProgram(input: ProgramInput): ProgramDocument {
  const source = input.source.replace(/\r\n?/g, "\n");
  return {
    id: crypto.randomUUID(),
    name: input.name,
    source,
    savedSource: input.saved ? source : null,
    machine: input.machine,
    diameter: input.diameter,
  };
}

export function restorePrograms(storage: Pick<Storage, "getItem">): Workspace {
  try {
    const stored = JSON.parse(storage.getItem("cnc.workspace") ?? "null");
    if (
      stored?.version === 1 &&
      Array.isArray(stored.documents) &&
      stored.documents.every(
        (doc: Partial<ProgramDocument>) =>
          typeof doc.id === "string" &&
          doc.id.length > 0 &&
          typeof doc.name === "string" &&
          typeof doc.source === "string" &&
          ["mill", "lathe"].includes(doc.machine ?? ""),
      ) &&
      new Set(stored.documents.map((doc: ProgramDocument) => doc.id)).size ===
        stored.documents.length
    ) {
      const documents: ProgramDocument[] = stored.documents.map(
        (doc: ProgramDocument & { saved?: boolean }) => {
          const source = doc.source.replace(/\r\n?/g, "\n");
          return {
            id: doc.id,
            name: doc.name,
            source,
            savedSource: doc.saved === true ? source : null,
            machine: doc.machine,
            diameter: doc.diameter !== false,
          };
        },
      );
      return {
        documents,
        activeId: documents.some((doc) => doc.id === stored.activeId)
          ? stored.activeId
          : (documents[0]?.id ?? null),
        previewVisible: stored.previewVisible !== false,
        machine: stored.machine === "lathe" ? "lathe" : "mill",
        diameter: stored.diameter !== false,
      };
    }
  } catch {}
  try {
    const draft = JSON.parse(storage.getItem("cnc.draft") ?? "null");
    if (typeof draft?.source === "string" && typeof draft?.name === "string") {
      // Old drafts did not record whether their contents had been saved to disk.
      const doc = createProgram({
        source: draft.source,
        name: draft.name,
        machine: draft.machine === "lathe" ? "lathe" : "mill",
        diameter: true,
        saved: false,
      });
      return {
        documents: [doc],
        activeId: doc.id,
        previewVisible: true,
        machine: doc.machine,
        diameter: true,
      };
    }
  } catch {}
  const doc = createProgram({
    source: millSample,
    name: "O1001_piastra.nc",
    machine: "mill",
    diameter: true,
    saved: true,
  });
  return {
    documents: [doc],
    activeId: doc.id,
    previewVisible: true,
    machine: "mill",
    diameter: true,
  };
}

function initialWorkspace() {
  try {
    return restorePrograms(localStorage);
  } catch {
    return restorePrograms({ getItem: () => null });
  }
}

export function useProgramDocuments(onNotice: (message: string) => void) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const active =
    workspace.documents.find((doc) => doc.id === workspace.activeId) ?? null;
  useEffect(() => {
    let failed = false;
    try {
      localStorage.setItem(
        "cnc.workspace",
        JSON.stringify({
          ...workspace,
          version: 1,
          documents: workspace.documents.map(({ savedSource, ...doc }) => ({
            ...doc,
            saved: doc.source === savedSource,
          })),
        }),
      );
    } catch {
      failed = true;
    }
    try {
      if (active)
        localStorage.setItem(
          "cnc.draft",
          JSON.stringify({
            source: active.source,
            name: active.name,
            machine: active.machine,
          }),
        );
      else localStorage.removeItem("cnc.draft");
    } catch {
      failed = true;
    }
    if (failed)
      onNotice(
        "Spazio locale esaurito: non tutte le schede possono essere conservate nel browser. Salva i programmi modificati sul PC.",
      );
  }, [workspace, active, onNotice]);
  const update = useCallback(
    (id: string, patch: Partial<Omit<ProgramDocument, "id">>) => {
      setWorkspace((current) => ({
        ...current,
        documents: current.documents.map((doc) =>
          doc.id === id ? { ...doc, ...patch } : doc,
        ),
        machine: patch.machine ?? current.machine,
        diameter: patch.diameter ?? current.diameter,
      }));
    },
    [],
  );
  const select = useCallback((id: string) => {
    setWorkspace((current) =>
      current.activeId !== id && current.documents.some((doc) => doc.id === id)
        ? { ...current, activeId: id }
        : current,
    );
  }, []);
  const open = useCallback((inputs: ProgramInput[]) => {
    const documents = inputs.map(createProgram);
    if (!documents.length) return;
    setWorkspace((current) => ({
      ...current,
      documents: [...current.documents, ...documents],
      activeId: documents.at(-1)!.id,
    }));
  }, []);
  function close(id: string) {
    const doc = workspace.documents.find((doc) => doc.id === id);
    if (!doc) return false;
    if (
      doc.source !== doc.savedSource &&
      !window.confirm(
        `Il programma «${doc.name}» contiene modifiche non salvate su file. Vuoi chiuderlo?`,
      )
    )
      return false;
    setWorkspace((current) => {
      const index = current.documents.findIndex((doc) => doc.id === id);
      const documents = current.documents.filter((doc) => doc.id !== id);
      return {
        ...current,
        documents,
        activeId:
          current.activeId === id
            ? (documents[Math.min(index, documents.length - 1)]?.id ?? null)
            : current.activeId,
      };
    });
    return true;
  }
  const togglePreview = useCallback(
    () =>
      setWorkspace((current) => ({
        ...current,
        previewVisible: !current.previewVisible,
      })),
    [],
  );
  const configure = useCallback(
    (patch: { machine?: Machine; diameter?: boolean }) =>
      setWorkspace((current) => ({
        ...current,
        ...patch,
        documents: current.documents.map((doc) =>
          doc.id === current.activeId ? { ...doc, ...patch } : doc,
        ),
      })),
    [],
  );
  return {
    ...workspace,
    active,
    machine: active?.machine ?? workspace.machine,
    diameter: active?.diameter ?? workspace.diameter,
    dirty: workspace.documents.some((doc) => doc.source !== doc.savedSource),
    update,
    select,
    open,
    close,
    togglePreview,
    configure,
  };
}
