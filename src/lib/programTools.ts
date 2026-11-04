import type { Machine } from "./codes";
import { gcodeBlocks } from "./gcodeWords";

export type AdjustmentWord = "F" | "S";
export type TextRange = { from: number; to: number };
export function adjustmentValue(input: string, word: AdjustmentWord) {
  const normalized = input.trim().replace(",", ".");
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || (word === "F" ? value <= 0 : value < 0))
    return null;
  // Keep ordinary decimal notation; CNC blocks must not receive an exponent.
  return normalized.replace(/^\+/, "").replace(/^\./, "0.");
}
export function adjustmentChanges(
  source: string,
  word: AdjustmentWord,
  value: string,
  range?: TextRange,
) {
  const changes: { from: number; to: number; insert: string }[] = [];
  const normalized = adjustmentValue(value, word);
  if (normalized === null) return { changes, skipped: 0, matching: 0 };
  let rpm: boolean | null = true;
  let skipped = 0,
    matching = 0;
  for (const block of gcodeBlocks(source)) {
    if (!block.numeric && block.code && block.code !== "%") rpm = null;
    const codes = block.words
      .filter((w) => w.letter === "G")
      .map((w) => Number(w.value));
    for (const code of codes) {
      if (code === 96) rpm = false;
      if (code === 97) rpm = true;
    }
    for (const token of block.words) {
      if (
        token.letter !== word ||
        (range && (token.from < range.from || token.to > range.to))
      )
        continue;
      if (
        word === "S" &&
        (rpm !== true ||
          codes.includes(50) ||
          codes.includes(92) ||
          codes.includes(10))
      ) {
        skipped++;
        continue;
      }
      matching++;
      if (Number(token.value) !== Number(normalized))
        changes.push({
          from: token.valueFrom,
          to: token.to,
          insert: normalized,
        });
    }
  }
  return { changes, skipped, matching };
}

/** Tool preselection alone is not a milling tool change. */
export function toolChangePositions(source: string, machine: Machine) {
  const positions: number[] = [];
  for (const block of gcodeBlocks(source)) {
    const tool = block.words.find(
      (w) =>
        w.letter === "T" &&
        Number.isInteger(Number(w.value)) &&
        Number(w.value) > 0,
    );
    const change = block.words.find(
      (w) => w.letter === "M" && Number(w.value) === 6,
    );
    if ((machine === "lathe" && tool) || change)
      positions.push((tool ?? change)!.from);
  }
  return positions;
}
export function adjacentToolChange(
  positions: number[],
  cursor: number,
  direction: -1 | 1,
) {
  if (!positions.length) return null;
  return direction === 1
    ? (positions.find((p) => p > cursor) ?? positions[0])
    : ([...positions].reverse().find((p) => p < cursor) ?? positions.at(-1)!);
}
