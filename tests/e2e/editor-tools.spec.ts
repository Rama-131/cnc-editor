import { expect, test, type Page } from "@playwright/test";

const editorName = "Editor programma G-code";
const source =
  "%\nO1234\nG21G18G40\nT0101\nG97S600M3\nG1X20Z0F0.2\nZ-10F0.3\nG92S1200\nG96S150\nG97S900\nM30\n%";
async function draft(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("cnc.draft")!).source as string,
  );
}
async function open(page: Page, text: string) {
  await page.goto("/");
  await page.getByLabel("Tipo macchina", { exact: true }).selectOption("lathe");
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "lavorazione.nc",
      mimeType: "text/plain",
      buffer: Buffer.from(text),
    },
    {
      name: "altro.nc",
      mimeType: "text/plain",
      buffer: Buffer.from("G97 S3000\nG1 X10 F500\nM30"),
    },
  ]);
  await page.getByRole("tab", { name: "lavorazione.nc", exact: true }).click();
}

test("imposta valori precisi F e S, rispetta la selezione e annulla senza modificare le altre schede", async ({
  page,
}) => {
  await open(page, source);
  const editor = page.getByRole("textbox", { name: editorName });
  await page
    .getByRole("button", { name: "Aggiusta avanzamento", exact: true })
    .click();
  await page.getByLabel("Nuovo valore F", { exact: true }).fill("0,25");
  await expect(page.locator(".adjustment-preview")).toContainText(
    "2 valori saranno modificati",
  );
  await page.screenshot({ path: "/tmp/cnc-adjust-feed.png", fullPage: true });
  await page.getByRole("button", { name: "Applica", exact: true }).click();
  const feeds = source
    .replace("F0.2\n", "F0.25\n")
    .replace("F0.3\n", "F0.25\n");
  await expect.poll(() => draft(page)).toBe(feeds);
  await editor.press("Control+z");
  await expect.poll(() => draft(page)).toBe(source);
  await editor.press("Control+y");
  await expect.poll(() => draft(page)).toBe(feeds);
  await page
    .getByRole("button", { name: "Aggiusta giri mandrino", exact: true })
    .click();
  await page.getByLabel("Nuovo valore S", { exact: true }).fill("-100");
  await expect(
    page.getByRole("button", { name: "Applica", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Nuovo valore S", { exact: true }).fill("1200");
  await expect(page.locator(".adjustment-preview")).toContainText(
    "2 valori saranno modificati",
  );
  await page.getByRole("button", { name: "Applica", exact: true }).click();
  const spindle = feeds
    .replace("G97S600", "G97S1200")
    .replace("G97S900", "G97S1200");
  await expect.poll(() => draft(page)).toBe(spindle);
  await editor.press("Control+Home");
  for (let n = 0; n < 6; n++) await editor.press("ArrowDown");
  await editor.press("Home");
  await editor.press("Shift+End");
  await page
    .getByRole("button", { name: "Aggiusta avanzamento", exact: true })
    .click();
  await expect(page.getByLabel("Dove applicare la modifica")).toHaveValue(
    "selection",
  );
  await page.getByLabel("Nuovo valore F", { exact: true }).fill("0.4");
  await expect(page.locator(".adjustment-preview")).toContainText(
    "1 valore sarà modificato",
  );
  await page.getByRole("button", { name: "Applica", exact: true }).click();
  const selected = spindle.replace("Z-10F0.25", "Z-10F0.4");
  await expect.poll(() => draft(page)).toBe(selected);
  await page.getByRole("tab", { name: "altro.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe("G97 S3000\nG1 X10 F500\nM30");
  await page.getByRole("tab", { name: "lavorazione.nc", exact: true }).click();
  await page
    .getByRole("button", { name: "Annulla modifica", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(spindle);
  await page
    .getByRole("button", { name: "Aggiusta avanzamento", exact: true })
    .click();
  await page.getByLabel("Nuovo valore F", { exact: true }).fill("0.7");
  await page.getByRole("tab", { name: "altro.nc", exact: true }).click();
  await expect(page.locator(".program-adjustment")).toHaveCount(0);
  await expect.poll(() => draft(page)).toBe("G97 S3000\nG1 X10 F500\nM30");
});

test("trova avanti e indietro, sostituisce nel file attivo e conserva ricerca e annulla per scheda", async ({
  page,
}) => {
  const text = "G1X10\nG1X20\n(G1 da leggere)\nG1X30\nM30";
  await open(page, text);
  const editor = page.getByRole("textbox", { name: editorName });
  const cursor = page.locator(".editor-column .editor-status > span").first();
  await editor.press("Control+Home");
  await page.getByRole("button", { name: "Trova", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Trova testo", exact: true })
    .fill("G1");
  await page
    .getByRole("textbox", { name: "Trova testo", exact: true })
    .press("End");
  await page
    .getByRole("button", { name: "Trova prossimo", exact: true })
    .click();
  await expect(cursor).toHaveText("Ln 1, Col 3");
  await page
    .getByRole("button", { name: "Trova prossimo", exact: true })
    .click();
  await expect(cursor).toHaveText("Ln 2, Col 3");
  await page
    .getByRole("button", { name: "Trova precedente", exact: true })
    .click();
  await expect(cursor).toHaveText("Ln 1, Col 3");
  await page
    .getByRole("button", { name: "Trova precedente", exact: true })
    .click();
  await expect(cursor).toHaveText("Ln 4, Col 3");
  await editor.press("F3");
  await expect(cursor).toHaveText("Ln 1, Col 3");
  await editor.press("Shift+F3");
  await expect(cursor).toHaveText("Ln 4, Col 3");
  await editor.press("F3");
  await page
    .getByRole("button", { name: "Sostituisci", exact: true })
    .first()
    .click();
  const replacement = page.getByRole("textbox", {
    name: "Sostituisci con",
    exact: true,
  });
  await expect(replacement).toBeFocused();
  await replacement.fill("G0");
  await replacement.press("End");
  await page
    .locator(".cm-search")
    .getByRole("button", { name: "Sostituisci", exact: true })
    .click();
  const first = text.replace("G1X10", "G0X10");
  await expect.poll(() => draft(page)).toBe(first);
  await page
    .locator(".cm-search")
    .getByRole("button", { name: "Sostituisci tutto", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(text.replaceAll("G1", "G0"));
  await page
    .getByRole("button", { name: "Annulla modifica", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(first);
  await page.getByRole("tab", { name: "altro.nc", exact: true }).click();
  await expect(page.locator(".cm-search")).toHaveCount(0);
  await expect.poll(() => draft(page)).toBe("G97 S3000\nG1 X10 F500\nM30");
  await page.getByRole("tab", { name: "lavorazione.nc", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Trova testo", exact: true }),
  ).toHaveValue("G1");
  await page.screenshot({ path: "/tmp/cnc-editor-search.png", fullPage: true });
  await page
    .getByRole("button", { name: "Chiudi ricerca", exact: true })
    .click();
  await editor.press("Control+h");
  await expect(replacement).toBeFocused();
  await replacement.press("Escape");
  await expect(page.locator(".cm-search")).toHaveCount(0);
});

test("naviga i cambi utensile di tornio e fresatrice e mantiene la barra compatta su schermi piccoli", async ({
  page,
}) => {
  const text = "%\nO1\n(T9999)\nN10T0101\nG1X1\n;T0303\nN20T0202\nT0000\nM30";
  await open(page, text);
  const editor = page.getByRole("textbox", { name: editorName });
  const cursor = page.locator(".editor-column .editor-status > span").first();
  const next = page.getByRole("button", {
    name: "Prossimo cambio utensile",
    exact: true,
  });
  const previous = page.getByRole("button", {
    name: "Cambio utensile precedente",
    exact: true,
  });
  await editor.press("Control+Home");
  await next.click();
  await expect(cursor).toHaveText("Ln 4, Col 4");
  await next.click();
  await expect(cursor).toHaveText("Ln 7, Col 4");
  await next.click();
  await expect(cursor).toHaveText("Ln 4, Col 4");
  await previous.click();
  await expect(cursor).toHaveText("Ln 7, Col 4");
  await expect.poll(() => draft(page)).toBe(text);
  await page.getByLabel("Tipo macchina", { exact: true }).selectOption("mill");
  await editor.fill("O2\nT1\nG0X1\nM06\nT2\nT3 M6\n(M6)\nM30");
  await editor.press("Control+Home");
  await next.click();
  await expect(cursor).toHaveText("Ln 4, Col 1");
  await next.click();
  await expect(cursor).toHaveText("Ln 6, Col 1");
  await previous.click();
  await expect(cursor).toHaveText("Ln 4, Col 1");
  await page.setViewportSize({ width: 390, height: 844 });
  await next.click();
  await expect(cursor).toHaveText("Ln 6, Col 1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Aggiusta avanzamento", exact: true })
    .click();
  await expect(
    page.getByLabel("Nuovo valore F", { exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "/tmp/cnc-editor-tools-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Nuovo valore F", { exact: true }).press("Escape");
  await editor.fill("G1 X2\nM30");
  await next.click();
  await expect(
    page.getByText(
      "Nessun cambio utensile riconosciuto nel programma attivo.",
      { exact: true },
    ),
  ).toBeVisible();
});
