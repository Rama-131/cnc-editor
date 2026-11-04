import { expect, test } from "@playwright/test";
import { MACHINE_IMPORT_KEY } from "../../src/lib/machineImport";
import { defaultSerial } from "../../src/lib/serial";

test.use({ storageState: { cookies: [], origins: [] } });
const library = (page: import("@playwright/test").Page) =>
  page.locator(".machine-item");

test("carica le sette macchine reali e conserva i parametri, la selezione e le eliminazioni", async ({
  page,
}) => {
  await page.goto("/#impostazioni");
  await expect(library(page)).toHaveCount(7);
  for (const name of [
    "DART VMC 1000A",
    "FRESA QUARTZ",
    "BIGLIA S131",
    "HURCO VM1",
    "MAZAK HTC 400",
    "MOMAC TA-20",
    "PUMA 300L",
  ])
    await expect(library(page).filter({ hasText: name })).toHaveCount(1);
  await library(page).filter({ hasText: "BIGLIA S131" }).click();
  await expect(page.getByLabel("Baud rate")).toHaveValue("4800");
  await expect(page.getByLabel("Bit di stop")).toHaveValue("1");
  await expect(page.locator(".port-choice")).toContainText("COM6");
  await library(page).filter({ hasText: "HURCO VM1" }).click();
  await expect(page.getByLabel("Attiva DTR", { exact: true })).toHaveValue(
    "false",
  );
  const nav = page.getByRole("navigation", {
    name: "Sezioni impostazioni RS232",
  });
  await nav.getByRole("button", { name: "Ricezione", exact: true }).click();
  await expect(page.getByLabel("Rimuovi controlli ASCII 0–31")).toBeChecked();
  await expect(
    page.getByLabel("Tempo limite ricezione (secondi)", { exact: true }),
  ).toHaveValue("5");
  await expect(
    page.getByLabel("Invia XON all’inizio della ricezione"),
  ).not.toBeChecked();
  await library(page).filter({ hasText: "MAZAK HTC 400" }).click();
  await expect(page.getByLabel("Controllo di flusso")).toHaveValue("both");
  await expect(page.getByLabel("Attiva RTS", { exact: true })).toBeDisabled();
  await nav.getByRole("button", { name: "Trasmissione", exact: true }).click();
  await expect(page.getByLabel("Delimitatori %")).not.toBeChecked();
  await expect(
    page.getByLabel("Rimuovi ASCII 0", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Tempo limite handshake (secondi)", { exact: true }),
  ).toHaveValue("0");
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  const machine = page.getByLabel("Macchina per il trasferimento");
  await expect(machine.locator("option")).toHaveCount(7);
  await machine.selectOption({ label: "BIGLIA S131" });
  await expect(
    page
      .getByText(/Porta nel trasmettitore precedente:/)
      .filter({ visible: true }),
  ).toContainText("COM6");
  await page.reload();
  await expect(machine.locator("option:checked")).toHaveText("BIGLIA S131");
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await expect(library(page)).toHaveCount(7);
  await page.screenshot({
    path: "/tmp/cnc-imported-machines.png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Elimina macchina", exact: true })
    .click();
  await expect(library(page)).toHaveCount(6);
  await page.reload();
  await expect(library(page)).toHaveCount(6);
});

test("importa senza sovrascrivere una macchina omonima o cambiare quella selezionata", async ({
  page,
}) => {
  await page.addInitScript(
    ({ settings }) => {
      if (localStorage.getItem("test.seeded")) return;
      localStorage.setItem("test.seeded", "1");
      localStorage.setItem(
        "cnc.machines",
        JSON.stringify({
          version: 1,
          machines: [
            {
              id: "personale",
              name: "FRESA QUARTZ",
              control: "Fanuc",
              settings,
            },
          ],
          selectedId: "personale",
        }),
      );
    },
    { settings: { ...defaultSerial, baudRate: 19200 } },
  );
  await page.goto("/#trasmissione");
  const machine = page.getByLabel("Macchina per il trasferimento");
  await expect(machine.locator("option")).toHaveCount(8);
  await expect(machine).toHaveValue("personale");
  await expect(
    machine.locator("option").filter({ hasText: "FRESA QUARTZ (importata)" }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await expect(page.getByLabel("Baud rate")).toHaveValue("19200");
  await library(page).filter({ hasText: "PUMA 300L" }).click();
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("PUMA personale");
  await page.getByLabel("Baud rate").selectOption("19200");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page.reload();
  await library(page).filter({ hasText: "PUMA personale" }).click();
  await expect(page.getByLabel("Baud rate")).toHaveValue("19200");
  await expect(library(page)).toHaveCount(8);
});

for (const failingKey of ["cnc.machines", MACHINE_IMPORT_KEY]) {
  test(`se la scrittura di ${failingKey} fallisce conserva i dati e riprova senza duplicare`, async ({
    page,
  }) => {
    await page.addInitScript((key) => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === key && !localStorage.getItem("test.allowSave"))
          throw new DOMException("Quota esaurita", "QuotaExceededError");
        write.call(this, k, v);
      };
    }, failingKey);
    await page.goto("/#impostazioni");
    await expect(library(page)).toHaveCount(7);
    await expect(
      page.getByText(/non è stato possibile salvarle nel browser/),
    ).toBeVisible();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        MACHINE_IMPORT_KEY,
      ),
    ).toBeNull();
    await page.evaluate(() => localStorage.setItem("test.allowSave", "1"));
    await page.reload();
    await expect(library(page)).toHaveCount(7);
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), MACHINE_IMPORT_KEY),
      )
      .toBe("1");
  });
}
