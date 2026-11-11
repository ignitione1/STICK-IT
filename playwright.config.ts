import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1242, height: 1266 },
    channel: 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm.cmd --prefix server run test:browser-server', url: 'http://127.0.0.1:3101/api/health', reuseExistingServer: false },
    { command: 'npm.cmd run dev -- --port 5174 --strictPort', url: 'http://127.0.0.1:5174', reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:3101' } },
  ],
});
