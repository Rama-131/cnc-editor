import { gcodeBlocks } from "./gcodeWords";

/** Insert spaces only in numeric ISO blocks; leave other syntax untouched. */
export function gcodeSpacingChanges(source: string) {
  const changes: { from: number; insert: string }[] = [];
  for (const block of gcodeBlocks(source)) {
    let previousEnd = -1;
    for (const word of block.words) {
      if (word.from === previousEnd)
        changes.push({ from: word.from, insert: " " });
      previousEnd = word.to;
    }
  }
  return changes;
}
