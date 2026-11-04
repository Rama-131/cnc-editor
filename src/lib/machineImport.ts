import {
  validMachine,
  type MachineProfile,
  type MachineProfiles,
} from "./machineProfiles";
import { defaultSerial, type SerialSettings } from "./serial";
export const MACHINE_IMPORT_KEY = "cnc.import.mch-machines-2026-11-05";

export function parseMch(source: string, fileName: string): MachineProfile {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of source.replace(/^\uFEFF/, "").split(/\r\n?|\n/)) {
    const section = line.trim().match(/^\[([^\]]+)\]$/);
    if (section) {
      const name = section[1].toUpperCase();
      current = sections.get(name) ?? new Map();
      sections.set(name, current);
      continue;
    }
    if (!current || /^\s*[#;]/.test(line)) continue;
    const entry = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
    if (entry) current.set(entry[1].trim().toUpperCase(), entry[2].trim());
  }
  const info = sections.get("INFO");
  const protocol = info?.get("PROTOCOL")?.toUpperCase();
  const active = sections.get("STANDARDSERIAL");
  if (protocol !== "STANDARDSERIAL" || !active)
    throw new Error(
      `${fileName}: configurazione STANDARDSERIAL mancante o protocollo non supportato.`,
    );
  const values = new Map([
    ...(sections.get("DEFAULT STANDARDSERIAL") ?? []),
    ...active,
  ]);
  const get = (key: string) => values.get(key) ?? "";
  const number = (key: string, fallback: number) => {
    const text = get(key);
    if (!text) return fallback;
    if (!/^\d+$/.test(text)) throw new Error(`${fileName}: ${key} non valido.`);
    return Number(text);
  };
  const bool = (key: string, fallback = false) => {
    const text = get(key).toUpperCase();
    if (!text) return fallback;
    if (["1", "YES", "TRUE"].includes(text)) return true;
    if (["0", "NO", "FALSE"].includes(text)) return false;
    throw new Error(`${fileName}: ${key} non valido.`);
  };
  const sequence = (value: string) =>
    /^\d{1,3}(,\s*\d{1,3})*$/.test(value)
      ? value
          .split(/,\s*/)
          .map((n) => `\\${Number(n)}`)
          .join("")
      : value;
  const crlf = sequence(get("TRAN_CRLF") || "013,010");
  const eol =
    crlf === "\\13\\10"
      ? "CRLF"
      : crlf === "\\10"
        ? "LF"
        : crlf === "\\13"
          ? "CR"
          : null;
  const receiveEol = get("RECV_CRLF").toUpperCase() || "AUTO";
  const removal = get("RECV_REMOVECHAR").toUpperCase();
  if (!["", "NONE", "ASCII0", "ASCII0TO31"].includes(removal))
    throw new Error(`${fileName}: filtro di ricezione non supportato.`);
  if (
    bool("USEPARITY") ||
    bool("TRAN_DOUBLELF") ||
    bool("TRAN_OMITEMPTY") ||
    bool("SMT_MODE") ||
    bool("RECV_TOCLIPBOARD")
  )
    throw new Error(
      `${fileName}: il file richiede opzioni avanzate non supportate dall’importatore.`,
    );
  const flows: Record<string, SerialSettings["flowControl"] | undefined> = {
    SOFTWARE: "software",
    HARDWARE: "hardware",
    BOTH: "both",
    NONE: "none",
  };
  const parities: Record<string, SerialSettings["parity"] | undefined> = {
    EVEN: "even",
    ODD: "odd",
    NONE: "none",
  };
  const flow = flows[get("FLOWCONTROL").toUpperCase()];
  const parity = parities[get("PARITY").toUpperCase()];
  if (!flow || !parity || !["AUTO", "CRLF", "LF", "CR"].includes(receiveEol))
    throw new Error(`${fileName}: flusso, parità o fine riga non supportati.`);
  const settings: SerialSettings = {
    ...defaultSerial,
    baudRate: number("BAUDRATE", 9600),
    dataBits: number("DATABITS", 7) as 7 | 8,
    stopBits: number("STOPBITS", 2) as 1 | 2,
    parity,
    flowControl: flow,
    lineEnding: eol ?? "CRLF",
    delay: 0,
    wrap: false,
    port: {
      dtr: bool("DTR_ENABLED"),
      rts: bool("RTS_ENABLED"),
      xon: sequence(get("XONCHAR") || "017"),
      xoff: sequence(get("XOFFCHAR") || "019"),
    },
    transmit: {
      startTrigger: get("TRAN_STARTTRIG"),
      endTrigger: get("TRAN_ENDTRIG"),
      beforeFile: sequence(get("TRAN_FEEDSTART")),
      afterFile: sequence(get("TRAN_FEEDEND")),
      ignoreLines: get("TRAN_OMMITLINES"),
      removeCharacters: sequence(get("TRAN_REMCHAR")),
      stopAfter: number("TRAN_BREAKCOUNT", 0),
      handshakeTimeout: number("TRAN_TIMEOUT", 0),
      beforeLineDelay: number("TRAN_DELAYLINES", 0),
      waitForXon: bool("TRAN_WAITFORXON"),
      removeNul: bool("TRAN_STRIP0"),
      removeSpaces: bool("TRAN_REMOVEWS"),
      tabsToSpaces: bool("TRAN_TABTOSPACE"),
      customLineEnding: eol === null,
      lineEndingSequence: crlf,
    },
    receive: {
      lineEnding:
        receiveEol === "AUTO" ? "auto" : (receiveEol as "CRLF" | "LF" | "CR"),
      startTrigger: get("RECV_STARTTRIG"),
      endTrigger: get("RECV_ENDTRIG"),
      discardLineCharacters: get("RECV_OMMITLINES"),
      omitLineString: get("RECV_OMMITSTRING"),
      removeCharacters: removal === "ASCII0" ? "\\0" : "",
      removeControls: removal === "ASCII0TO31",
      omitEmpty: bool("RECV_NOSAVEEMPTY"),
      timeout: number("RECV_TIMEOUT", 0),
      sendXon: bool("RECV_SENDXON"),
      initial: sequence(get("RECV_FEEDSTART")),
    },
  };
  // These seven files have no directory defaults. Don't claim that a Windows
  // path grants the browser filesystem permission, or silently ignore one.
  if ([...(sections.get("DIRECTORIES")?.values() ?? [])].some(Boolean))
    throw new Error(
      `${fileName}: configura cartelle ed estensioni nel browser dopo l’importazione.`,
    );
  const profile: MachineProfile = {
    id: `mch-${fileName
      .replace(/\.mch$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")}`,
    name: info?.get("DESCRIPTION") || fileName.replace(/\.mch$/i, ""),
    control: "Altro controllo ISO",
    settings,
    importedFrom: { fileName, port: get("COMPORT"), protocol },
  };
  if (!validMachine(profile))
    throw new Error(`${fileName}: i parametri importati non sono validi.`);
  return profile;
}

export function mergeImportedMachines(
  current: MachineProfiles,
  imported: MachineProfile[],
): MachineProfiles {
  const machines = [...current.machines];
  for (const profile of imported) {
    if (!validMachine(profile))
      throw new Error("Configurazione da importare non valida.");
    if (machines.some((m) => m.id === profile.id)) continue;
    let name = profile.name,
      suffix = 1;
    while (
      machines.some(
        (m) =>
          m.name.trim().toLocaleLowerCase("it") ===
          name.toLocaleLowerCase("it"),
      )
    )
      name = `${profile.name.slice(0, 60)} (importata${suffix++ === 1 ? "" : ` ${suffix - 1}`})`;
    machines.push({ ...profile, name });
  }
  return {
    ...current,
    machines,
    selectedId: machines.some((m) => m.id === current.selectedId)
      ? current.selectedId
      : (machines[0]?.id ?? null),
  };
}
