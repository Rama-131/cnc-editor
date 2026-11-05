export type ColorMode = "blocks" | "tokens";
export type PaletteColor =
  | "g"
  | "m"
  | "axis"
  | "value"
  | "comment"
  | "tool"
  | "motion"
  | "auxiliary"
  | "lineNumber";
export type Palette = Record<PaletteColor, string> & { mode: ColorMode };

export const defaultPalette: Palette = {
  mode: "blocks",
  motion: "#f3f58f",
  auxiliary: "#f2f4f4",
  lineNumber: "#29d6ef",
  comment: "#80ff37",
  g: "#4fa9ff",
  m: "#ff6be8",
  axis: "#42e8ff",
  value: "#ffe55b",
  tool: "#ff9e45",
};
const historicalDefaults = {
  g: ["#70b7ff", "#4fa9ff"],
  m: ["#c99aff", "#ff6be8"],
  axis: ["#64dcb6", "#42e8ff"],
  value: ["#f3c978", "#ffe55b"],
  comment: ["#798593", "#7dff6a"],
  tool: ["#f0a57d", "#ff9e45"],
};
export function readPalette(storage?: Pick<Storage, "getItem">): Palette {
  try {
    const saved = JSON.parse(
      (storage ?? localStorage).getItem("cnc.palette") ?? "null",
    );
    const oldKeys = Object.keys(
      historicalDefaults,
    ) as (keyof typeof historicalDefaults)[];
    if (!saved || !oldKeys.every((key) => /^#[a-f\d]{6}$/i.test(saved[key])))
      return { ...defaultPalette };
    const customized = oldKeys.some(
      (key) => !historicalDefaults[key].includes(saved[key].toLowerCase()),
    );
    const restored: Palette = {
      ...defaultPalette,
      mode:
        saved.mode === "blocks" || saved.mode === "tokens"
          ? saved.mode
          : customized
            ? "tokens"
            : "blocks",
    };
    for (const key of Object.keys(defaultPalette) as (keyof Palette)[]) {
      if (key === "mode" || !/^#[a-f\d]{6}$/i.test(saved[key])) continue;
      restored[key] = saved[key];
    }
    for (const key of oldKeys) {
      if (historicalDefaults[key].includes(restored[key].toLowerCase()))
        restored[key] = defaultPalette[key];
    }
    return restored;
  } catch {
    return { ...defaultPalette };
  }
}

/** Visual classification only: ignore comments when identifying movement words. */
export function movementBlock(line: string, initialCommentDepth = 0): boolean {
  let depth = initialCommentDepth,
    quote = "",
    code = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (depth) {
      if (c === "(") depth++;
      if (c === ")") depth--;
      code += " ";
    } else if (quote) {
      if (c === quote) {
        if (line[i + 1] === quote) i++;
        else quote = "";
      }
      code += " ";
    } else if (c === "(") {
      depth++;
      code += " ";
    } else if (c === ";") break;
    else if (c === '"' || c === "'") {
      quote = c;
      code += " ";
    } else code += c;
  }
  if (/[XYZUVW]\s*(?:[+-]?(?:\d|\.)|#|\[)/i.test(code)) return true;
  for (const match of code.matchAll(/G\s*(\d+(?:\.\d+)?)/gi)) {
    const g = Number(match[1]);
    if (
      [0, 1, 2, 3, 28, 30, 31, 32, 33].includes(g) ||
      (g >= 70 && g <= 79) ||
      (g >= 81 && g <= 89)
    )
      return true;
  }
  return false;
}
