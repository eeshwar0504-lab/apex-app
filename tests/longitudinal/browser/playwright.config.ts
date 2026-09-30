import { defineConfig, devices } from '@playwright/test';

/* Representative browser corpus for the longitudinal system (run: npm run test:longitudinal:browser). */
export default defineConfig({
  testDir: '.',
  testMatch: /longitudinal-browser\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list'], ['json', { outputFile: '../../../test-results/longitudinal-browser.json' }]],
  outputDir: '../../../test-results/longitudinal-browser-artifacts',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 390, height: 844 }, screenshot: 'only-on-failure', video: 'off', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
  webServer: { command: 'npm run preview -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: true, cwd: '../../..' },
});
