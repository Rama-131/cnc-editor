import { describe, it, expect, vi } from "vitest";
import {
  defaultSerial,
  encodeProgram,
  SerialConnection,
  type CncPort,
} from "../src/lib/serial";
function mockPort() {
  const writes: Uint8Array[] = [];
  let input!: ReadableStreamDefaultController<Uint8Array>;
  const port: CncPort = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    readable: new ReadableStream({
      start(c) {
        input = c;
      },
    }),
    writable: new WritableStream({
      write(v) {
        writes.push(v);
      },
    }),
  };
  return { port, writes, input };
}
const decode = (v: Uint8Array[]) =>
  new TextDecoder().decode(new Uint8Array(v.flatMap((p) => [...p])));
describe("trasmissione seriale", () => {
  it("normalizza fine riga e delimitatori senza duplicarli", () => {
    const s = { ...defaultSerial, delay: 0 };
    expect(decode(encodeProgram("%\nO1\nM30\n%\n", s))).toBe(
      "%\r\nO1\r\nM30\r\n%\r\n",
    );
    expect(
      decode(encodeProgram("O1\rM30", { ...s, lineEnding: "CR", wrap: false })),
    ).toBe("O1\rM30\r");
  });
  it("rifiuta programmi vuoti e caratteri fuori ASCII", () => {
    expect(() => encodeProgram("%\n%", defaultSerial)).toThrow("vuoto");
    expect(() => encodeProgram("(caffè)", defaultSerial)).toThrow("ASCII");
  });
  it("apre con le impostazioni richieste e scrive byte reali nello stream", async () => {
    const m = mockPort();
    const c = new SerialConnection(
      () => {},
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    expect(m.port.open).toHaveBeenCalledWith(
      expect.objectContaining({
        baudRate: 9600,
        dataBits: 7,
        stopBits: 2,
        parity: "even",
        flowControl: "none",
      }),
    );
    let done = 0;
    await c.send("O1\nM30", { ...defaultSerial, delay: 0 }, (sent, total) => {
      if (sent === total) done++;
    });
    expect(decode(m.writes)).toBe("%\r\nO1\r\nM30\r\n%\r\n");
    expect(done).toBe(1);
    await c.disconnect();
    expect(m.port.close).toHaveBeenCalled();
  });
  it("sospende a XOFF, riprende a XON e riceve il programma", async () => {
    const m = mockPort();
    let received = "";
    const c = new SerialConnection(
      (t) => (received += t),
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    m.input.enqueue(new Uint8Array([19]));
    await new Promise((r) => setTimeout(r, 0));
    const job = c.send("O1", { ...defaultSerial, delay: 0 }, () => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(m.writes).toHaveLength(0);
    m.input.enqueue(new Uint8Array([17, 79, 75]));
    await job;
    expect(received).toBe("OK");
    expect(decode(m.writes)).toContain("O1");
    await c.disconnect();
  });
  it("interrompe un invio sospeso", async () => {
    const m = mockPort();
    const c = new SerialConnection(
      () => {},
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    m.input.enqueue(new Uint8Array([19]));
    await new Promise((r) => setTimeout(r, 0));
    const job = c.send("O1", { ...defaultSerial, delay: 0 }, () => {});
    c.stop();
    await expect(job).rejects.toThrow("interrotta");
    expect(m.writes).toHaveLength(0);
    await c.disconnect();
  });
  it("invia XON all’avvio della ricezione e XOFF alla fine senza trasmettere programmi", async () => {
    const m = mockPort();
    const c = new SerialConnection(
      () => {},
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    await c.startReceiving(defaultSerial);
    expect(m.writes.map((bytes) => [...bytes])).toEqual([[17]]);
    await expect(c.send("O1", defaultSerial, () => {})).rejects.toThrow(
      "Termina la ricezione",
    );
    await c.stopReceiving(defaultSerial);
    expect(m.writes.map((bytes) => [...bytes])).toEqual([[17], [19]]);
    await c.disconnect();
  });
  it("non invia caratteri di controllo con il flusso hardware", async () => {
    const m = mockPort();
    const c = new SerialConnection(
      () => {},
      () => {},
    );
    const settings = { ...defaultSerial, flowControl: "hardware" as const };
    await c.connect({ requestPort: async () => m.port }, settings);
    await c.startReceiving(settings);
    await c.stopReceiving(settings);
    expect(m.writes).toHaveLength(0);
    await c.disconnect();
  });
  it("può riprovare l’invio dopo che un’altra scrittura ha liberato la porta", async () => {
    const m = mockPort();
    const c = new SerialConnection(
      () => {},
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    const lock = m.port.writable!.getWriter();
    await expect(
      c.send("O1", { ...defaultSerial, delay: 0 }, () => {}),
    ).rejects.toThrow();
    lock.releaseLock();
    await c.send("O1", { ...defaultSerial, delay: 0 }, () => {});
    expect(decode(m.writes)).toBe("%\r\nO1\r\n%\r\n");
    await c.disconnect();
  });
  it("decodifica correttamente caratteri suddivisi fra letture successive e filtra XON/XOFF", async () => {
    const m = mockPort();
    let text = "";
    const c = new SerialConnection(
      (chunk) => (text += chunk),
      () => {},
    );
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    await c.startReceiving(defaultSerial);
    m.input.enqueue(new Uint8Array([17, 40, 99, 97, 102, 102, 195]));
    m.input.enqueue(new Uint8Array([168, 41, 13]));
    m.input.enqueue(new Uint8Array([10, 19]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(text).toBe("(caffè)\r\n");
    await c.stopReceiving(defaultSerial);
    await c.disconnect();
  });
  it("conserva i dati già letti dopo un errore e richiede di ricollegare la porta", async () => {
    const m = mockPort();
    let text = "";
    const onError = vi.fn();
    const c = new SerialConnection((chunk) => (text += chunk), onError);
    await c.connect({ requestPort: async () => m.port }, defaultSerial);
    await c.startReceiving(defaultSerial);
    m.input.enqueue(new TextEncoder().encode("%\r\nO1234\r\n"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    m.input.error(new Error("Errore di parità"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(text).toBe("%\r\nO1234\r\n");
    expect(onError).toHaveBeenCalledWith("Errore di parità");
    await expect(c.startReceiving(defaultSerial)).rejects.toThrow(
      "Collega una porta",
    );
    await c.disconnect();
  });
});
