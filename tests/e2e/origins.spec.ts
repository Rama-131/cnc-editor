import { expect, test, type Page } from "@playwright/test";

async function openProgram(page: Page, source: string) {
  await page.locator("input[type=file]").setInputFiles({
    name: "origini.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
}

test("mostra lo zero giallo e segue i cambi di origine anche nei blocchi senza movimento", async ({
  page,
}) => {
  await page.goto("/");
  await openProgram(
    page,
    "G21 G90\nG54\nG0 X10 Y0\nG1 X20 Y10\nG55\nG0 X5 Y0\nG1 X15 Y10\nG56\nM30",
  );
  const code = page.locator(".work-origin-code");
  const timeline = page.getByLabel("Avanzamento simulazione");
  const cut = page
    .locator('svg[aria-label="Percorso utensile simulato"] > path')
    .last();
  await expect(page.getByText(/Anteprima parziale/)).toHaveCount(0);
  await expect(code).toHaveText("G56");
  await expect(page.locator(".work-origin-zero")).toHaveText("0");
  await expect(page.locator(".work-origin-zero")).toHaveCSS(
    "fill",
    "rgb(244, 211, 94)",
  );
  await expect(page.locator(".work-origin-zero")).toHaveCSS(
    "font-size",
    "18px",
  );
  await page.getByText("Dettagli anteprima", { exact: true }).click();
  await expect(
    page.getByText(/Ogni origine è mostrata separatamente/),
  ).toBeVisible();
  await page.getByText("Dettagli anteprima", { exact: true }).click();
  await expect(cut).toHaveAttribute("d", "");

  await timeline.fill("42.9");
  await expect(code).toHaveText("G54");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "4",
  );
  await expect(cut).not.toHaveAttribute("d", "");
  await timeline.fill("57.1");
  await expect(code).toHaveText("G55");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "5",
  );
  await expect(cut).toHaveAttribute("d", "");
  await timeline.fill("85.7");
  await expect(code).toHaveText("G55");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "7",
  );
  await expect(cut).not.toHaveAttribute("d", "");
  await timeline.fill("100");
  await expect(code).toHaveText("G56");
  await expect(page.locator(".cm-simulationLine")).toHaveAttribute(
    "data-simulation-line",
    "8",
  );

  await page.getByRole("button", { name: "Riavvolgi simulazione" }).click();
  await expect(code).toHaveText("G54");
  await page.getByLabel("Velocità simulazione").selectOption("4");
  await page.getByRole("button", { name: "Avvia simulazione" }).click();
  await expect(code).toHaveText("G55");
  await page.getByRole("button", { name: "Pausa simulazione" }).click();
  await page.waitForTimeout(160);
  await expect(code).toHaveText("G55");
  await page.getByRole("button", { name: "Riavvolgi simulazione" }).click();
  await expect(code).toHaveText("G54");
  await page
    .locator(".viewport")
    .screenshot({ path: "/tmp/cnc-origin-g54.png" });
});

test("mostra solo origini effettivamente presenti nel programma eseguito", async ({
  page,
}) => {
  await page.goto("/");
  await openProgram(page, "G21 G90\nG0 X10\nG1 X20\nM30");
  await expect(page.locator(".work-origin-code")).toHaveCount(0);
  await expect(page.locator(".viewport-label")).toContainText(
    "origine non indicata",
  );
  await openProgram(page, "(G59 IN UN COMMENTO)\nG58\nG0 X10\nM30\nG55");
  await expect(page.locator(".work-origin-code")).toHaveText("G58");
  await page.getByRole("button", { name: "Esempi di programma" }).click();
  await page.getByRole("button", { name: "Profilo tornitura" }).click();
  await expect(page.locator(".work-origin-code")).toHaveText("G54");
  await page
    .locator(".viewport")
    .screenshot({ path: "/tmp/cnc-origin-lathe.png" });
});
