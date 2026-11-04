import { test, expect } from "@playwright/test";

test("conserva cartelle per macchina e le propone in Apri e Salva senza alterare dati se annulli", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      openedIn: "",
      savedIn: "",
      savedText: "",
      suggestedName: "",
      cancelled: false,
      holdWrite: false,
      pending: false,
      release: () => {},
    };
    Object.assign(window, {
      folderTest: state,
      async showDirectoryPicker(options: { id: string }) {
        return {
          name:
            options.id === "cnc-send"
              ? "Programmi da inviare"
              : "Programmi ricevuti",
          kind: "directory",
        };
      },
      async showOpenFilePicker(options: { startIn: { name: string } }) {
        state.openedIn = options.startIn.name;
        return [
          {
            getFile: async () =>
              new File(["O1234\nG0 X10\nM30"], "macchina.txt", {
                type: "text/plain",
              }),
          },
        ];
      },
      async showSaveFilePicker(options: {
        startIn: { name: string };
        suggestedName: string;
      }) {
        state.savedIn = options.startIn.name;
        state.suggestedName = options.suggestedName;
        if (state.cancelled) throw new DOMException("Annullato", "AbortError");
        return {
          name: options.suggestedName,
          async createWritable() {
            return {
              async write(blob: Blob) {
                if (state.holdWrite)
                  await new Promise<void>((resolve) => {
                    state.pending = true;
                    state.release = resolve;
                  });
                state.savedText = await blob.text();
              },
              async close() {},
              async abort() {},
            };
          },
        };
      },
    });
  });
  await page.goto("/#impostazioni");
  await page
    .getByLabel("Nome macchina", { exact: true })
    .fill("Macchina con cartelle");
  await page
    .getByRole("button", { name: "Salva macchina", exact: true })
    .click();
  const directory = () =>
    page
      .getByRole("navigation", { name: "Sezioni impostazioni RS232" })
      .getByRole("button", { name: "Directory", exact: true });
  await directory().click();
  await page
    .getByRole("button", { name: "Scegli e salva cartella trasmissione" })
    .click();
  await expect(
    page.getByText("Programmi da inviare", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Scegli e salva cartella ricezione" })
    .click();
  await expect(
    page.getByText("Programmi ricevuti", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await directory().click();
  await expect(
    page.getByText("Programmi da inviare", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Simulazione", exact: true }).click();
  await page
    .getByRole("button", { name: "Apri programma", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "macchina.txt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { folderTest: { openedIn: string } }).folderTest
            .openedIn,
      ),
    )
    .toBe("Programmi da inviare");
  await page
    .getByRole("textbox", { name: "Editor programma G-code" })
    .fill("O1234\nG0 X20\nM30");
  await page.evaluate(() => {
    (
      window as unknown as { folderTest: { cancelled: boolean } }
    ).folderTest.cancelled = true;
  });
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  await expect(
    page
      .getByRole("tab", { name: "macchina.txt", exact: true })
      .locator(".document-dirty"),
  ).toBeVisible();
  await page.evaluate(() => {
    (
      window as unknown as { folderTest: { cancelled: boolean } }
    ).folderTest.cancelled = false;
  });
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { folderTest: { savedText: string } })
            .folderTest.savedText,
      ),
    )
    .toBe("O1234\nG0 X20\nM30");
  await expect(
    page
      .getByRole("tab", { name: "macchina.txt", exact: true })
      .locator(".document-dirty"),
  ).toHaveCount(0);
  await page.evaluate(() => {
    localStorage.setItem(
      "cnc.reception",
      JSON.stringify({
        name: "ricevuto.nc",
        text: "%\r\nO12\r\n%\r\n",
        saved: false,
      }),
    );
  });
  await page.goto("/#ricezione");
  await page.reload();
  await page
    .getByRole("button", { name: "Salva ricevuto", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { folderTest: { savedIn: string } }).folderTest
            .savedIn,
      ),
    )
    .toBe("Programmi ricevuti");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { folderTest: { savedText: string } })
            .folderTest.savedText,
      ),
    )
    .toBe("%\r\nO12\r\n%\r\n");
  await page.evaluate(() => {
    (
      window as unknown as { folderTest: { holdWrite: boolean } }
    ).folderTest.holdWrite = true;
  });
  await page
    .getByLabel("Nome del file ricevuto", { exact: true })
    .fill("archivio.nc");
  await page
    .getByRole("button", { name: "Salva ricevuto", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { folderTest: { pending: boolean } }).folderTest
            .pending,
      ),
    )
    .toBe(true);
  await page
    .getByRole("button", { name: "Nuova ricezione", exact: true })
    .click();
  await page.evaluate(() => {
    (
      window as unknown as { folderTest: { release: () => void } }
    ).folderTest.release();
  });
  await expect(page.locator(".received-count")).toHaveAttribute(
    "data-count",
    "0",
  );
  await expect(
    page.getByLabel("Nome del file ricevuto", { exact: true }),
  ).toHaveValue("ricevuto.nc");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("cnc.reception")!).saved,
      ),
    )
    .toBe(true);
});

test("Apri e Salva continuano a funzionare se il browser nega l’archivio delle cartelle", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const settings = {
      baudRate: 9600,
      dataBits: 7,
      stopBits: 2,
      parity: "even",
      flowControl: "software",
      lineEnding: "CRLF",
      delay: 10,
      wrap: true,
    };
    localStorage.setItem(
      "cnc.machines",
      JSON.stringify({
        version: 1,
        machines: [{ id: "test", name: "Fresa", control: "Fanuc", settings }],
        selectedId: "test",
      }),
    );
    Object.defineProperty(indexedDB, "open", {
      value: () => {
        throw new DOMException("Archivio negato", "SecurityError");
      },
    });
  });
  await page.goto("/#simulazione");
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Apri programma", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "prova.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("O1\nM30"),
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Salva file", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("prova.txt");
});
