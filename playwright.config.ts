import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', use: { baseURL: 'http://localhost:3100', ...devices['Desktop Chrome'] }, webServer: { command: 'npm run start', url: 'http://localhost:3100', env: { PORT: '3100' }, reuseExistingServer: !process.env.CI, timeout: 120_000 } });
