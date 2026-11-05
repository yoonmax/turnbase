import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5211',
    // Full Chromium with the real GPU backend, so WebGL frames are genuine.
    channel: 'chromium',
    launchOptions: { args: ['--use-angle=metal'] },
    viewport: { width: 1440, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:5211',
    reuseExistingServer: true,
    timeout: 180000,
  },
});
