import { expect, test } from "@playwright/test";
import { defaultSerial } from "../../src/lib/serial";

test("stampa tutto il programma attivo, incluse modifiche e righe fuori dallo schermo, su più pagine", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      printCalls: 0,
      print() {
        (window as unknown as { printCalls: number }).printCalls++;
      },
    });
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "ALTRO.TXT",
      mimeType: "text/plain",
      buffer: Buffer.from("(ALTRO PROGRAMMA)\nM30"),
    },
    {
      name: "DA_STAMPARE.TXT",
      mimeType: "text/plain",
      buffer: Buffer.from("O1\nM30"),
    },
  ]);
  const text =
    "%\nO1234\n" +
    Array.from({ length: 240 }, (_, i) => `N${i + 1} G1 X${i} F100`).join(
      "\n",
    ) +
    "\n(ULTIMA RIGA <CONFERMA> & COMMENTO)\nM30\n%";
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill(text);
  await page
    .getByRole("button", { name: "Stampa programma", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { printCalls: number }).printCalls,
    ),
  ).toBe(1);
  await expect(page.locator(".print-document h1")).toHaveText(
    "DA_STAMPARE.TXT",
  );
  await expect(page.locator(".print-document pre")).toHaveText(text);
  await expect(page.locator(".program-tab.active .unsaved")).toBeVisible();
  expect(await page.locator(".editor-column .cm-line").count()).toBeLessThan(
    240,
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-document")).toBeVisible();
  await expect(page.locator(".main-shell")).toBeHidden();
  await expect(page.locator(".rail")).toBeHidden();
  const pdf = await page.pdf({
    path: "/tmp/cnc-program-print.pdf",
    preferCSSPageSize: true,
  });
  expect(
    (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length,
  ).toBeGreaterThan(2);
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-document")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Editor programma G-code" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "ALTRO.TXT", exact: true }).click();
  await page
    .getByRole("button", { name: "Stampa programma", exact: true })
    .click();
  await expect(page.locator(".print-document pre")).toHaveText(
    "(ALTRO PROGRAMMA)\nM30",
  );
  await expect(page.locator(".print-document h1")).toHaveText("ALTRO.TXT");
});

test("in Ricezione stampa il documento ricevuto, supporta Ctrl+P e disabilita la stampa se vuoto", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cnc.reception",
      JSON.stringify({
        name: "RICEVUTO.TXT",
        text: "%\r\nO4321\r\nM30\r\n%\r\n",
        saved: false,
      }),
    );
    Object.assign(window, {
      printCalls: 0,
      print() {
        (window as unknown as { printCalls: number }).printCalls++;
      },
    });
  });
  await page.goto("/#ricezione");
  await page
    .getByRole("button", { name: "Stampa programma", exact: true })
    .click();
  await expect(page.locator(".print-document h1")).toHaveText("RICEVUTO.TXT");
  await expect(page.locator(".print-document pre")).toHaveText(
    "%\nO4321\nM30\n%\n",
  );
  await page.keyboard.press("Control+p");
  expect(
    await page.evaluate(
      () => (window as unknown as { printCalls: number }).printCalls,
    ),
  ).toBe(2);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Nuova ricezione", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stampa programma", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+p");
  expect(
    await page.evaluate(
      () => (window as unknown as { printCalls: number }).printCalls,
    ),
  ).toBe(2);
});

test("attende la fine del trasferimento seriale prima di aprire la stampa", async ({
  page,
}) => {
  await page.addInitScript(
    (settings) => {
      localStorage.setItem("cnc.serial.Fanuc", JSON.stringify(settings));
      localStorage.setItem(
        "cnc.reception",
        JSON.stringify({
          name: "ricevuto.txt",
          text: "O4321\nM30",
          saved: true,
        }),
      );
      const state = { printCalls: 0, hold: true, release: () => {} };
      Object.assign(window, {
        printTransferTest: state,
        print() {
          state.printCalls++;
        },
      });
      Object.defineProperty(navigator, "serial", {
        configurable: true,
        value: {
          async requestPort() {
            return {
              async open() {},
              async close() {},
              readable: new ReadableStream<Uint8Array>(),
              writable: new WritableStream<Uint8Array>({
                async write() {
                  if (state.hold)
                    await new Promise<void>((resolve) => {
                      state.release = () => {
                        state.hold = false;
                        resolve();
                      };
                    });
                },
              }),
            };
          },
        },
      });
    },
    { ...defaultSerial, flowControl: "hardware", delay: 0 },
  );
  await page.goto("/#trasmissione");
  await page
    .getByRole("button", { name: "Seleziona e collega porta", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Invia programma alla macchina", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stampa programma", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+p");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { printTransferTest: { printCalls: number } })
          .printTransferTest.printCalls,
    ),
  ).toBe(0);
  await page.evaluate(() =>
    (
      window as unknown as { printTransferTest: { release: () => void } }
    ).printTransferTest.release(),
  );
  await expect(page.locator(".serial-message")).toContainText(
    "Dati scritti sulla porta",
  );
  await expect(
    page.getByRole("button", { name: "Stampa programma", exact: true }),
  ).toBeEnabled();
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stampa programma", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Riprendi ricezione", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stampa programma", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Control+p");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { printTransferTest: { printCalls: number } })
          .printTransferTest.printCalls,
    ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Termina ricezione", exact: true })
    .click();
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await page
    .getByRole("button", { name: "Stampa programma", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { printTransferTest: { printCalls: number } })
          .printTransferTest.printCalls,
    ),
  ).toBe(1);
});
