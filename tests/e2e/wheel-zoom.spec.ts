import { expect, test, type Locator } from "@playwright/test";

async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box!;
}

test("la rotella ingrandisce e riduce sul punto del mouse anche dopo il trascinamento", async ({
  page,
}) => {
  await page.goto("/");
  const plot = page.getByRole("img", {
    name: "Percorso utensile simulato",
    exact: true,
  });
  const cut = plot.locator(":scope > path").last();
  const zero = page.locator(".work-origin > path");
  const original = await bounds(cut);
  const frame = await bounds(plot);
  await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    frame.x + frame.width / 2 + 40,
    frame.y + frame.height / 2 + 20,
    { steps: 4 },
  );
  await page.mouse.up();
  const panned = await bounds(cut);
  const anchor = await bounds(zero);
  const x = anchor.x + anchor.width / 2,
    y = anchor.y + anchor.height / 2;
  const coordinates = await page.locator(".coordinates").innerText();
  const source = await page.evaluate(() => localStorage.getItem("cnc.draft"));
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await bounds(cut)).width)
    .toBeGreaterThan(panned.width);
  const anchored = await bounds(zero);
  // Wheel events report whole screen pixels, while SVG bounds can be fractional.
  expect(anchored.x + anchored.width / 2).toBeCloseTo(x, 0);
  expect(anchored.y + anchored.height / 2).toBeCloseTo(y, 0);
  await page.mouse.wheel(0, 120);
  await expect
    .poll(async () => (await bounds(cut)).width)
    .toBeCloseTo(panned.width, 1);
  const returned = await bounds(cut);
  expect(returned.x).toBeCloseTo(panned.x, 1);
  expect(returned.y).toBeCloseTo(panned.y, 1);
  expect(await page.locator(".coordinates").innerText()).toBe(coordinates);
  expect(await page.evaluate(() => localStorage.getItem("cnc.draft"))).toBe(
    source,
  );
  await page
    .getByRole("button", { name: "Adatta alla vista", exact: true })
    .click();
  expect(await bounds(cut)).toEqual(original);
});

test("limita lo zoom, evita lo scorrimento del pannello e lascia proseguire la riproduzione", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 400 });
  await page.goto("/");
  const plot = page.getByRole("img", {
    name: "Percorso utensile simulato",
    exact: true,
  });
  const cut = plot.locator(":scope > path").last();
  // Geometric bounds exclude the stroke, whose screen width stays constant.
  const geometryWidth = () =>
    cut.evaluate((node) => (node as SVGGraphicsElement).getBBox().width);
  const originalWidth = await geometryWidth();
  const zero = await bounds(page.locator(".work-origin > path"));
  await page.mouse.move(zero.x + zero.width / 2, zero.y + zero.height / 2);
  const scroll = await page
    .locator(".simulation")
    .evaluate((node) => node.scrollTop);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -10000);
  await expect.poll(geometryWidth).toBeCloseTo(originalWidth * 8, 0);
  const maximum = await geometryWidth();
  await page.mouse.wheel(0, -10000);
  expect(await geometryWidth()).toBeCloseTo(maximum, 1);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 10000);
  await expect.poll(geometryWidth).toBeCloseTo(originalWidth * 0.25, 0);
  expect(
    await page.locator(".simulation").evaluate((node) => node.scrollTop),
  ).toBe(scroll);
  await page
    .getByRole("button", { name: "Adatta alla vista", exact: true })
    .click();
  await page.getByLabel("Avanzamento simulazione").fill("0");
  await page
    .getByRole("button", { name: "Avvia simulazione", exact: true })
    .click();
  const box = await bounds(plot);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -100);
  await expect(
    page.getByRole("button", { name: "Pausa simulazione", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(await page.getByLabel("Avanzamento simulazione").inputValue()),
    )
    .toBeGreaterThan(0);
});
