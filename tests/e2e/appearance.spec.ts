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

test("ripristina i colori vivaci per codice e conserva le nuove scelte dopo il ricaricamento", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill(program);
  const lines = page.locator(".editor-column .cm-line");
  const motion = lines.filter({ hasText: "G0 G54 X0 Y0 M8" });
  await expect(motion.getByText("G0", { exact: true })).toHaveCSS(
    "color",
    "rgb(79, 169, 255)",
  );
  await expect(motion.getByText("X", { exact: true })).toHaveCSS(
    "color",
    "rgb(66, 232, 255)",
  );
  await expect(motion.getByText("0", { exact: true }).first()).toHaveCSS(
    "color",
    "rgb(255, 229, 91)",
  );
  await expect(motion.getByText("M8", { exact: true })).toHaveCSS(
    "color",
    "rgb(255, 107, 232)",
  );
  await expect(
    lines
      .filter({ hasText: "T2 M6 (CENTRINO)" })
      .getByText("T2", { exact: true }),
  ).toHaveCSS("color", "rgb(255, 158, 69)");
  await expect(
    page.locator(".editor-column").getByText("(CENTRINO)", { exact: true }),
  ).toHaveCSS("color", "rgb(125, 255, 106)");
  await expect
    .poll(() =>
      textColors(
        lines.filter({ hasText: "(ESTERNO (G0 X999) ANCORA COMMENTO)" }),
      ),
    )
    .toEqual(["rgb(125, 255, 106)"]);
  await expect(page.locator(".editor-column .cm-gutters")).toHaveCSS(
    "color",
    "rgb(88, 101, 118)",
  );
  await expect(page.locator(".editor-column .cm-editor")).toHaveCSS(
    "background-color",
    "rgb(18, 22, 28)",
  );
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("tokens");
  // Per-line colors remain an explicit option and are no longer the default.
  await page.getByLabel("Stile colorazione").selectOption("blocks");
  await expect.poll(() => textColors(motion)).toEqual(["rgb(243, 245, 143)"]);
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("blocks");
  await page.getByLabel("Stile colorazione").selectOption("tokens");
  await page.getByLabel("Colore Codici G").fill("#aabbcc");
  await expect(motion.getByText("G0", { exact: true })).toHaveCSS(
    "color",
    "rgb(170, 187, 204)",
  );
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Personalizza colori" }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("tokens");
  await expect(page.getByLabel("Colore Codici G")).toHaveValue("#aabbcc");
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await expect(page.getByLabel("Stile colorazione")).toHaveValue("tokens");
  await expect(page.getByLabel("Colore Codici G")).toHaveValue("#4fa9ff");
});

test("aggiorna la precedente palette per riga mantenendo le tinte personalizzate anche nella ricezione", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("test.colors.seeded")) {
      localStorage.setItem("test.colors.seeded", "1");
      localStorage.setItem(
        "cnc.palette",
        JSON.stringify({
          mode: "blocks",
          motion: "#f3f58f",
          auxiliary: "#f2f4f4",
          lineNumber: "#29d6ef",
          g: "#ff8844",
          m: "#ff6be8",
          axis: "#42e8ff",
          value: "#ffe55b",
          comment: "#80ff37",
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
  await expect(page.getByLabel("Colore Numeri di riga")).toHaveValue("#586576");
  await expect(page.getByLabel("Colore Commenti")).toHaveValue("#7dff6a");
  await page.getByRole("button", { name: "Ripristina", exact: true }).click();
  await page.getByRole("link", { name: "Ricezione", exact: true }).click();
  const motion = page
    .locator(".received-column .cm-line")
    .filter({ hasText: "G0 X10" });
  await expect(motion.getByText("G0", { exact: true })).toHaveCSS(
    "color",
    "rgb(79, 169, 255)",
  );
  await expect(
    page.locator(".received-column").getByText("(PUNTA)", { exact: true }),
  ).toHaveCSS("color", "rgb(125, 255, 106)");
});
