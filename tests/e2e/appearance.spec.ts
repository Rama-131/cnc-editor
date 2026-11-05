import { expect, test, type Locator } from "@playwright/test";

const program =
  "%\nO0009 (099281-136A SETUP 2)\n(100X80X20)\nN1 G0 G40 G90 G80 G94 G54\nT2 M6 (CENTRINO)\nG80 G90 G40 G94 G54\nG0 G54 X0 Y0 M8\nG43 Z25 H83 S1600 M3 T14\nG81 Z-5.5 R3 F160 L0\nM98 H50 L1\nG80\nG73 Z-41 Q1 R3 F90 L0\n(ESTERNO (G0 X999) ANCORA COMMENTO)\nM30\n%";
async function textColors(line: Locator) {
  return line.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT),
      result = new Set<string>();
    let node: Node | null;
    while ((node = walker.nextNode()))
      if (node.textContent?.trim() && node.parentElement)
        result.add(getComputedStyle(node.parentElement).color);
    return [...result];
  });
}

test("usa per impostazione predefinita righe gialle e bianche, commenti verdi e numeri azzurri come nella foto", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill(program);
  const lines = page.locator(".editor-column .cm-line");
  for (const text of [
    "N1 G0 G40 G90 G80 G94 G54",
    "G0 G54 X0 Y0 M8",
    "G43 Z25 H83 S1600 M3 T14",
    "G81 Z-5.5 R3 F160 L0",
    "G73 Z-41 Q1 R3 F90 L0",
  ])
    await expect
      .poll(() => textColors(lines.filter({ hasText: text })))
      .toEqual(["rgb(243, 245, 143)"]);
  for (const text of ["G80 G90 G40 G94 G54", "M98 H50 L1", "M30"])
    await expect
      .poll(() => textColors(lines.filter({ hasText: text })))
      .toEqual(["rgb(242, 244, 244)"]);
  await expect(
    page.locator(".editor-column").getByText("(CENTRINO)", { exact: true }),
  ).toHaveCSS("color", "rgb(128, 255, 55)");
  await expect
    .poll(() =>
      textColors(
        lines.filter({ hasText: "(ESTERNO (G0 X999) ANCORA COMMENTO)" }),
      ),
    )
    .toEqual(["rgb(128, 255, 55)"]);
  await expect(page.locator(".editor-column .cm-gutters")).toHaveCSS(
    "color",
    "rgb(41, 214, 239)",
  );
  await expect(page.locator(".editor-column .cm-editor")).toHaveCSS(
    "background-color",
    "rgb(38, 40, 36)",
  );
  await page.screenshot({
    path: "/tmp/cnc-reference-colors.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("blocks");
  await page.getByLabel("Colore Movimenti e quote").fill("#ff8844");
  await expect
    .poll(() => textColors(lines.filter({ hasText: "G0 G54 X0 Y0 M8" })))
    .toEqual(["rgb(255, 136, 68)"]);
  await page.getByLabel("Stile colorazione").selectOption("tokens");
  await page.getByLabel("Colore Codici G").fill("#aabbcc");
  await expect(
    lines
      .filter({ hasText: "G0 G54 X0 Y0 M8" })
      .getByText("G0", { exact: true }),
  ).toHaveCSS("color", "rgb(170, 187, 204)");
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("tokens");
  await expect(page.getByLabel("Colore Codici G")).toHaveValue("#aabbcc");
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("blocks");
  await expect(page.getByLabel("Colore Movimenti e quote")).toHaveValue(
    "#f3f58f",
  );
});

test("mantiene i colori già personalizzati e applica lo schema della foto anche al documento ricevuto", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("test.colors.seeded")) {
      localStorage.setItem("test.colors.seeded", "1");
      localStorage.setItem(
        "cnc.palette",
        JSON.stringify({
          g: "#ff8844",
          m: "#ff6be8",
          axis: "#42e8ff",
          value: "#ffe55b",
          comment: "#7dff6a",
          tool: "#ff9e45",
        }),
      );
      localStorage.setItem(
        "cnc.reception",
        JSON.stringify({
          name: "ricevuto.nc",
          text: "G0 X10\r\nM6 (PUNTA)\r\n",
          saved: true,
        }),
      );
    }
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("tokens");
  await expect(page.getByLabel("Colore Codici G")).toHaveValue("#ff8844");
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  await expect
    .poll(() =>
      textColors(
        page.locator(".received-column .cm-line").filter({ hasText: "G0 X10" }),
      ),
    )
    .toEqual(["rgb(243, 245, 143)"]);
  await expect(
    page.locator(".received-column").getByText("(PUNTA)", { exact: true }),
  ).toHaveCSS("color", "rgb(128, 255, 55)");
});
