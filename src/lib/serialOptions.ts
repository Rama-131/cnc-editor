import type { SerialSettings } from "./serial";

export type PortOptions = {
  dtr: boolean | null;
  rts: boolean | null;
  xon: string;
  xoff: string;
};
export type TransmitOptions = {
  startTrigger: string;
  endTrigger: string;
  beforeFile: string;
  afterFile: string;
  ignoreLines: string;
  removeCharacters: string;
  stopAfter: number;
  handshakeTimeout: number;
  beforeLineDelay: number;
  waitForXon: boolean;
  removeNul: boolean;
  removeSpaces: boolean;
  tabsToSpaces: boolean;
  customLineEnding: boolean;
  lineEndingSequence: string;
};
export type ReceiveOptions = {
  lineEnding: "auto" | "CRLF" | "LF" | "CR";
  discardLineCharacters: string;
  omitLineString: string;
  removeCharacters: string;
  removeControls: boolean;
  omitEmpty: boolean;
  startTrigger: string;
  endTrigger: string;
  timeout: number;
  sendXon: boolean;
  initial: string;
};
export type DirectoryOptions = {
  send: { extension: string; additionalExtensions: string };
  receive: { extension: string; additionalExtensions: string };
};
export const defaultPort: PortOptions = {
  dtr: null,
  rts: null,
  xon: "\\17",
  xoff: "\\19",
};
export const defaultTransmit: TransmitOptions = {
  startTrigger: "",
  endTrigger: "",
  beforeFile: "",
  afterFile: "",
  ignoreLines: "",
  removeCharacters: "",
  stopAfter: 0,
  handshakeTimeout: 30,
  beforeLineDelay: 0,
  waitForXon: false,
  removeNul: false,
  removeSpaces: false,
  tabsToSpaces: false,
  customLineEnding: false,
  lineEndingSequence: "\\13\\10",
};
export const defaultReceive: ReceiveOptions = {
  lineEnding: "auto",
  discardLineCharacters: "",
  omitLineString: "",
  removeCharacters: "",
  removeControls: false,
  omitEmpty: false,
  startTrigger: "",
  endTrigger: "",
  timeout: 0,
  sendXon: true,
  initial: "",
};
export const defaultDirectories: DirectoryOptions = {
  send: { extension: "nc", additionalExtensions: "txt;cnc;tap;iso;mpf;gcode" },
  receive: { extension: "nc", additionalExtensions: "txt" },
};
export const portOptions = (s: SerialSettings): PortOptions => ({
  ...defaultPort,
  ...s.port,
});
export const transmitOptions = (s: SerialSettings): TransmitOptions => ({
  ...defaultTransmit,
  ...s.transmit,
});
export const receiveOptions = (s: SerialSettings): ReceiveOptions => ({
  ...defaultReceive,
  ...s.receive,
});
export const directoryOptions = (s: SerialSettings): DirectoryOptions => ({
  send: { ...defaultDirectories.send, ...s.directories?.send },
  receive: { ...defaultDirectories.receive, ...s.directories?.receive },
});

// CIMCO notation uses decimal ASCII codes: \17 = XON, \13\10 = CR/LF.
export function controlText(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== "\\") {
      result += value[i];
      continue;
    }
    const rest = value.slice(i + 1);
    const number = rest.match(/^\d{1,3}/)?.[0];
    if (number) {
      const code = Number(number);
      if (code > 127)
        throw new Error("I codici ASCII devono essere compresi tra 0 e 127.");
      result += String.fromCharCode(code);
      i += number.length;
    } else {
      const escape = rest[0];
      const char = (
        { r: "\r", n: "\n", t: "\t", "\\": "\\" } as Record<string, string>
      )[escape];
      if (char === undefined)
        throw new Error(
          "Sequenza non valida: usa \\13\\10, \\17, \\19 o \\\\ per una barra inversa.",
        );
      result += char;
      i++;
    }
  }
  if (/[^\x00-\x7f]/.test(result))
    throw new Error("Le sequenze seriali richiedono caratteri ASCII.");
  return result;
}

