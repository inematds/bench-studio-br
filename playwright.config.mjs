import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.BENCH_WEB_PORT || 5200);
const apiPort = Number(process.env.BENCH_API_PORT || 8787);
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.mjs",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    // Keep automated validation completely isolated from the user's Chrome app.
    // Playwright's bundled Chromium runs headlessly unless a developer explicitly
    // opts into the separate `test:e2e:headed` script.
    browserName: "chromium",
    headless: true,
    // A interface e bilingue e escolhe o idioma pelo navegador quando ninguem
    // escolheu antes. Sem fixar o locale aqui, a suite passaria ou quebraria
    // conforme a maquina que a roda — os testes abaixo afirmam o texto EM
    // INGLES. O caminho em portugues tem teste proprio, que forca `?lang=pt-BR`.
    locale: "en-US",
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: `PORT=${apiPort} BENCH_API_PORT=${apiPort} BENCH_WEB_PORT=${webPort} npm run dev`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: process.env.BENCH_REUSE_SERVER !== "0",
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});
