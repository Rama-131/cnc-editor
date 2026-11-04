const number = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const word = String.raw`[A-Z][ \t]*${number}`;
const numericBlock = new RegExp(`^(?:${word}[ \\t]*)+$`, "i");
export type GcodeWord = {
  letter: string;
  value: string;
  from: number;
  to: number;
  valueFrom: number;
};

/** Preserve source positions while excluding comments and nonnumeric syntax. */
export function* gcodeBlocks(source: string) {
  let offset = 0;
  let commentDepth = 0;
  let quote: string | null = null;
  for (const line of source.split(/(\r\n|\r|\n)/)) {
    if (/^[\r\n]+$/.test(line)) {
      offset += line.length;
      continue;
    }
    const visible = line.split("");
    let quoted = quote !== null;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (commentDepth) {
        if (char === "(") commentDepth++;
        if (char === ")") commentDepth--;
        visible[i] = " ";
      } else if (quote) {
        if (char === quote) {
          if (line[i + 1] === quote) i++;
          else quote = null;
        }
      } else if (char === '"' || char === "'") {
        quote = char;
        quoted = true;
      } else if (char === "(") {
        commentDepth++;
        visible[i] = " ";
      } else if (char === ";") {
        visible.fill(" ", i);
        break;
      }
    }
    const code = visible.join("");
    const block = code.trim().replace(/^\/[1-9]?\s*/, "");
    const numeric = !quoted && numericBlock.test(block);
    const words: GcodeWord[] = [];
    if (numeric) {
      for (const match of code.matchAll(
        new RegExp(`([A-Z])[ \\t]*(${number})`, "gi"),
      )) {
        const to = offset + match.index! + match[0].length;
        words.push({
          letter: match[1].toUpperCase(),
          value: match[2],
          from: offset + match.index!,
          to,
          valueFrom: to - match[2].length,
        });
      }
    }
    yield {
      from: offset,
      to: offset + line.length,
      code: block,
      numeric,
      words,
    };
    offset += line.length;
  }
}
