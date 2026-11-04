import { expect, test } from "@playwright/test";

test("salva più macchine, applica solo le modifiche confermate e conserva selezione ed eliminazioni", async ({
  page,
}) => {
  await page.goto("/#trasmissione");
  await expect(
    page.getByRole("button", { name: "Seleziona e collega porta" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Configura la prima macchina" }).click();
  await expect(page).toHaveURL(/#impostazioni$/);
  await expect(page.locator(".workspace")).toBeHidden();
  await expect(page.locator(".program-tabs-bar")).toHaveCount(0);
  await page.getByLabel("Nome macchina", { exact: true }).fill("Tornio 1");
  await page.getByLabel("Baud rate").selectOption("4800");
  await page.getByLabel("Fine riga").selectOption("CR");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nuova macchina", exact: true })
    .click();
  await page.getByLabel("Nome macchina", { exact: true }).fill("Tornio 2");
  await page.getByLabel("Baud rate").selectOption("19200");
  await page.keyboard.press("Control+s");
  await expect(
    page.getByText("Macchina salvata.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Baud rate").selectOption("115200");
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  const machine = page.getByLabel("Macchina per il trasferimento");
  await expect(machine.locator("option:checked")).toHaveText("Tornio 2");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("cnc.machines")!).machines[1].settings
          .baudRate,
    ),
  ).toBe(19200);
  await expect(page.getByLabel("Baud rate")).toBeHidden();
  await machine.selectOption({ label: "Tornio 1" });
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  await expect(machine.locator("option:checked")).toHaveText("Tornio 1");
  await expect(page.getByLabel("Controllo di flusso")).toBeHidden();
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await expect(page.getByLabel("Baud rate")).toHaveValue("115200");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page.reload();
  await page.locator(".machine-item").filter({ hasText: "Tornio 2" }).click();
  await expect(page.getByLabel("Baud rate")).toHaveValue("115200");
  await page.getByLabel("Nome macchina", { exact: true }).fill("Tornio 1");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Esiste già una macchina",
  );
  await page
    .getByRole("button", { name: "Annulla modifiche", exact: true })
    .click();
  await page.screenshot({
    path: "/tmp/cnc-machine-settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "/tmp/cnc-machine-settings-mobile.png",
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Elimina macchina", exact: true })
    .click();
  await expect(page.locator(".machine-item")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Elimina macchina", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".machine-item")).toHaveCount(0);
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(machine).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Seleziona e collega porta" }),
  ).toBeDisabled();
});

test("se il salvataggio fallisce mantiene la configurazione precedente e la bozza modificabile", async ({
  page,
}) => {
  await page.goto("/#impostazioni");
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("Tornio salvato");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await page.evaluate(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "cnc.machines")
        throw new DOMException("Quota esaurita", "QuotaExceededError");
      write.call(this, key, value);
    };
  });
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("Nome non salvato");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await expect(
    page.getByText(/Impossibile salvare le macchine nel browser/),
  ).toBeVisible();
  await expect(page.getByLabel("Nome macchina", { exact: true })).toHaveValue(
    "Nome non salvato",
  );
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(
    page.getByLabel("Macchina per il trasferimento").locator("option:checked"),
  ).toHaveText("Tornio salvato");
});
