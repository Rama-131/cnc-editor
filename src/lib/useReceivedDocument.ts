import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "./files";
import { appendReceivedText, MAX_RECEIVED_CHARS } from "./reception";

function restoreReceived() {
  try {
    const value = JSON.parse(localStorage.getItem("cnc.reception") ?? "null");
    if (
      value &&
      typeof value.text === "string" &&
      value.text.length <= MAX_RECEIVED_CHARS &&
      typeof value.name === "string"
    ) {
      return {
        text: value.text,
        name: value.name,
        saved: value.saved === true,
      };
    }
  } catch {}
  return { text: "", name: "ricevuto.nc", saved: true };
}

export function useReceivedDocument(onNotice: (message: string) => void) {
  const [initial] = useState(restoreReceived);
  const [text, setText] = useState(initial.text);
  const [name, setName] = useState(initial.name);
  const [savedText, setSavedText] = useState(initial.saved ? initial.text : "");
  const raw = useRef(initial.text);
  const dirty = text !== savedText;
  useEffect(() => {
    try {
      localStorage.setItem(
        "cnc.reception",
        JSON.stringify({ text, name, saved: !dirty }),
      );
    } catch {
      onNotice(
        "La bozza ricevuta non può essere conservata nel browser: salva il file ricevuto sul PC.",
      );
    }
  }, [text, name, dirty, onNotice]);
  const append = useCallback((incoming: string) => {
    const result = appendReceivedText(raw.current, incoming);
    raw.current = result.text;
    setText(result.text);
    return !result.overflow;
  }, []);
  const saveAs = useCallback(
    (filename: string) => {
      if (!raw.current) {
        onNotice("Nessun dato ricevuto da salvare.");
        return;
      }
      const snapshot = raw.current;
      downloadText(snapshot, filename);
      setName(filename);
      setSavedText(snapshot);
      onNotice("Download del file ricevuto avviato.");
    },
    [onNotice],
  );
  const save = useCallback(() => saveAs(name), [name, saveAs]);
  const clear = useCallback(() => {
    if (
      dirty &&
      !window.confirm(
        "Il programma ricevuto non è salvato su file. Vuoi svuotarlo per una nuova ricezione?",
      )
    )
      return;
    raw.current = "";
    setText("");
    setSavedText("");
    setName("ricevuto.nc");
    onNotice("Documento di ricezione vuoto, pronto per un nuovo programma.");
  }, [dirty, onNotice]);
  const displayText = useMemo(() => text.replace(/\r\n?/g, "\n"), [text]);
  return {
    text,
    displayText,
    name,
    setName,
    dirty,
    append,
    save,
    saveAs,
    clear,
  };
}
