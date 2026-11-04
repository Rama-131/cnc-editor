import { expect, test } from "@playwright/test";
import { millSample } from "../../src/lib/samples";

test("le pagine condividono il programma, le modifiche e la cronologia dell’editor", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Editor programma G-code" });
  const source = "G21 G90\n(PROGRAMMA CONDIVISO)\nG0 X5 Y3\nG1 X20 F200\nM30";
  await editor.fill(source);
  await page.getByRole("tab", { selected: true }).dblclick();
  await page.getByLabel("Nome file").fill("programma_condiviso.nc");
  await page.getByLabel("Nome file").press("Enter");
  const cursor = await page
    .locator(".editor-status > span")
    .first()
    .textContent();
  await expect(page.locator(".unsaved")).toBeVisible();
  await expect(page.locator(".preview-column")).toBeVisible();
  await expect(page.locator(".serial-column")).toBeHidden();
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(page).toHaveURL(/#trasmissione$/);
  await expect(
    page.getByRole("heading", { name: "Trasmissione" }),
  ).toBeVisible();
  await expect(editor).toHaveCount(1);
  await expect(editor).toBeVisible();
  await expect(
    page.locator(".cm-line").filter({ hasText: "(PROGRAMMA CONDIVISO)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "programma_condiviso.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".unsaved")).toBeVisible();
  await expect(page.locator(".editor-status > span").first()).toHaveText(
    cursor!,
  );
  await expect(page.locator(".serial-column")).toBeVisible();
  await expect(page.locator(".preview-column")).toBeHidden();
  await expect(page.locator(".execution-bar")).toBeHidden();
  await expect(page.locator(".examples")).toBeHidden();
  await page.screenshot({
    path: "/tmp/cnc-transmission-page.png",
    fullPage: true,
  });

  await page
    .getByRole("link", { name: "Scrittura / Simulazione", exact: true })
    .click();
  await expect(page).toHaveURL(/#simulazione$/);
  await expect(page.locator(".preview-column")).toBeVisible();
  await expect(page.locator(".serial-column")).toBeHidden();
  await expect(
    page.getByRole("tab", { name: "programma_condiviso.nc", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("cnc.draft")!).source,
      ),
    )
    .toBe(source);
  await editor.press("Control+z");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("cnc.draft")!).source,
      ),
    )
    .toBe(millSample);
  await expect(page.locator(".unsaved")).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/cnc-simulation-page.png",
    fullPage: true,
  });
});

test("supporta i link diretti e la cronologia del browser e mette in pausa la simulazione cambiando pagina", async ({
  page,
}) => {
  await page.goto("/#trasmissione");
  await expect(page.locator(".serial-column")).toBeVisible();
  await expect(page.locator(".preview-column")).toBeHidden();
  await expect(
    page.getByRole("link", { name: "Trasmissione", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("link", { name: "Scrittura / Simulazione", exact: true })
    .click();
  await page.getByRole("button", { name: "Avvia simulazione" }).click();
  const timeline = page.getByLabel("Avanzamento simulazione");
  await expect
    .poll(async () => Number(await timeline.inputValue()))
    .toBeGreaterThan(0);
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(page.locator(".play-button")).toHaveAttribute(
    "aria-label",
    "Avvia simulazione",
  );
  const paused = await timeline.inputValue();
  // Several animation ticks must leave the hidden simulation paused.
  await page.waitForTimeout(180);
  expect(await timeline.inputValue()).toBe(paused);
  await page
    .getByRole("link", { name: "Scrittura / Simulazione", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Avvia simulazione" }),
  ).toBeVisible();
  await expect(timeline).toHaveValue(paused);
  await page.goBack();
  await expect(page.locator(".serial-column")).toBeVisible();
  await expect(page.locator(".preview-column")).toBeHidden();
  await page.goForward();
  await expect(page.locator(".preview-column")).toBeVisible();
  await expect(page.locator(".serial-column")).toBeHidden();
});
