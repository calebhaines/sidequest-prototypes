import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.COFFEE_QA_URL || "http://127.0.0.1:5181",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "firefox-desktop",
      use: { browserName: "firefox", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-phone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "chromium-landscape",
      use: { ...devices["iPhone 13 landscape"], browserName: "chromium" },
    },
    {
      name: "webkit-phone",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
  webServer: process.env.COFFEE_QA_URL
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 5181 --strictPort",
        url: "http://127.0.0.1:5181",
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
