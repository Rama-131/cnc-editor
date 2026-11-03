export type SerialSettings = {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  flowControl: "none" | "hardware" | "software";
  lineEnding: "CRLF" | "LF" | "CR";
  delay: number;
  wrap: boolean;
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
export interface CncPort {
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
export function encodeProgram(source: string, settings: SerialSettings) {
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(source))
    throw new Error(
      "La trasmissione richiede testo ASCII. Rimuovi caratteri accentati o simboli non ASCII, anche dai commenti.",
    );
  let lines = source.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (!lines.some((l) => l.trim() && l.trim() !== "%"))
    throw new Error("Il programma è vuoto.");
  if (settings.wrap) {
    if (lines[0]?.trim() !== "%") lines.unshift("%");
    if (lines[lines.length - 1]?.trim() !== "%") lines.push("%");
  }
  const eol = { CRLF: "\r\n", LF: "\n", CR: "\r" }[settings.lineEnding];
  return lines.map((l) => new TextEncoder().encode(l + eol));
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
  constructor(
    private onData: (text: string) => void,
    private onError: (error: string) => void,
  ) {}
  async connect(provider: SerialProvider, settings: SerialSettings) {
    const port = await provider.requestPort();
    await port.open({
      baudRate: settings.baudRate,
      dataBits: settings.dataBits,
      stopBits: settings.stopBits,
      parity: settings.parity,
      flowControl: settings.flowControl === "hardware" ? "hardware" : "none",
      bufferSize: 4096,
    });
    this.port = port;
    this.closing = false;
    this.paused = false;
    if (port.readable) {
      this.reader = port.readable.getReader();
      const reader = this.reader;
      this.readTask = (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              if (!this.closing) {
                this.cancelled = true;
                this.onError(
                  "Porta seriale scollegata. Disconnetti prima di ricollegare.",
                );
              }
              break;
            }
            if (value) {
              for (const b of value) {
                if (settings.flowControl === "software" && b === 19)
                  this.paused = true;
                if (settings.flowControl === "software" && b === 17)
                  this.paused = false;
              }
              const plain = value.filter((b) => b !== 17 && b !== 19);
              if (plain.length) this.onData(new TextDecoder().decode(plain));
            }
          }
        } catch (e) {
          if (!this.closing) {
            this.cancelled = true;
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
    if (!this.port?.writable)
      throw new Error("Collega prima una porta seriale.");
    const packets = encodeProgram(source, settings),
      total = packets.reduce((n, p) => n + p.length, 0);
    let sent = 0;
    this.cancelled = false;
    this.sending = true;
    const writer = this.port.writable.getWriter();
    this.writer = writer;
    try {
      for (const packet of packets) {
        for (let start = 0; start < packet.length; start += 16) {
          const since = Date.now();
          while (this.paused && !this.cancelled) {
            if (Date.now() - since > 30000)
              throw new Error(
                "Timeout XOFF: il controllo non ha inviato XON per 30 secondi.",
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
        if (settings.delay)
          await new Promise((r) => setTimeout(r, settings.delay));
      }
    } finally {
      this.sending = false;
      this.writer = null;
      writer.releaseLock();
    }
  }
  stop() {
    this.cancelled = true;
    if (this.writer)
      void this.writer.abort("Trasmissione interrotta").catch(() => {});
  }
  async disconnect() {
    this.closing = true;
    this.stop();
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {}
      await this.readTask;
      this.reader = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    this.paused = false;
  }
}
