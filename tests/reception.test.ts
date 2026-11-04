import { describe, expect, it } from "vitest";
import { appendReceivedText } from "../src/lib/reception";

describe("documento ricevuto", () => {
  it("conserva ordine, delimitatori e fine riga su frammenti separati", () => {
    let text = "";
    for (const chunk of ["%\r", "\nO1\r\nG1 X", "10\r", "\nM30\r\n%\r\n"]) {
      const result = appendReceivedText(text, chunk);
      expect(result.overflow).toBe(false);
      text = result.text;
    }
    expect(text).toBe("%\r\nO1\r\nG1 X10\r\nM30\r\n%\r\n");
  });
  it("al limite conserva il prefisso acquisito e segnala che il file è parziale", () => {
    expect(appendReceivedText("O1\n", "M30\n%", 7)).toEqual({
      text: "O1\nM30\n",
      overflow: true,
    });
    expect(appendReceivedText("O1\nM30\n", "ALTRI DATI", 7)).toEqual({
      text: "O1\nM30\n",
      overflow: true,
    });
  });
  it("non segnala overflow quando l’ultimo frammento riempie esattamente il limite", () => {
    expect(appendReceivedText("O1\n", "M30\n", 7)).toEqual({
      text: "O1\nM30\n",
      overflow: false,
    });
  });
});
