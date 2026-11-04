import {
  controlText,
  portOptions,
  transmitOptions,
  receiveOptions,
  validateSerialOptions,
  ReceptionFilter,
  type PortOptions,
  type TransmitOptions,
  type ReceiveOptions,
  type DirectoryOptions,
} from "./serialOptions";
export type SerialSettings = {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware" | "software" | "both";
  lineEnding: "CRLF" | "LF" | "CR";
  delay: number;
  wrap: boolean;
  port?: Partial<PortOptions>;
  transmit?: Partial<TransmitOptions>;
  receive?: Partial<ReceiveOptions>;
  directories?: DirectoryOptions;
};
export const defaultSerial: SerialSettings = {
  baudRate: 9600,
  dataBits: 7,
  stopBits: 2,
  parity: "even",
  flowControl: "software",
  lineEnding: "CRLF",
  delay: 10,
  wrap: true,
};
export const usesHardwareFlow = (settings: SerialSettings) =>
  settings.flowControl === "hardware" || settings.flowControl === "both";
export const usesSoftwareFlow = (settings: SerialSettings) =>
  settings.flowControl === "software" || settings.flowControl === "both";
export interface CncPort {
  setSignals?(signals: {
    dataTerminalReady?: boolean;
    requestToSend?: boolean;
  }): Promise<void>;
  open(options: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
export type SerialProvider = { requestPort(): Promise<CncPort> };
export function getSerial(): SerialProvider | undefined {
  return typeof navigator !== "undefined"
    ? (navigator as Navigator & { serial?: SerialProvider }).serial
    : undefined;
}
export function prepareTransmission(source: string, settings: SerialSettings) {
  const invalid = validateSerialOptions(settings);
  if (invalid) throw new Error(invalid);
  const t = transmitOptions(settings);
  const start = controlText(t.startTrigger),
    end = controlText(t.endTrigger);
  let offset = 0;
  if (start) {
    const at = source.indexOf(start);
    if (at < 0) throw new Error("Trigger d’inizio non trovato nel programma.");
    source = source.slice(at);
    offset = start.length;
  }
  if (end) {
    const at = source.indexOf(end, offset);
    if (at < 0) throw new Error("Trigger di fine non trovato nel programma.");
    source = source.slice(0, at + end.length);
  }
  const remove = new Set(
    controlText(t.removeCharacters) + (t.removeNul ? "\0" : ""),
  );
  const ignore = controlText(t.ignoreLines);
  let lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => !ignore || !l.includes(ignore));
  lines = lines.map((l) => {
    let text = Array.from(l)
      .filter((c) => !remove.has(c))
      .join("");
    if (t.tabsToSpaces) text = text.replace(/\t/g, "    ");
    if (t.removeSpaces) text = text.replace(/ /g, "");
    return text;
  });
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(lines.join("\n")))
    throw new Error(
      "La trasmissione richiede testo ASCII. Rimuovi caratteri accentati o simboli non ASCII, anche dai commenti.",
    );
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (!lines.some((l) => l.trim() && l.trim() !== "%"))
    throw new Error("Il programma è vuoto.");
  if (settings.wrap) {
    if (lines[0]?.trim() !== "%") lines.unshift("%");
    if (lines[lines.length - 1]?.trim() !== "%") lines.push("%");
  }
  const eol = t.customLineEnding
    ? controlText(t.lineEndingSequence)
    : { CRLF: "\r\n", LF: "\n", CR: "\r" }[settings.lineEnding];
  const encoder = new TextEncoder();
  let packets = [
    controlText(t.beforeFile),
    ...lines.map((l) => l + eol),
    controlText(t.afterFile),
  ]
    .filter(Boolean)
    .map((l) => encoder.encode(l));
  const originalTotal = packets.reduce((n, p) => n + p.length, 0);
  const limited = t.stopAfter > 0 && t.stopAfter < originalTotal;
  if (limited) {
    let left = t.stopAfter;
    packets = packets
      .map((p) => {
        const part = p.slice(0, left);
        left = Math.max(0, left - p.length);
        return part;
      })
      .filter((p) => p.length > 0);
  }
  return { packets, limited, total: packets.reduce((n, p) => n + p.length, 0) };
}
export function encodeProgram(source: string, settings: SerialSettings) {
  return prepareTransmission(source, settings).packets;
}
export class SerialConnection {
  private port: CncPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readTask: Promise<void> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private paused = false;
  private cancelled = false;
  private closing = false;
  private sending = false;
  private receiving = false;
  private faulted = false;
  private flowSeen = false;
  private filter: ReceptionFilter | null = null;
  private receiveSettings: SerialSettings | null = null;
  private receiveTimer: ReturnType<typeof setTimeout> | undefined;
  private controlQueue: Promise<void> = Promise.resolve();
  constructor(
    private onData: (text: string) => void,
    private onError: (error: string) => void,
    private reception?: {
      onReceive: (text: string) => void;
      onEnd: (reason: "trigger" | "timeout") => void;
    },
  ) {}
  async connect(provider: SerialProvider, settings: SerialSettings) {
    const invalid = validateSerialOptions(settings);
    if (invalid) throw new Error(invalid);
    const port = await provider.requestPort();
    await port.open({
      baudRate: settings.baudRate,
      dataBits: settings.dataBits,
      stopBits: settings.stopBits,
      parity: settings.parity,
      flowControl: usesHardwareFlow(settings) ? "hardware" : "none",
      bufferSize: 4096,
    });
    try {
      const p = portOptions(settings);
      const signals: { dataTerminalReady?: boolean; requestToSend?: boolean } =
        {};
      if (p.dtr !== null) signals.dataTerminalReady = p.dtr;
      if (p.rts !== null && !usesHardwareFlow(settings))
        signals.requestToSend = p.rts;
      if (Object.keys(signals).length) {
        if (!port.setSignals)
          throw new Error("Questo browser non consente di impostare DTR/RTS.");
        await port.setSignals(signals);
      }
    } catch (e) {
      await port.close();
      throw e;
    }
    this.port = port;
    this.closing = false;
    this.paused = false;
    this.flowSeen = false;
    this.faulted = false;
    if (port.readable) {
      this.reader = port.readable.getReader();
      const reader = this.reader;
      const decoder = new TextDecoder();
      this.readTask = (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              const tail = decoder.decode();
              if (tail) this.deliver(tail);
              if (!this.closing) {
                this.cancelled = true;
                this.faulted = true;
                this.finishReception();
                this.onError(
                  "Porta seriale scollegata. Disconnetti prima di ricollegare.",
                );
              }
              break;
            }
            if (value) {
              const options = portOptions(settings),
                xon = controlText(options.xon).charCodeAt(0),
                xoff = controlText(options.xoff).charCodeAt(0);
              for (const b of value) {
                if (usesSoftwareFlow(settings) && (b === xon || b === xoff)) {
                  this.paused = b === xoff;
                  this.flowSeen = true;
                }
              }
              const plain = usesSoftwareFlow(settings)
                ? value.filter((b) => b !== xon && b !== xoff)
                : value;
              if (plain.length) {
                const text = decoder.decode(plain, { stream: true });
                if (text) this.deliver(text);
              }
            }
          }
        } catch (e) {
          if (!this.closing) {
            this.cancelled = true;
            this.faulted = true;
            this.finishReception();
            this.onError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          reader.releaseLock();
        }
      })();
    }
  }
  async send(
    source: string,
    settings: SerialSettings,
    onProgress: (sent: number, total: number) => void,
  ) {
    if (this.sending) throw new Error("Trasmissione già in corso.");
    if (this.receiving)
      throw new Error("Termina la ricezione prima di inviare un programma.");
    if (this.faulted)
      throw new Error("Ricollega la porta seriale dopo l’errore.");
    if (!this.port?.writable)
      throw new Error("Collega prima una porta seriale.");
    const { packets, total, limited } = prepareTransmission(source, settings),
      options = transmitOptions(settings);
    let sent = 0;
    this.cancelled = false;
    this.sending = true;
    let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    try {
      await this.controlQueue;
      if (this.cancelled) throw new Error("Trasmissione interrotta.");
      writer = this.port.writable.getWriter();
      this.writer = writer;
      for (const packet of packets) {
        if (options.beforeLineDelay) await this.pause(options.beforeLineDelay);
        for (let start = 0; start < packet.length; start += 16) {
          const since = Date.now();
          while (
            (this.paused || (options.waitForXon && !this.flowSeen)) &&
            !this.cancelled
          ) {
            if (
              options.handshakeTimeout &&
              Date.now() - since > options.handshakeTimeout * 1000
            )
              throw new Error(
                `Timeout handshake: XON non ricevuto entro ${options.handshakeTimeout} secondi.`,
              );
            await new Promise((r) => setTimeout(r, 20));
          }
          if (this.cancelled) throw new Error("Trasmissione interrotta.");
          const chunk = packet.slice(start, start + 16);
          await writer.write(chunk);
          if (this.cancelled) throw new Error("Trasmissione interrotta.");
          sent += chunk.length;
          onProgress(sent, total);
        }
        if (settings.delay) await this.pause(settings.delay);
      }
      return { limited, total };
    } finally {
      this.sending = false;
      this.writer = null;
      writer?.releaseLock();
    }
  }
  async startReceiving(settings: SerialSettings) {
    const invalid = validateSerialOptions(settings);
    if (invalid) throw new Error(invalid);
    if (this.receiving) throw new Error("Ricezione già in corso.");
    if (this.sending)
      throw new Error("Attendi la fine della trasmissione prima di ricevere.");
    if (!this.reader || this.faulted)
      throw new Error(
        "Collega una porta seriale disponibile per la ricezione.",
      );
    this.receiveSettings = settings;
    this.filter = new ReceptionFilter(receiveOptions(settings));
    this.receiving = true;
    try {
      await this.receiveFlow(true, settings);
      const initial = controlText(receiveOptions(settings).initial);
      if (initial && this.receiving)
        await this.writeControl(new TextEncoder().encode(initial));
    } catch (error) {
      this.finishReception();
      throw error;
    }
  }
  async stopReceiving(settings: SerialSettings) {
    this.finishReception();
    await this.receiveFlow(false, settings);
  }
  private async receiveFlow(ready: boolean, settings: SerialSettings) {
    if (!usesSoftwareFlow(settings)) return;
    if (ready && !receiveOptions(settings).sendXon) return;
    const options = portOptions(settings);
    await this.writeControl(
      new TextEncoder().encode(controlText(ready ? options.xon : options.xoff)),
    );
  }
  private writeControl(bytes: Uint8Array) {
    const operation = this.controlQueue.then(async () => {
      if (!this.port?.writable)
        throw new Error("Porta non disponibile per il controllo XON/XOFF.");
      const writer = this.port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    });
    this.controlQueue = operation.catch(() => {});
    return operation;
  }
  private deliver(text: string) {
    this.onData(text);
    if (!this.receiving || !this.filter || !this.receiveSettings) return;
    clearTimeout(this.receiveTimer);
    const filtered = this.filter.push(text);
    if (filtered) this.reception?.onReceive(filtered);
    if (!this.receiving) return;
    if (this.filter.done) {
      this.endReception("trigger");
      return;
    }
    const timeout = receiveOptions(this.receiveSettings).timeout;
    if (timeout)
      this.receiveTimer = setTimeout(
        () => this.endReception("timeout"),
        timeout * 1000,
      );
  }
  private finishReception() {
    clearTimeout(this.receiveTimer);
    this.receiving = false;
    const tail = this.filter?.finish();
    this.filter = null;
    if (tail) this.reception?.onReceive(tail);
  }
  private endReception(reason: "trigger" | "timeout") {
    if (!this.receiving || !this.receiveSettings) return;
    const settings = this.receiveSettings;
    this.finishReception();
    void this.receiveFlow(false, settings)
      .then(() => {
        if (!this.faulted && !this.closing) this.reception?.onEnd(reason);
      })
      .catch((e) => this.onError(String(e)));
  }
  private async pause(ms: number) {
    const until = Date.now() + ms;
    while (Date.now() < until && !this.cancelled)
      await new Promise((r) => setTimeout(r, Math.min(20, until - Date.now())));
    if (this.cancelled) throw new Error("Trasmissione interrotta.");
  }
  stop() {
    this.cancelled = true;
    if (this.writer)
      void this.writer.abort("Trasmissione interrotta").catch(() => {});
  }
  async disconnect() {
    this.closing = true;
    this.finishReception();
    this.stop();
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {}
      await this.readTask;
      this.reader = null;
    }
    if (this.port) {
      await this.controlQueue;
      await this.port.close();
      this.port = null;
    }
    this.paused = false;
  }
}