export function validateSerialOptions(settings: SerialSettings): string | null {
  try {
    // Validate the complete saved groups, including imported local-storage values.
    for (const [value, defaults] of [
      [settings.port, defaultPort],
      [settings.transmit, defaultTransmit],
      [settings.receive, defaultReceive],
    ] as const) {
      if (value === undefined) continue;
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Impostazioni seriali non valide.");
      for (const [key, expected] of Object.entries(defaults)) {
        const actual = (value as Record<string, unknown>)[key];
        if (actual === undefined) continue;
        if (
          expected === null
            ? actual !== null && typeof actual !== "boolean"
            : typeof actual !== typeof expected
        )
          throw new Error("Tipo di parametro seriale non valido.");
      }
    }
    const p = portOptions(settings),
      t = transmitOptions(settings),
      r = receiveOptions(settings);
    if (
      controlText(p.xon).length !== 1 ||
      controlText(p.xoff).length !== 1 ||
      controlText(p.xon) === controlText(p.xoff)
    )
      throw new Error(
        "XON e XOFF devono essere due caratteri ASCII singoli e diversi.",
      );
    for (const text of [
      t.startTrigger,
      t.endTrigger,
      t.beforeFile,
      t.afterFile,
      t.ignoreLines,
      t.removeCharacters,
      t.lineEndingSequence,
      r.discardLineCharacters,
      r.omitLineString,
      r.removeCharacters,
      r.startTrigger,
      r.endTrigger,
      r.initial,
    ]) {
      if (text.length > 4096)
        throw new Error(
          "Ogni sequenza può contenere al massimo 4096 caratteri.",
        );
      controlText(text);
    }
    if (t.customLineEnding && !controlText(t.lineEndingSequence))
      throw new Error("Inserisci la sequenza di fine riga.");
    for (const [n, max] of [
      [t.stopAfter, 100000000],
      [t.handshakeTimeout, 3600],
      [t.beforeLineDelay, 60000],
      [r.timeout, 3600],
    ])
      if (!Number.isFinite(n) || n < 0 || n > max || !Number.isInteger(n))
        throw new Error(
          "Tempi e limiti devono essere numeri interi positivi o zero, entro i limiti indicati.",
        );
    if (t.waitForXon && !["software", "both"].includes(settings.flowControl))
      throw new Error("Attendi XON richiede il controllo di flusso Software.");
    if (!["auto", "CRLF", "CR", "LF"].includes(r.lineEnding))
      throw new Error("Fine riga di ricezione non valida.");
    if (settings.directories !== undefined) {
      if (
        !settings.directories ||
        typeof settings.directories !== "object" ||
        Array.isArray(settings.directories) ||
        ["send", "receive"].some((key) => {
          const value = (
            settings.directories as unknown as Record<string, unknown>
          )[key];
          return !value || typeof value !== "object" || Array.isArray(value);
        })
      )
        throw new Error("Directory non valide.");
      for (const d of Object.values(directoryOptions(settings))) {
        if (
          typeof d.extension !== "string" ||
          !/^\.?[a-z0-9]{1,12}$/i.test(d.extension) ||
          typeof d.additionalExtensions !== "string" ||
          d.additionalExtensions
            .split(/[;,\s]+/)
            .filter(Boolean)
            .some((ext) => !/^\.?[a-z0-9]{1,12}$/i.test(ext))
        )
          throw new Error(
            "Usa estensioni come nc o txt, separate da punto e virgola.",
          );
      }
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export class ReceptionFilter {
  private pending = "";
  private line = "";
  private started: boolean;
  private ended = false;
  private start: string;
  private end: string;
  private remove: Set<string>;
  private discard: string;
  private omit: string;
  constructor(private options: ReceiveOptions) {
    this.start = controlText(options.startTrigger);
    this.end = controlText(options.endTrigger);
    this.started = !this.start;
    // Line terminators frame the program; CIMCO's ASCII0TO31 filtering applies
    // to the line contents, so retain CR/LF while removing other control bytes.
    const controls = options.removeControls
      ? Array.from({ length: 32 }, (_, i) => i)
          .filter((i) => i !== 10 && i !== 13)
          .map((i) => String.fromCharCode(i))
          .join("")
      : "";
    this.remove = new Set(controlText(options.removeCharacters) + controls);
    this.discard = controlText(options.discardLineCharacters);
    this.omit = controlText(options.omitLineString);
  }
  get done() {
    return this.ended;
  }
  push(text: string): string {
    if (this.ended) return "";
    this.pending += text;
    let output = "";
    if (!this.started) {
      const at = this.pending.indexOf(this.start);
      if (at < 0) {
        this.pending =
          this.start.length > 1
            ? this.pending.slice(-(this.start.length - 1))
            : "";
        return "";
      }
      this.pending = this.pending.slice(at + this.start.length);
      this.started = true;
      output = this.start; // Keep the opening marker, but don't match it as the closing marker.
    }
    if (this.end) {
      const at = this.pending.indexOf(this.end);
      if (at >= 0) {
        output += this.pending.slice(0, at + this.end.length);
        this.pending = "";
        this.ended = true;
      } else {
        const keep = Math.min(this.end.length - 1, this.pending.length);
        output += this.pending.slice(0, this.pending.length - keep);
        this.pending = this.pending.slice(this.pending.length - keep);
      }
    } else {
      output += this.pending;
      this.pending = "";
    }
    return this.filter(output, this.ended);
  }
  finish(): string {
    if (!this.started || this.ended) return "";
    const tail = this.pending;
    this.pending = "";
    return this.filter(tail, true);
  }
  private filter(text: string, final: boolean): string {
    const o = this.options;
    text = Array.from(text)
      .filter((c) => !this.remove.has(c))
      .join("");
    if (!this.discard && !this.omit && !o.omitEmpty && o.lineEnding === "auto")
      return text;
    this.line += text;
    if (!final && this.line.length > 2 * 1024 * 1024)
      throw new Error(
        "Riga ricevuta troppo lunga (oltre 2 MB). Ricezione interrotta.",
      );
    let result = "";
    const emit = (body: string, ending: string) => {
      if (
        (this.discard &&
          Array.from(this.discard).some((c) => body.includes(c))) ||
        (this.omit && body.includes(this.omit)) ||
        (o.omitEmpty && !body.trim())
      )
        return;
      result +=
        body +
        (ending && o.lineEnding !== "auto"
          ? { CRLF: "\r\n", LF: "\n", CR: "\r" }[o.lineEnding]
          : ending);
    };
    while (true) {
      const at = this.line.search(/[\r\n]/);
      if (
        at < 0 ||
        (!final && at === this.line.length - 1 && this.line[at] === "\r")
      )
        break;
      const size = this.line.slice(at, at + 2) === "\r\n" ? 2 : 1;
      emit(this.line.slice(0, at), this.line.slice(at, at + size));
      this.line = this.line.slice(at + size);
    }
    if (final && this.line) {
      emit(this.line, "");
      this.line = "";
    }
    return result;
  }
}
