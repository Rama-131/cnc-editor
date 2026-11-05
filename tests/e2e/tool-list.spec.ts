import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("crea la lista del file attivo, distingue le preselezioni e permette salvataggio e stampa", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      toolPrintCalls: 0,
      print() {
        (window as unknown as { toolPrintCalls: number }).toolPrintCalls++;
      },
    });
  });
  await page.goto("/");
  const context = (await page.locator(".app-context").boundingBox())!,
    commands = (await page
      .getByRole("group", { name: "Comandi file" })
      .boundingBox())!;
  expect(commands.x - context.x - context.width).toBeLessThan(20);
  await page.locator("input[type=file]").setInputFiles([
    {
      name: "altro.nc",
      mimeType: "text/plain",
      buffer: Buffer.from("T5 M6 (ALTRO UTENSILE)\nM30"),
    },
    {
      name: "preparazione.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "T2 M6 (CENTRINO)\nG43 H83 T14\nM98 H50 L1\nT14 M6 (PUNTA 9 HSS)\nG43 H67 T16\nT16 M6 (INCASSATORE)\nG43 H89 T10\nM30",
      ),
    },
  ]);
  await page
    .getByRole("button", { name: "Crea lista utensili", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Lista utensili da preparare",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("tbody tr")).toHaveCount(4);
  const t2 = dialog.locator("tbody tr").filter({ hasText: "CENTRINO" });
  await expect(t2).toContainText("H83");
  await expect(t2).not.toContainText("H50");
  await expect(
    dialog.locator("tbody tr").filter({ hasText: "PUNTA 9 HSS" }),
  ).toContainText("H67");
  await expect(
    dialog.locator("tbody tr").filter({ hasText: "T10" }),
  ).toContainText("Solo preselezione");
  await page.screenshot({ path: "/tmp/cnc-tool-list.png", fullPage: true });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Salva lista TXT" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("preparazione_utensili.txt");
  expect(await readFile((await file.path())!, "utf8")).toContain(
    "T2\tCENTRINO\tH83",
  );
  await dialog
    .getByRole("button", { name: "Stampa lista", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { toolPrintCalls: number }).toolPrintCalls,
    ),
  ).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-document h1")).toHaveText(
    "Lista utensili · preparazione.txt",
  );
  await expect(page.locator(".print-document tbody tr")).toHaveCount(4);
  await expect(page.locator(".print-document pre")).toHaveCount(0);
  await page.pdf({ path: "/tmp/cnc-tools-print.pdf", preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("tab", { name: "altro.nc", exact: true }).click();
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await page
    .getByRole("button", { name: "Crea lista utensili", exact: true })
    .click();
  await expect(dialog.locator("tbody tr")).toHaveCount(1);
  await expect(dialog).toContainText("ALTRO UTENSILE");
});

test("consente di scegliere il formato tornio e segnala richiami parametrici e file senza utensili", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor programma G-code" });
  await editor.fill("T0101 (SGROSSATORE)\nT0102\nT1212 (PUNTA)\nT#100\nM30");
  await page
    .getByRole("button", { name: "Crea lista utensili", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Lista utensili da preparare",
    exact: true,
  });
  await dialog.getByLabel("Tipo lista utensili").selectOption("lathe");
  await expect(dialog.locator("tbody tr")).toHaveCount(2);
  await expect(
    dialog.locator("tbody tr").filter({ hasText: "SGROSSATORE" }),
  ).toContainText("Offset 01, Offset 02");
  await expect(dialog).toContainText("Richiamo utensile parametrico");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "/tmp/cnc-tool-list-mobile.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).click();
  await expect(page.getByLabel("Tipo macchina", { exact: true })).toHaveValue(
    "lathe",
  );
  await editor.fill("G0 X0\nM30");
  await page
    .getByRole("button", { name: "Crea lista utensili", exact: true })
    .click();
  await expect(dialog).toContainText("Nessun utensile numerico rilevato");
  await expect(dialog.locator("tbody tr")).toHaveCount(0);
});
