import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("apre TXT, salva con un nuovo nome e usa quel nome nei salvataggi successivi", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "PEZZO.TXT",
    mimeType: "text/plain",
    buffer: Buffer.from("%\r\nO1234\r\nG1 X10\r\nM30\r\n%\r\n"),
  });
  const editor = page.getByRole("textbox", { name: "Editor programma G-code" });
  const source = "%\nO1234\nG1 X20 F150\nM30\n%";
  await editor.fill(source);
  await expect(page.locator(".program-tab.active .unsaved")).toBeVisible();
  let downloads = 0;
  page.on("download", () => downloads++);
  await page
    .getByRole("button", { name: "Salva con nome", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Salva con nome",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Formato file")).toHaveValue("txt");
  await dialog
    .getByLabel("Nome file", { exact: true })
    .fill("PEZZO_MODIFICATO");
  await expect(dialog.locator("output")).toHaveText("PEZZO_MODIFICATO.txt");
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Conferma salvataggio con nome", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("PEZZO_MODIFICATO.txt");
  expect(await readFile((await file.path())!, "utf8")).toBe(source);
  await expect(
    page.getByRole("tab", { name: "PEZZO_MODIFICATO.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".program-tab.active .unsaved")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salva con nome", exact: true })
    .click();
  await dialog
    .getByLabel("Nome file", { exact: true })
    .fill("DA_NON_SALVARE.txt");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(downloads).toBe(1);
  await expect(
    page.getByRole("tab", { name: "PEZZO_MODIFICATO.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  expect((await saved).suggestedFilename()).toBe("PEZZO_MODIFICATO.txt");
});

test("sceglie NC o TXT, convalida il nome e supporta Ctrl+Maiusc+S", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .press("Control+Shift+s");
  const dialog = page.getByRole("dialog", {
    name: "Salva con nome",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Nome file", { exact: true }).fill("pezzo.TXT");
  await expect(dialog.getByLabel("Formato file")).toHaveValue("txt");
  await dialog.getByLabel("Formato file").selectOption("nc");
  await expect(dialog.getByLabel("Nome file", { exact: true })).toHaveValue(
    "pezzo.nc",
  );
  await dialog.getByLabel("Nome file", { exact: true }).fill("CON");
  await dialog
    .getByRole("button", { name: "Conferma salvataggio con nome", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("riservato da Windows");
  await dialog.getByLabel("Nome file", { exact: true }).fill("lavoro/errato");
  await dialog
    .getByRole("button", { name: "Conferma salvataggio con nome", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("non può contenere");
  await dialog.getByLabel("Nome file", { exact: true }).fill("profilo.v2");
  await dialog.getByLabel("Formato file").selectOption("txt");
  await expect(dialog.locator("output")).toHaveText("profilo.v2.txt");
  await page.screenshot({ path: "/tmp/cnc-save-as-dialog.png" });
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Conferma salvataggio con nome", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("profilo.v2.txt");
});

test("salva il documento ricevuto in TXT conservando i fine riga originali", async ({
  page,
}) => {
  const source = "%\r\nO4321\r\nG1 X20\r\nM30\r\n%\r\n";
  await page.addInitScript(
    (text) =>
      localStorage.setItem(
        "cnc.reception",
        JSON.stringify({ text, name: "ricevuto.nc", saved: false }),
      ),
    source,
  );
  await page.goto("/#ricezione");
  await page
    .getByRole("button", { name: "Salva con nome", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Salva con nome",
    exact: true,
  });
  await dialog.getByLabel("Formato file").selectOption("txt");
  await dialog.getByLabel("Nome file", { exact: true }).fill("ESTRATTO.TXT");
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Conferma salvataggio con nome", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("ESTRATTO.TXT");
  expect(await readFile((await file.path())!, "utf8")).toBe(source);
  await expect(
    page.getByLabel("Nome del file ricevuto", { exact: true }),
  ).toHaveValue("ESTRATTO.TXT");
  await expect(page.locator(".received-document .unsaved")).toHaveCount(0);
  await page.getByRole("link", { name: "Simulazione", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "O1001_piastra.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
