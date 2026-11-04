import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
import { MACHINE_IMPORT_KEY } from "./src/lib/machineImport";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1480, height: 1000 },
    // Existing workflows start with an empty user library. The import-specific
    // tests override this to exercise first-run migration with the real files.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://127.0.0.1:5173",
          localStorage: [{ name: MACHINE_IMPORT_KEY, value: "1" }],
        },
      ],
    },
    launchOptions: {
      executablePath,
      args:
        process.platform === "linux"
          ? ["--no-sandbox", "--disable-dev-shm-usage"]
          : [],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: "list",
});
