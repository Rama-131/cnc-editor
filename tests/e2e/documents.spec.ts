import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const a = "G21 G90\nG0 X5 Y5\nG1 X20 Y10 F100\nM30";
const b = "G21 G18\nG0 X40 Z5\nG1 Z-20 F.2\nM30";
const editorName = "Editor programma G-code";
async function openPair(page: Page) {
  await page.locator("input[type=file]").setInputFiles([
    { name: "piastra.nc", mimeType: "text/plain", buffer: Buffer.from(a) },
    { name: "albero.nc", mimeType: "text/plain", buffer: Buffer.from(b) },
  ]);
  await expect(
    page.getByRole("tab", { name: "albero.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
}

test("trasmette il programma della scheda selezionata e disabilita l’invio quando tutti i file sono chiusi", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const bytes: number[] = [];
    (
      window as unknown as { documentSerialBytes: number[] }
    ).documentSerialBytes = bytes;
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          return {
            async open() {},
            async close() {},
            readable: new ReadableStream<Uint8Array>(),
            writable: new WritableStream<Uint8Array>({
              write(chunk) {
                bytes.push(...chunk);
              },
            }),
          };
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("Macchina di prova");
  await page.getByLabel("Controllo di flusso").selectOption("hardware");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Scrittura / Simulazione", exact: true })
    .click();
  await openPair(page);
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await page
    .getByRole("button", { name: "Seleziona e collega porta", exact: true })
    .click();
  const sent = () =>
    page.evaluate(
      () =>
        (window as unknown as { documentSerialBytes: number[] })
          .documentSerialBytes,
    );
  await page
    .getByRole("button", { name: "Invia programma alla macchina", exact: true })
    .click();
  await expect(
    page.getByText(
      "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
      { exact: true },
    ),
  ).toBeVisible();
  const first = await sent();
  expect(new TextDecoder().decode(new Uint8Array(first))).toContain(
    "G0 X40 Z5",
  );
  expect(new TextDecoder().decode(new Uint8Array(first))).not.toContain(
    "X5 Y5",
  );
  await page.getByRole("tab", { name: "piastra.nc", exact: true }).click();
  await page
    .getByRole("button", { name: "Invia programma alla macchina", exact: true })
    .click();
  await expect(
    page.getByText(
      "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
      { exact: true },
    ),
  ).toBeVisible();
  const second = new TextDecoder().decode(
    new Uint8Array((await sent()).slice(first.length)),
  );
  expect(second).toContain("G0 X5 Y5");
  expect(second).not.toContain("X40 Z5");
  for (const name of ["albero.nc", "piastra.nc", "O1001_piastra.nc"])
    await page
      .getByRole("button", { name: `Chiudi ${name}`, exact: true })
      .click();
  await expect(
    page.getByRole("button", {
      name: "Invia programma alla macchina",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Disconnetti porta", exact: true })
    .click();
});
const draft = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("cnc.draft")!).source);

test("apre più file e conserva modifiche, cursore, cronologia e tipo macchina separati", async ({
  page,
}) => {
  await page.goto("/");
  await openPair(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.getByLabel("Modalità asse X tornio").selectOption("radius");
  const editor = page.getByRole("textbox", { name: editorName });
  await editor.fill(b + "\n(COMMENTO ALBERO)");
  await editor.press("Control+End");
  const cursor = await page
    .locator(".editor-column .editor-status span")
    .first()
    .innerText();
  await page.getByRole("tab", { name: "piastra.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe(a);
  await expect(page.getByLabel("Tipo macchina")).toHaveValue("mill");
  await expect(
    page.getByRole("button", { name: "Annulla modifica", exact: true }),
  ).toBeDisabled();
  await editor.fill(a + "\n(COMMENTO PIASTRA)");
  await page.getByRole("tab", { name: "albero.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe(b + "\n(COMMENTO ALBERO)");
  await expect(page.getByLabel("Tipo macchina")).toHaveValue("lathe");
  await expect(page.getByLabel("Modalità asse X tornio")).toHaveValue("radius");
  await expect(
    page.locator(".editor-column .editor-status span").first(),
  ).toHaveText(cursor);
  await page
    .getByRole("button", { name: "Annulla modifica", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(b);
  await page
    .getByRole("button", { name: "Ripristina modifica", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(b + "\n(COMMENTO ALBERO)");
  await page.getByRole("tab", { name: "piastra.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe(a + "\n(COMMENTO PIASTRA)");
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("piastra.nc");
  expect(await readFile((await download.path())!, "utf8")).toBe(
    a + "\n(COMMENTO PIASTRA)",
  );
  await page
    .getByRole("button", { name: "Annulla modifica", exact: true })
    .click();
  await expect.poll(() => draft(page)).toBe(a);
});

test("la crocetta protegge le modifiche anche di una scheda inattiva e permette di chiudere tutti i file", async ({
  page,
}) => {
  await page.goto("/");
  await openPair(page);
  await page
    .getByRole("textbox", { name: editorName })
    .fill(b + "\n(MODIFICATO)");
  await page.getByRole("tab", { name: "piastra.nc", exact: true }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("albero.nc");
    return dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "Chiudi albero.nc", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "albero.nc", exact: true }),
  ).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Chiudi albero.nc", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "albero.nc", exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => draft(page)).toBe(a);
  await page
    .getByRole("button", { name: "Chiudi piastra.nc", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Chiudi O1001_piastra.nc", exact: true })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.getByText("Nessun programma aperto", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salva file", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(0);
  const newButton = page.getByRole("button", {
    name: "Nuovo programma",
    exact: true,
  });
  const emptyPosition = (await newButton.boundingBox())!.x;
  expect(
    emptyPosition - (await page.locator(".program-tabs-bar").boundingBox())!.x,
  ).toBeLessThan(12);
  await page
    .getByRole("button", { name: "Nuovo programma", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "nuovo_programma.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: editorName })).toBeVisible();
  const firstPosition = (await newButton.boundingBox())!.x;
  expect(firstPosition).toBeGreaterThan(emptyPosition + 100);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("nuovo_programma.txt");
  await page
    .getByRole("button", { name: "Salva con nome", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByLabel("Formato file")).toHaveValue(
    "txt",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Nuovo programma", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "nuovo_programma_2.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const secondPosition = (await newButton.boundingBox())!.x;
  expect(secondPosition).toBeGreaterThan(firstPosition + 100);
  const lastTab = (await page.locator(".program-tab").last().boundingBox())!;
  expect(secondPosition - lastTab.x - lastTab.width).toBeLessThan(12);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Chiudi nuovo_programma_2.txt", exact: true })
    .click();
  expect((await newButton.boundingBox())!.x).toBeLessThan(secondPosition - 100);
});

test("nasconde e riapre la simulazione a tutta larghezza e ripristina le schede dopo il ricaricamento", async ({
  page,
}) => {
  await page.goto("/");
  await openPair(page);
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.getByLabel("Avanzamento simulazione").fill("50");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "2",
  );
  await page.getByRole("tab", { name: "albero.nc", exact: true }).click();
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "2",
  );
  await page
    .getByRole("button", { name: "Avvia simulazione", exact: true })
    .click();
  const commonCommands = page
    .getByRole("toolbar", { name: "Comandi del programma" })
    .locator(".icon-group");
  const simulationToggle = commonCommands.getByRole("button", {
    name: "Nascondi simulazione",
    exact: true,
  });
  const simulationBox = await simulationToggle.boundingBox();
  const colorsBox = await commonCommands
    .getByRole("button", { name: "Personalizza colori", exact: true })
    .boundingBox();
  expect(simulationBox!.y).toBe(colorsBox!.y);
  expect(simulationBox!.x - (colorsBox!.x + colorsBox!.width)).toBeLessThan(10);
  await simulationToggle.click();
  await expect(page.locator(".preview-column")).toBeHidden();
  await expect(page.locator(".play-button")).toHaveAttribute(
    "aria-label",
    "Avvia simulazione",
  );
  const box = await page.locator(".editor-column").boundingBox();
  expect(box!.x + box!.width).toBe(1480);
  const source = b + "\n(BOZZA DA CONSERVARE)";
  await page.getByRole("textbox", { name: editorName }).fill(source);
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(
    page.getByRole("tab", { name: "albero.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => draft(page)).toBe(source);
  await expect(page.getByLabel("Tipo macchina")).toHaveValue("lathe");
  await expect(page.locator(".preview-column")).toBeHidden();
  await page
    .getByRole("button", { name: "Mostra simulazione", exact: true })
    .click();
  await expect(page.locator(".preview-column")).toBeVisible();
  await expect(page.locator(".viewport-label")).toContainText("PIANO XZ");
  await page.getByRole("tab", { name: "piastra.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe(a);
  await page.getByRole("tab", { name: "albero.nc", exact: true }).click();
  await expect.poll(() => draft(page)).toBe(source);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Chiudi albero.nc", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "albero.nc", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({ path: "/tmp/cnc-program-tabs.png" });
});

test("le schede scorrono senza allargare la pagina sui piccoli schermi e si navigano con la tastiera", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(
    Array.from({ length: 5 }, (_, i) => ({
      name: `programma-lungo-numero-${i}.nc`,
      mimeType: "text/plain",
      buffer: Buffer.from(`G1X${i}\nM30`),
    })),
  );
  const selected = page.getByRole("tab", {
    name: "programma-lungo-numero-4.nc",
    exact: true,
  });
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "Nuovo programma", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", {
      name: "Chiudi programma-lungo-numero-4.nc",
      exact: true,
    }),
  ).toBeInViewport();
  await selected.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "programma-lungo-numero-3.nc", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Nascondi simulazione", exact: true })
    .click();
  await expect(page.locator(".preview-column")).toBeHidden();
  const box = await page.locator(".editor-column").boundingBox();
  expect(box!.x + box!.width).toBe(390);
});
