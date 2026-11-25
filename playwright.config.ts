import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: {
    // The server's output also goes to .e2e-server.log, so tests can check
    // that a request logged no server error (e.g. ERR_HTTP_HEADERS_SENT).
    command: "sh -c 'npm run start -- --hostname localhost --port 3000 2>&1 | tee .e2e-server.log'",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://gayvideo:gayvideo@localhost:5432/gayvideo?schema=public",
      ADMIN_SESSION_SECRET:
        process.env.ADMIN_SESSION_SECRET ?? "e2e-admin-session-secret",
    },
  },
});
