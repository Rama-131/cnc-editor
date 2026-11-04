import { expect, test } from "@playwright/test";

test("G10 P0 segue lo shift e la riga eseguita senza disegnare un movimento del cambio origine", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.locator("input[type=file]").setInputFiles({
    name: "fanuc.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "%\nO0030\nN10 G10 P0 Z-266.2\nN20 T1212 G97 S600 M4\nN30 G0 X75 Z0.1 M8\nN40 G1 X-2 F0.18\nN45 G10 P0 Z-200\nN50 G0 X250 Z2 M9\nM30\n%",
    ),
  });
  await expect(page.getByText(/Anteprima parziale/)).toHaveCount(0);
  await expect(page.locator(".work-origin-code")).toHaveText("G10 P0");
  const shift = page.locator(".work-shift-label");
  const timeline = page.getByLabel("Avanzamento simulazione");
  const paths = page.locator(
    'svg[aria-label="Percorso utensile simulato"] > path',
  );
  const coordinates = page.locator(".coordinates strong");
  await expect(shift).toContainText("Z -200.000");
  await timeline.fill("20");
  await expect(shift).toContainText("Z -266.200");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "3",
  );
  await expect(paths.nth(0)).toHaveAttribute("d", "");
  await expect(paths.nth(1)).toHaveAttribute("d", "");
  await expect(coordinates.nth(2)).toHaveText("0.000");
  await timeline.fill("60");
  await expect(paths.nth(1)).not.toHaveAttribute("d", "");
  await expect(coordinates.nth(2)).toHaveText("0.100");
  await timeline.fill("80");
  await expect(shift).toContainText("Z -200.000");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "7",
  );
  await expect(coordinates.nth(2)).toHaveText("-66.100");
  await expect(paths.nth(0)).toHaveAttribute("d", "");
  await expect(paths.nth(1)).toHaveAttribute("d", "");
  await timeline.fill("100");
  await expect(paths.nth(0)).not.toHaveAttribute("d", "");
  await expect(coordinates.nth(2)).toHaveText("2.000");
  await page.getByRole("button", { name: "Riavvolgi simulazione" }).click();
  await expect(shift).toContainText("Z -266.200");
  await page
    .locator(".editor-column .cm-content")
    .getByText("G10", { exact: true })
    .first()
    .hover();
  await expect(
    page.getByText("G10 · Spostamento origine programmato"),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/cnc-fanuc-g10.png" });
  await page.getByRole("button", { name: "Apri guida codici" }).click();
  await page.getByRole("textbox", { name: "Cerca codice" }).fill("G10");
  await expect(
    page.getByText("Spostamento origine programmato", { exact: true }),
  ).toBeVisible();
});

test("M26 e G92 S1200 compaiono nella riproduzione senza generare corse utensile", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.locator("input[type=file]").setInputFiles({
    name: "comandi-tornio.nc",
    mimeType: "text/plain",
    buffer: Buffer.from("G10 P0 Z-266.2\nG1 X40 Z-5\nM26\nG92 S1200\nW-2\nM30"),
  });
  const timeline = page.getByLabel("Avanzamento simulazione");
  const limit = page.locator(".spindle-limit-label");
  const coordinates = page.locator(".coordinates strong");
  await expect(page.getByText(/Anteprima parziale/)).toHaveCount(0);
  await expect(limit).toHaveText("Limite mandrino · 1200 giri/min");
  await timeline.fill("40");
  await expect(limit).toHaveCount(0);
  await expect(coordinates.nth(2)).toHaveText("-5.000");
  const path = await page
    .locator('svg[aria-label="Percorso utensile simulato"] > path')
    .last()
    .getAttribute("d");
  await timeline.fill("60");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "3",
  );
  await expect(page.locator(".sim-note")).toContainText("Contropunta avanti");
  await expect(
    page.locator('svg[aria-label="Percorso utensile simulato"] > path').last(),
  ).toHaveAttribute("d", path!);
  await expect(coordinates.nth(2)).toHaveText("-5.000");
  await timeline.fill("80");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "4",
  );
  await expect(limit).toHaveText("Limite mandrino · 1200 giri/min");
  await expect(page.locator(".sim-note")).toContainText("Limite mandrino");
  await expect(coordinates.nth(2)).toHaveText("-5.000");
  await timeline.fill("100");
  await expect(coordinates.nth(2)).toHaveText("-7.000");
  await expect(limit).toHaveText("Limite mandrino · 1200 giri/min");
  await page.screenshot({ path: "/tmp/cnc-fanuc-auxiliary.png" });
});
