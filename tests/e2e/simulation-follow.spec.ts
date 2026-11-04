import { expect, test, type Page } from "@playwright/test";

async function openProgram(page: Page, source: string) {
  await page.locator("input[type=file]").setInputFiles({
    name: "simulazione.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await expect(page.getByLabel("Nome file")).toHaveValue("simulazione.nc");
}
async function expectVisibleExecutionLine(
  page: Page,
  line: number,
  text: string,
) {
  const active = page.locator(".cm-simulationLine");
  await expect(active).toHaveAttribute("data-simulation-line", String(line));
  await expect(active).toContainText(text);
  await expect(page.locator(".cm-simulationLineGutter")).toHaveText(
    String(line),
  );
  await expect
    .poll(async () => {
      const row = await active.boundingBox();
      const pane = await page
        .locator(".editor-column .cm-scroller")
        .boundingBox();
      return (
        !!row &&
        !!pane &&
        row.y >= pane.y &&
        row.y + row.height <= pane.y + pane.height
      );
    })
    .toBe(true);
}

test("segue la riga sui programmi lunghi senza spostare il cursore o la pagina", async ({
  page,
}) => {
  const source = [
    "G21 G90",
    "(PROGRAMMA LUNGO)",
    ...Array.from(
      { length: 120 },
      (_, i) => `N${i + 1} G1 X${i + 1} Y${(i + 1) % 10}`,
    ),
    "M30",
  ].join("\n");
  await page.goto("/");
  await openProgram(page, source);
  await expect(page.locator(".cm-simulationLine")).toHaveCount(0);
  const scroller = page.locator(".editor-column .cm-scroller");
  await scroller.evaluate((element) => (element.scrollTop = 0));
  await page
    .locator(".cm-line")
    .filter({ hasText: "G21 G90" })
    .click({ position: { x: 3, y: 8 } });
  const cursor = await page
    .locator(".editor-status > span")
    .first()
    .textContent();
  const pageScroll = await page.evaluate(() => window.scrollY);
  const timeline = page.getByLabel("Avanzamento simulazione");

  await timeline.fill("75");
  await expectVisibleExecutionLine(page, 92, "N90 G1 X90");
  expect(
    await scroller.evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(1000);
  await expect(page.locator(".editor-status > span").first()).toHaveText(
    cursor!,
  );
  await expect(
    page.getByRole("textbox", { name: "Editor programma G-code" }),
  ).not.toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);

  await page.getByLabel("Segui riga", { exact: true }).uncheck();
  const scrollTop = await scroller.evaluate((element) => element.scrollTop);
  await timeline.fill("10");
  await expect(page.locator(".execution-position")).toHaveText(
    "Riga in simulazione: 14",
  );
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(
    scrollTop,
  );
  await page.getByLabel("Segui riga", { exact: true }).check();
  await expectVisibleExecutionLine(page, 14, "N12 G1 X12");

  await page.getByRole("button", { name: "Riavvolgi simulazione" }).click();
  await expectVisibleExecutionLine(page, 3, "N1 G1 X1");
  await page.getByRole("button", { name: "Avvia simulazione" }).click();
  await expect
    .poll(() => page.locator(".execution-position").textContent())
    .not.toBe("Riga in simulazione: 3");
  await page.getByRole("button", { name: "Pausa simulazione" }).click();
  const pausedLine = await page.locator(".execution-position").textContent();
  // Allow multiple playback ticks to pass: paused playback must retain its row.
  await page.waitForTimeout(180);
  await expect(page.locator(".execution-position")).toHaveText(pausedLine!);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("cnc.draft")!).source,
    ),
  ).toBe(source);
  await expect(page.locator(".unsaved")).toHaveCount(0);
  await expect(page.locator(".editor-status > span").first()).toHaveText(
    cursor!,
  );

  await timeline.fill("100");
  await expectVisibleExecutionLine(page, 122, "N120 G1 X120");
  await page.getByRole("button", { name: "Avvia simulazione" }).click();
  await page.getByRole("button", { name: "Pausa simulazione" }).click();
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".cm-simulationLine")
          .getAttribute("data-simulation-line"),
      ),
    )
    .toBeLessThan(20);
  await page.screenshot({
    path: "/tmp/cnc-simulation-follow.png",
    fullPage: true,
  });
});

test("mantiene la riga corretta lungo un arco e azzera il riferimento cambiando programma", async ({
  page,
}) => {
  await page.goto("/");
  await openProgram(
    page,
    "G21 G17 G90\nG0 X10 Y0\nG3 X10 Y0 I-10 J0\nG1 X20\nM30",
  );
  const timeline = page.getByLabel("Avanzamento simulazione");
  await timeline.fill("25");
  await expectVisibleExecutionLine(page, 3, "G3 X10 Y0 I-10 J0");
  await timeline.fill("50");
  await expectVisibleExecutionLine(page, 3, "G3 X10 Y0 I-10 J0");
  await timeline.fill("100");
  await expectVisibleExecutionLine(page, 4, "G1 X20");
  await openProgram(page, "%\nO1\nM30\n%");
  await expect(page.locator(".cm-simulationLine")).toHaveCount(0);
  await expect(page.locator(".cm-simulationLineGutter")).toHaveCount(0);
  await expect(page.locator(".execution-position")).toContainText(
    "Avvia la simulazione",
  );
  await expect(
    page.getByRole("button", { name: "Avvia simulazione" }),
  ).toBeDisabled();
});
