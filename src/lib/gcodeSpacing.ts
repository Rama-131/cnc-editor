const word = String.raw`[A-Z][ \t]*[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const numericBlock = new RegExp(`^(?:${word}[ \\t]*)+$`, "i");

/** Insert spaces only in numeric ISO blocks; leave other syntax untouched. */
export function gcodeSpacingChanges(source: string) {
  const changes: { from: number; insert: string }[] = [];
  let offset = 0;
  let commentDepth = 0;
  let quote: string | null = null;

  for (const line of source.split(/(\r\n|\r|\n)/)) {
    if (/^[\r\n]+$/.test(line)) {
      offset += line.length;
      continue;
    }
    // Keep offsets while hiding comments, including nested/multiline comments.
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
    // Macros, strings, checksums and unrecognised blocks need their own syntax.
    const block = code.trim().replace(/^\/[1-9]?\s*/, "");
    if (!quoted && numericBlock.test(block)) {
      let previousEnd = -1;
      for (const match of code.matchAll(new RegExp(word, "gi"))) {
        if (match.index === previousEnd)
          changes.push({ from: offset + match.index, insert: " " });
        previousEnd = match.index + match[0].length;
      }
    }
    offset += line.length;
  }
  return changes;
}
