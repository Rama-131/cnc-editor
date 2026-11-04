import { expect, test } from "@playwright/test";
import { fanucG71Program } from "../fixtures/fanucG71";

test("simula il G71 a due righe con il profilo A135/R1.8 fornito dall’utente e segue il blocco del ciclo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page.locator("input[type=file]").setInputFiles({
    name: "profilo-g71.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(fanucG71Program),
  });
  await expect(page.getByText(/Anteprima parziale/)).toHaveCount(0);
  await expect(page.locator(".scope-note")).toContainText("G71 tipo I esterno");
  await expect(page.locator(".work-origin-code")).toHaveText("G10 P0");
  await expect(page.locator(".spindle-limit-label")).toContainText("1200");
  await expect(page.locator(".coordinates strong").nth(0)).toHaveText("32.500");
  await expect(page.locator(".coordinates strong").nth(2)).toHaveText("5.000");
  await page.getByLabel("Avanzamento simulazione").fill("20");
  await expect(page.locator(".sim-note")).toContainText("G71 · passata");
  await expect(page.locator(".cm-simulationLine")).toContainText(
    "N180 G71 P190 Q310",
  );
  await page.getByLabel("Avanzamento simulazione").fill("100");
  await expect(
    page.locator('svg[aria-label="Percorso utensile simulato"] > path').last(),
  ).not.toHaveAttribute("d", "");
  await page.screenshot({ path: "/tmp/cnc-g71-profile.png" });
});
