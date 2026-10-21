import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3112";
export default defineConfig({
  testDir: "./tests/e2e-disabled",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: "list",
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "disabled-desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "disabled-mobile", use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3112",
    url: baseURL,
    reuseExistingServer: false,
    env: { APP_AI_MODE: "disabled", OPENROUTER_PAID_ENABLED: "false", LIVE_EVAL_ENABLED: "false", OPENROUTER_API_KEY: "" },
    timeout: 120_000,
  },
});
