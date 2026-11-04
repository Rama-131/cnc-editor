import { expect, test, type Locator, type Page } from "@playwright/test";

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

async function dragPlot(page: Page, dx: number, dy: number) {
  const plot = page.getByRole("img", {
    name: "Percorso utensile simulato",
    exact: true,
  });
  const box = await bounds(plot);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(plot).toHaveAttribute("data-dragging", "true");
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
  await expect(plot).toHaveAttribute("data-dragging", "false");
}

test("trascina percorso e zero insieme senza spostare gli assi o modificare programma e coordinate", async ({
  page,
}) => {
  await page.goto("/");
  const plot = page.getByRole("img", {
    name: "Percorso utensile simulato",
    exact: true,
  });
  const cut = plot.locator(":scope > path").last();
  const origin = page.locator(".work-origin");
  const axes = page.locator(".axis-indicator");
  const initialCut = await bounds(cut);
  const initialOrigin = await bounds(origin);
  const initialAxes = await bounds(axes);
  const coordinates = await page.locator(".coordinates").innerText();
  const source = await page.evaluate(() => localStorage.getItem("cnc.draft"));
  await dragPlot(page, 70, -35);
  const movedCut = await bounds(cut);
  const movedOrigin = await bounds(origin);
  expect(movedCut.x - initialCut.x).toBeCloseTo(70, 0);
  expect(movedCut.y - initialCut.y).toBeCloseTo(-35, 0);
  expect(movedOrigin.x - initialOrigin.x).toBeCloseTo(70, 0);
  expect(movedOrigin.y - initialOrigin.y).toBeCloseTo(-35, 0);
  expect(await bounds(axes)).toEqual(initialAxes);
  expect(await page.locator(".coordinates").innerText()).toBe(coordinates);
  expect(await page.evaluate(() => localStorage.getItem("cnc.draft"))).toBe(
    source,
  );
  await page
    .getByRole("button", { name: "Adatta alla vista", exact: true })
    .click();
  expect(await bounds(cut)).toEqual(initialCut);
  expect(await bounds(origin)).toEqual(initialOrigin);
});

test("mantiene la presa fuori dal disegno, permette il ricentramento e continua durante la riproduzione", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Tipo macchina").selectOption("lathe");
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill("G10 P0 Z-266.2\nG0 X40 Z5\nG1 X20 Z-10\nG1 X30 Z-20\nM30");
  const plot = page.getByRole("img", {
    name: "Percorso utensile simulato",
    exact: true,
  });
  const cut = plot.locator(":scope > path").last();
  const original = await bounds(cut);
  await page
    .getByRole("button", { name: "Ingrandisci vista", exact: true })
    .click();
  const box = await bounds(plot);
  await dragPlot(page, -box.width, 20);
  const transform = await cut.getAttribute("transform");
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7);
  await expect(cut).toHaveAttribute("transform", transform!);
  await plot.dblclick({ position: { x: box.width / 2, y: box.height / 2 } });
  expect(await bounds(cut)).toEqual(original);
  await page.getByLabel("Avanzamento simulazione").fill("0");
  await page
    .getByRole("button", { name: "Avvia simulazione", exact: true })
    .click();
  await dragPlot(page, 35, 20);
  await expect(
    page.getByRole("button", { name: "Pausa simulazione", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Avanzamento simulazione").inputValue()),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Pausa simulazione", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adatta alla vista", exact: true })
    .click();
  await expect(cut).toHaveAttribute("transform", "translate(0 0)");
  await page.screenshot({ path: "/tmp/cnc-mouse-pan.png" });
});
