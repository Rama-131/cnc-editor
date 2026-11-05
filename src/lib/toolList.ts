import type { Machine } from "./codes";
import { gcodeBlocks } from "./gcodeWords";

export type ToolListEntry = {
  number: number;
  label: string;
  codes: string[];
  descriptions: string[];
  offsets: string[];
  firstLine: number;
  changes: number;
};
export type ToolList = {
  tools: ToolListEntry[];
  notes: { line: number; message: string }[];
};

function commentsIn(source: string) {
  const comments: { from: number; to: number; text: string }[] = [];
  let depth = 0,
    start = 0,
    quote = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (depth) {
      if (c === "(") depth++;
      if (c === ")" && --depth === 0)
        comments.push({
          from: start,
          to: i + 1,
          text: source
            .slice(start + 1, i)
            .replace(/\s+/g, " ")
            .trim(),
        });
    } else if (quote) {
      if (c === quote) {
        if (source[i + 1] === quote) i++;
        else quote = "";
      }
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") {
      start = i;
      depth = 1;
    } else if (c === ";") {
      let to = i + 1;
      while (to < source.length && source[to] !== "\r" && source[to] !== "\n")
        to++;
      comments.push({ from: i, to, text: source.slice(i + 1, to).trim() });
      i = to - 1;
    }
  }
  if (depth)
    comments.push({
      from: start,
      to: source.length,
      text: source
        .slice(start + 1)
        .replace(/\s+/g, " ")
        .trim(),
    });
  return comments.filter((c) => c.text);
}

/** Read numeric tool/offset words without evaluating expressions or quoted text. */
function toolWords(code: string, state: { quote: string; depth: number }) {
  const visible = code.split(""),
    expressions = code.split("");
  let quote = state.quote,
    depth = state.depth;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      visible[i] = expressions[i] = " ";
      if (c === quote) {
        if (code[i + 1] === quote) {
          i++;
          visible[i] = expressions[i] = " ";
        } else quote = "";
      }
    } else if (c === '"' || c === "'") {
      quote = c;
      visible[i] = expressions[i] = " ";
    } else if (c === "[") {
      if (depth) expressions[i] = " ";
      depth++;
      visible[i] = " ";
    } else if (depth) {
      if (c === "]") depth--;
      visible[i] = expressions[i] = " ";
    }
  }
  state.quote = quote;
  state.depth = depth;
  const text = visible.join("");
  const words = [
    ...text.matchAll(/([TMHG])[ \t]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/gi),
  ]
    .filter((m) => m.index === 0 || !/[A-Z_#]/i.test(text[m.index! - 1]))
    .map((m) => ({
      letter: m[1].toUpperCase(),
      raw: m[2],
      value: Number(m[2]),
    }));
  // Keep a separate indication of a tool address followed by an expression.
  return {
    words,
    dynamic: /(?:^|[^A-Z_])T\s*(?:#|\[)/i.test(expressions.join("")),
  };
}

export function createToolList(source: string, machine: Machine): ToolList {
  const result: ToolList = { tools: [], notes: [] },
    byNumber = new Map<number, ToolListEntry>();
  const comments = commentsIn(source);
  const wordState = { quote: "", depth: 0 };
  let commentIndex = 0,
    preceding: string[] = [],
    pending: ToolListEntry | null = null,
    active: ToolListEntry | null = null;
  let externalCallNoted = false;
  const append = (list: string[], value: string) => {
    if (value && !list.includes(value)) list.push(value);
  };
  let line = 0;
  for (const block of gcodeBlocks(source)) {
    line++;
    while (
      commentIndex < comments.length &&
      comments[commentIndex].to <= block.from
    )
      commentIndex++;
    const descriptions: string[] = [];
    for (
      let i = commentIndex;
      i < comments.length && comments[i].from < block.to;
      i++
    )
      append(descriptions, comments[i].text);
    if (!block.code.trim()) {
      if (descriptions.length) preceding = descriptions;
      continue;
    }
    const { words, dynamic } = toolWords(block.code, wordState);
    const mCodes = words.filter((w) => w.letter === "M").map((w) => w.value);
    if (dynamic) {
      pending = null;
      result.notes.push({
        line,
        message:
          "Richiamo utensile parametrico: verifica il valore T sul controllo.",
      });
    }
    const tools = words.filter((w) => w.letter === "T");
    for (const word of tools) {
      if (!Number.isSafeInteger(word.value) || word.value < 0) {
        pending = null;
        result.notes.push({
          line,
          message: `Richiamo T${word.raw} non riconosciuto.`,
        });
        continue;
      }
      if (word.value === 0) {
        pending = null;
        continue;
      }
      const digits = word.raw.replace(/^\+/, "");
      const latheOffset =
        machine === "lathe" && digits.length >= 3 && digits.length <= 4;
      const number = latheOffset ? Math.floor(word.value / 100) : word.value;
      if (number === 0) {
        pending = null;
        continue;
      }
      let entry = byNumber.get(number);
      if (!entry) {
        entry = {
          number,
          label: `T${number}`,
          codes: [],
          descriptions: [],
          offsets: [],
          firstLine: line,
          changes: 0,
        };
        byNumber.set(number, entry);
        result.tools.push(entry);
      }
      append(entry.codes, `T${digits}`);
      for (const description of descriptions.length ? descriptions : preceding)
        append(entry.descriptions, description);
      pending = entry;
      if (machine === "lathe") {
        active = entry;
        entry.changes++;
        if (latheOffset)
          append(
            entry.offsets,
            `Offset ${String(word.value % 100).padStart(2, "0")}`,
          );
        else if (digits.length > 4)
          result.notes.push({
            line,
            message: `${entry.label}: formato T oltre quattro cifre, numero e correttore da verificare sul controllo.`,
          });
      }
    }
    if (dynamic) pending = null;
    if (machine === "mill" && mCodes.includes(6)) {
      active = pending;
      if (active) {
        active.changes++;
        for (const description of descriptions)
          append(active.descriptions, description);
      } else if (!dynamic)
        result.notes.push({
          line,
          message: "Cambio M6 senza un utensile T numerico identificabile.",
        });
    }
    if (
      machine === "mill" &&
      active &&
      !mCodes.some((m) => m === 98 || m === 99)
    ) {
      for (const h of words.filter(
        (w) =>
          w.letter === "H" && Number.isSafeInteger(w.value) && w.value >= 0,
      ))
        append(active.offsets, `H${h.value}`);
    }
    if (!externalCallNoted && mCodes.includes(98)) {
      result.notes.push({
        line,
        message:
          "Elenco ricavato dal file aperto: verifica separatamente gli eventuali utensili dei sottoprogrammi M98.",
      });
      externalCallNoted = true;
    }
    preceding = [];
  }
  return result;
}

export function toolListText(list: ToolList, filename: string) {
  const rows = [
    `LISTA UTENSILI · ${filename}`,
    "",
    "Utensile\tDescrizione\tCorrettori\tStato\tPrima riga\tCodici T",
  ];
  for (const tool of list.tools)
    rows.push(
      [
        tool.label,
        tool.descriptions.join(" / ") || "—",
        tool.offsets.join(", ") || "—",
        tool.changes ? `${tool.changes} richiami` : "Solo preselezione",
        String(tool.firstLine),
        tool.codes.join(", "),
      ].join("\t"),
    );
  if (!list.tools.length) rows.push("Nessun utensile numerico rilevato.");
  if (list.notes.length)
    rows.push("", ...list.notes.map((n) => `Riga ${n.line}: ${n.message}`));
  return rows.join("\r\n") + "\r\n";
}
