import { expect, test } from "@playwright/test";

test("organizza i parametri RS232 in schede e li salva separatamente per macchina", async ({
  page,
}) => {
  await page.goto("/#impostazioni");
  const nav = page.getByRole("navigation", {
    name: "Sezioni impostazioni RS232",
  });
  const section = async (name: string) =>
    nav.getByRole("button", { name, exact: true }).click();
  await page.getByLabel("Nome macchina", { exact: true }).fill("FRESA QUARTZ");
  await page.getByLabel("Attiva DTR", { exact: true }).selectOption("true");
  await page.getByLabel("Attiva RTS", { exact: true }).selectOption("true");
  await page.getByLabel("Carattere XON").fill("\\6");
  await page.getByLabel("Carattere XOFF").fill("\\21");
  await section("Trasmissione");
  await expect(
    nav.getByRole("button", { name: "Trasmissione", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Trigger d’inizio trasmissione").fill("%");
  await page.getByLabel("Trigger di fine trasmissione").fill("%");
  await page.getByLabel("Invia prima del file").fill("\\2");
  await page.getByLabel("Interrompi dopo n caratteri").fill("1200");
  await page.getByLabel("Rimuovi ASCII 0", { exact: true }).check();
  await page.getByLabel("Attendi XON prima di inviare").check();
  await section("Ricezione");
  await page
    .getByLabel("Tempo limite ricezione (secondi)", { exact: true })
    .fill("5");
  await page.getByLabel("Trigger d’inizio ricezione").fill("%");
  await page.getByLabel("Trigger di fine ricezione").fill("%");
  await page.getByLabel("Ometti linee vuote", { exact: true }).check();
  await section("Directory");
  await expect(
    page.getByRole("button", { name: "Scegli e salva cartella trasmissione" }),
  ).toBeDisabled();
  await page
    .getByLabel("Estensione file trasmissione", { exact: true })
    .fill("txt");
  await page
    .getByLabel("Estensione file ricezione", { exact: true })
    .fill("txt");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await expect(
    page.getByText("Macchina salvata.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/cnc-rs232-directories.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("Attiva DTR", { exact: true })).toHaveValue(
    "true",
  );
  await expect(page.getByLabel("Carattere XON")).toHaveValue("\\6");
  await page.screenshot({ path: "/tmp/cnc-rs232-port.png", fullPage: true });
  await section("Trasmissione");
  await expect(page.getByLabel("Interrompi dopo n caratteri")).toHaveValue(
    "1200",
  );
  await expect(
    page.getByLabel("Rimuovi ASCII 0", { exact: true }),
  ).toBeChecked();
  await page.screenshot({ path: "/tmp/cnc-rs232-send.png", fullPage: true });
  await section("Ricezione");
  await expect(
    page.getByLabel("Tempo limite ricezione (secondi)", { exact: true }),
  ).toHaveValue("5");
  await page.screenshot({ path: "/tmp/cnc-rs232-receive.png", fullPage: true });
  await page.getByRole("link", { name: "Simulazione", exact: true }).click();
  await page
    .getByRole("button", { name: "Salva con nome", exact: true })
    .click();
  await expect(page.getByLabel("Formato file", { exact: true })).toHaveValue(
    "txt",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Annulla", exact: true })
    .click();
  await page.getByRole("link", { name: "Impostazioni", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "/tmp/cnc-rs232-mobile.png", fullPage: true });
  await page
    .getByRole("button", { name: "Nuova macchina", exact: true })
    .click();
  await expect(page.getByLabel("Attiva DTR", { exact: true })).toHaveValue(
    "auto",
  );
  await section("Ricezione");
  await expect(
    page.getByLabel("Tempo limite ricezione (secondi)", { exact: true }),
  ).toHaveValue("0");
  await page
    .getByLabel("Tempo limite ricezione (secondi)", { exact: true })
    .fill("-1");
  await page.getByLabel("Nome macchina", { exact: true }).fill("Macchina due");
  await section("Porta");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Tempi e limiti");
});

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
  await page
    .getByRole("navigation", { name: "Sezioni impostazioni RS232" })
    .getByRole("button", { name: "Trasmissione", exact: true })
    .click();
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
