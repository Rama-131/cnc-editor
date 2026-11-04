import { test, expect } from "@playwright/test";
test("editor, descrizioni, colori, simulazione e file", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Simulazione" }),
  ).toBeVisible();
  await expect(page.getByText(/Anteprima geometrica/)).toBeVisible();
  await page.screenshot({
    path: "/tmp/cnc-studio-desktop.png",
    fullPage: true,
  });
  await page.locator(".cm-content").getByText("G21", { exact: true }).hover();
  await expect(
    page.getByText("G21 · Programmazione in millimetri"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await page.getByLabel("Colore Codici G").fill("#ff8844");
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem("cnc.palette")!).g),
    )
    .toBe("#ff8844");
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await page.getByRole("button", { name: "Esempi di programma" }).click();
  await page.getByRole("button", { name: "Profilo tornitura" }).click();
  await expect(page.getByLabel("Tipo macchina")).toHaveValue("lathe");
  await expect(page.getByLabel("Modalità asse X tornio")).toHaveValue(
    "diameter",
  );
  await expect(page.locator(".viewport-label")).toContainText("PIANO XZ");
  await expect(page.getByText(/Anteprima geometrica/)).toBeVisible();
  await page.getByLabel("Avanzamento simulazione").fill("0");
  await page.getByRole("button", { name: "Avvia simulazione" }).click();
  await expect(
    page.getByRole("button", { name: "Pausa simulazione" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pausa simulazione" }).click();
  await page.getByRole("button", { name: "Apri guida codici" }).click();
  await page.getByRole("textbox", { name: "Cerca codice" }).fill("G71");
  await expect(
    page.getByText("Sgrossatura longitudinale", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chiudi guida" }).click();
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill("G71 P10 Q20");
  await expect(page.getByText(/G71 non simulato/)).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page.locator("input[type=file]").setInputFiles({
    name: "prova.nc",
    mimeType: "text/plain",
    buffer: Buffer.from("G21 G18\nG0 X40 Z5\nG1 Z-20\nM30"),
  });
  await expect(
    page.getByRole("tab", { name: "prova.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Anteprima geometrica/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("prova.nc");
  await page.screenshot({ path: "/tmp/cnc-studio-file.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("configuratore e trasmissione con una porta seriale di test", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      options: {} as Record<string, unknown>,
      bytes: [] as number[],
      closed: false,
    };
    (window as unknown as { serialTest: typeof state }).serialTest = state;
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: {
        async requestPort() {
          return {
            async open(options: Record<string, unknown>) {
              state.options = options;
            },
            async close() {
              state.closed = true;
            },
            readable: new ReadableStream({
              start(c) {
                c.enqueue(new TextEncoder().encode("PRONTO\r\n"));
              },
            }),
            writable: new WritableStream({
              write(bytes: Uint8Array) {
                state.bytes.push(...bytes);
              },
            }),
          };
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await page.getByLabel("Nome macchina", { exact: true }).fill("Tornio Fanuc");
  await page.getByLabel("Baud rate").selectOption("4800");
  await page.getByLabel("Controllo di flusso").selectOption("hardware");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nuova macchina", exact: true })
    .click();
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("Fresa Mitsubishi");
  await page.getByLabel("Controllo CNC").selectOption("Mitsubishi");
  await page.getByLabel("Baud rate").selectOption("19200");
  await page.getByLabel("Bit dati").selectOption("8");
  await page.getByLabel("Parità").selectOption("odd");
  await page.getByLabel("Bit di stop").selectOption("1");
  await page.getByLabel("Controllo di flusso").selectOption("none");
  await page
    .getByRole("navigation", { name: "Sezioni impostazioni RS232" })
    .getByRole("button", { name: "Trasmissione", exact: true })
    .click();
  await page.getByLabel("Fine riga").selectOption("LF");
  await page.getByLabel("Pausa tra blocchi").selectOption("0");
  await page.getByLabel("Delimitatori %").uncheck();
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await page
    .getByLabel("Macchina per il trasferimento")
    .selectOption({ label: "Tornio Fanuc" });
  await expect(page.getByLabel("Baud rate")).toBeHidden();
  await page.getByRole("button", { name: "Seleziona e collega porta" }).click();
  await expect(page.getByText("Collegato", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Macchina per il trasferimento")).toBeDisabled();
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await page
    .locator(".machine-item")
    .filter({ hasText: "Tornio Fanuc" })
    .click();
  await expect(page.getByLabel("Baud rate")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Elimina macchina", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Simulazione", exact: true }).click();
  await expect(page.locator(".serial-column")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { serialTest: { closed: boolean } }).serialTest
          .closed,
    ),
  ).toBe(false);
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(page.getByText("Collegato", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Macchina per il trasferimento").locator("option:checked"),
  ).toHaveText("Tornio Fanuc");
  await page
    .getByRole("button", { name: "Invia programma alla macchina" })
    .click();
  await expect(
    page.getByText(
      "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
    ),
  ).toBeVisible();
  const state = await page.evaluate(
    () =>
      (
        window as unknown as {
          serialTest: { options: Record<string, unknown>; bytes: number[] };
        }
      ).serialTest,
  );
  expect(state.options).toMatchObject({
    baudRate: 4800,
    dataBits: 7,
    parity: "even",
    stopBits: 2,
    flowControl: "hardware",
  });
  expect(new TextDecoder().decode(new Uint8Array(state.bytes))).toContain(
    "O1001 (PIASTRA - PROFILO ESTERNO)\r\n",
  );
  await page.getByRole("button", { name: /Dati ricevuti/ }).click();
  await expect(page.getByLabel("Dati seriali ricevuti")).toHaveValue(
    "PRONTO\n",
  );
  await page.getByRole("button", { name: "Disconnetti porta" }).click();
  await expect(
    page.getByRole("button", { name: "Seleziona e collega porta" }),
  ).toBeVisible();
  await page
    .getByLabel("Macchina per il trasferimento")
    .selectOption({ label: "Fresa Mitsubishi" });
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill("O4321\nG1 X2\nM30");
  await page.getByRole("button", { name: "Seleziona e collega porta" }).click();
  await page
    .getByRole("button", { name: "Invia programma alla macchina" })
    .click();
  await expect(
    page.getByText(
      "Dati scritti sulla porta. Verifica la ricezione sul controllo CNC.",
    ),
  ).toBeVisible();
  const second = await page.evaluate(
    () =>
      (
        window as unknown as {
          serialTest: { options: Record<string, unknown>; bytes: number[] };
        }
      ).serialTest,
  );
  expect(second.options).toMatchObject({
    baudRate: 19200,
    dataBits: 8,
    parity: "odd",
    stopBits: 1,
    flowControl: "none",
  });
  expect(
    new TextDecoder().decode(
      new Uint8Array(second.bytes.slice(state.bytes.length)),
    ),
  ).toBe("O4321\nG1 X2\nM30\n");
});
test("interfaccia utilizzabile su schermo stretto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Salva file", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/cnc-studio-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(page.locator(".serial-column")).toBeVisible();
  await expect(page.locator(".preview-column")).toBeHidden();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "/tmp/cnc-transmission-mobile.png",
    fullPage: true,
  });
});
