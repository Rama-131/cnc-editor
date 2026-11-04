import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("inserisce spazi su richiesta, mantiene il cursore e permette annulla/ripristina e salvataggio", async ({
  page,
}) => {
  const source =
    "%\nO4321\n(COMMENTO G1X99)\nN10G21G90G54\nN20G0X10Y5\nN30G1X20Y5F200M8;G0X999\nM30\n%";
  const formatted =
    "%\nO4321\n(COMMENTO G1X99)\nN10 G21 G90 G54\nN20 G0 X10 Y5\nN30 G1 X20 Y5 F200 M8;G0X999\nM30\n%";
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles({
    name: "compatto.nc",
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  const editor = page.getByRole("textbox", { name: "Editor programma G-code" });
  const draft = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("cnc.draft")!).source);
  await expect.poll(draft).toBe(source);
  await expect(page.getByText(/Anteprima geometrica/)).toBeVisible();
  await editor.press("Control+Home");
  for (let n = 0; n < 4; n++) await editor.press("ArrowDown");
  await editor.press("Home");
  for (let n = 0; n < 7; n++) await editor.press("ArrowRight");
  await expect(
    page.locator(".editor-column .editor-status span").first(),
  ).toHaveText("Ln 5, Col 8");
  const format = page.getByRole("button", {
    name: "Inserisci spazi",
    exact: true,
  });
  await format.click();
  await expect.poll(draft).toBe(formatted);
  await expect(editor).toBeFocused();
  await expect(
    page.locator(".editor-column .editor-status span").first(),
  ).toHaveText("Ln 5, Col 10");
  await expect(page.locator(".unsaved")).toBeVisible();
  await format.click(); // A second click must not add a history entry or spaces.
  await editor.press("Control+z");
  await expect.poll(draft).toBe(source);
  await expect(page.locator(".unsaved")).toHaveCount(0);
  await editor.press("Control+y");
  await expect.poll(draft).toBe(formatted);
  await page.getByRole("link", { name: "Trasmissione", exact: true }).click();
  await expect(format).toBeVisible();
  await expect.poll(draft).toBe(formatted);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("compatto.nc");
  expect(await readFile((await download.path())!, "utf8")).toBe(formatted);
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  await expect(format).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Programma ricevuto dalla macchina" }),
  ).toHaveAttribute("aria-readonly", "true");
});
