import { expect, test } from "@playwright/test";
import { fanucG70Program } from "../fixtures/fanucG71";

test("prosegue dal G71 al G70 sullo stesso profilo e segue le righe della finitura", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.locator("input[type=file]").setInputFiles({
    name: "profilo-g70.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(fanucG70Program),
  });
  await expect(page.getByText(/Anteprima parziale/)).toHaveCount(0);
  await expect(page.locator(".scope-note")).toContainText(
    "G70: profilo nominale senza sovrametalli",
  );
  await expect(page.locator(".coordinates strong").nth(0)).toHaveText("40.000");
  await expect(page.locator(".coordinates strong").nth(2)).toHaveText("10.000");
  await page.getByLabel("Avanzamento simulazione").fill("80");
  await expect(page.locator(".sim-note")).toContainText("G70 · finitura");
  const row = Number(
    await page
      .locator(".cm-simulationLine")
      .getAttribute("data-simulation-line"),
  );
  expect(row).toBeGreaterThanOrEqual(7);
  expect(row).toBeLessThanOrEqual(23);
  await expect(page.locator(".work-origin-code")).toHaveText("G10 P0");
  await expect(page.locator(".spindle-limit-label")).toContainText("1200");
  await page.getByLabel("Avanzamento simulazione").fill("100");
  await page.screenshot({ path: "/tmp/cnc-g70-finished.png" });
});
