import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { millSample } from "../../src/lib/samples";

async function mockSerial(page: Page) {
  await page.addInitScript(() => {
    const state = {
      bytes: [] as number[],
      opened: 0,
      closed: 0,
      autoProgram: "",
      input: null as ReadableStreamDefaultController<Uint8Array> | null,
      inject(text: string) {
        this.input!.enqueue(new TextEncoder().encode(text));
      },
      fail() {
        this.input!.error(new Error("Errore di parità seriale"));
      },
    };
    (window as unknown as { rxTest: typeof state }).rxTest = state;
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          return {
            async open() {
              state.opened++;
            },
            async close() {
              state.closed++;
            },
            readable: new ReadableStream<Uint8Array>({
              start(controller) {
                state.input = controller;
              },
            }),
            writable: new WritableStream<Uint8Array>({
              write(bytes) {
                state.bytes.push(...bytes);
                if (bytes.length === 1 && bytes[0] === 17 && state.autoProgram)
                  state.inject(state.autoProgram);
              },
            }),
          };
        },
      },
    });
  });
}
async function inject(page: Page, text: string) {
  await page.evaluate(
    (text) =>
      (
        window as unknown as { rxTest: { inject: (text: string) => void } }
      ).rxTest.inject(text),
    text,
  );
}
async function rawText(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("cnc.reception")!).text as string,
  );
}

test("riceve in un documento vuoto, conserva il programma originale e salva i dati senza modificarli", async ({
  page,
}) => {
  await mockSerial(page);
  await page.goto("/#ricezione");
  await expect(
    page.getByRole("heading", { name: "Dalla macchina al tuo file." }),
  ).toBeVisible();
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    "0",
  );
  await expect(
    page.getByRole("textbox", { name: "Programma ricevuto dalla macchina" }),
  ).toHaveAttribute("aria-readonly", "true");
  await expect(
    page.getByRole("button", { name: "Salva ricevuto", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Avvia ricezione", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".editor-column")).toBeHidden();
  await expect(page.locator(".preview-column")).toBeHidden();
  await page.screenshot({
    path: "/tmp/cnc-reception-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Seleziona e collega porta" }).click();
  await inject(page, "PRONTO\r\n");
  await expect(
    page.getByRole("button", { name: /Dati ricevuti/ }),
  ).toContainText("8 caratteri");
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    "0",
  );
  await page
    .getByRole("button", { name: "Avvia ricezione", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Termina ricezione", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Nuova ricezione", exact: true }),
  ).toBeDisabled();
  await inject(page, "%\r");
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    "2",
  );
  await inject(page, "\nO1234\r\nG1 X");
  await expect(
    page.locator(".received-document .cm-line").filter({ hasText: "O1234" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Invia programma alla macchina" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Nome file", { exact: true })).toHaveValue(
    "O1001_piastra.nc",
  );
  await inject(page, "10\r");
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  await inject(page, "\nM30\r\n%\r\n");
  const program = "%\r\nO1234\r\nG1 X10\r\nM30\r\n%\r\n";
  await expect.poll(() => rawText(page)).toBe(program);
  await expect(
    page.locator(".received-document .cm-line").filter({ hasText: "G1 X10" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("cnc.draft")!).source,
    ),
  ).toBe(millSample);
  expect(
    await page.evaluate(
      () => (window as unknown as { rxTest: { opened: number } }).rxTest.opened,
    ),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Termina ricezione", exact: true })
    .click();
  await expect(page.getByText(/Ricezione terminata/)).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { rxTest: { bytes: number[] } }).rxTest.bytes,
    ),
  ).toEqual([17, 19]);
  await inject(page, "DATI DOPO LA FINE");
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    String(program.length),
  );
  await page
    .getByLabel("Nome del file ricevuto", { exact: true })
    .fill("O1234_estratto.nc");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salva ricevuto", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("O1234_estratto.nc");
  expect(await readFile((await file.path())!, "utf8")).toBe(program);
  await expect(page.locator(".received-document .unsaved")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/cnc-reception-filled.png",
    fullPage: true,
  });
});

test("acquisisce subito dopo XON, conserva file oltre 200.000 caratteri e permette di recuperarli dopo un errore", async ({
  page,
}) => {
  await mockSerial(page);
  await page.goto("/#ricezione");
  const program = "%\r\nO9001\r\n" + "G1 X1\r\n".repeat(30000) + "M30\r\n%\r\n";
  await page.evaluate(
    (text) =>
      ((
        window as unknown as { rxTest: { autoProgram: string } }
      ).rxTest.autoProgram = text),
    program,
  );
  await page.getByRole("button", { name: "Seleziona e collega porta" }).click();
  await page
    .getByRole("button", { name: "Avvia ricezione", exact: true })
    .click();
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    String(program.length),
  );
  await expect.poll(() => rawText(page)).toBe(program);
  await page.evaluate(() =>
    (window as unknown as { rxTest: { fail: () => void } }).rxTest.fail(),
  );
  await expect(page.getByText("Errore porta", { exact: true })).toBeVisible();
  await expect(page.getByText(/Errore di parità seriale/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Riprendi ricezione", exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Salva ricevuto", exact: true })
    .click();
  const file = await download;
  expect(await readFile((await file.path())!, "utf8")).toBe(program);
});

test("protegge i dati non salvati, gestisce Ctrl+S e ripristina il documento ricevuto su schermo stretto", async ({
  page,
}) => {
  await mockSerial(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#ricezione");
  await page.getByRole("button", { name: "Seleziona e collega porta" }).click();
  await page
    .getByRole("button", { name: "Avvia ricezione", exact: true })
    .click();
  const program = "%\r\nO3210\r\nM30\r\n%\r\n";
  await inject(page, program);
  await expect.poll(() => rawText(page)).toBe(program);
  await page
    .getByRole("button", { name: "Termina ricezione", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Riprendi ricezione", exact: true }),
  ).toBeEnabled();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Nuova ricezione", exact: true })
    .click();
  expect(await rawText(page)).toBe(program);
  await page
    .getByLabel("Nome del file ricevuto", { exact: true })
    .fill("O3210.nc");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const file = await download;
  expect(file.suggestedFilename()).toBe("O3210.nc");
  expect(await readFile((await file.path())!, "utf8")).toBe(program);
  await page.reload();
  await expect(
    page.getByLabel("Nome del file ricevuto", { exact: true }),
  ).toHaveValue("O3210.nc");
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    String(program.length),
  );
  await expect(
    page.getByRole("button", { name: "Riprendi ricezione", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/cnc-reception-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Nuova ricezione", exact: true })
    .click();
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    "0",
  );
  await expect(
    page.getByRole("button", { name: "Salva ricevuto", exact: true }),
  ).toBeDisabled();
});
