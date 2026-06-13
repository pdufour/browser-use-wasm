import { defineConfig } from '@playwright/test';
import {
  E2E_BENCHMARK,
  E2E_BENCHMARK_GLOBAL_TIMEOUT_MS,
  E2E_GLOBAL_TIMEOUT_MS,
  E2E_TEST_TIMEOUT_MS,
} from './tests/e2e/e2e.js';

/**
 * Per-test + suite ceilings from `tests/e2e/e2e.js` (also on `e2e.spec.js` describe).
 * Objective polls: 12s inference, 20s capture — do not raise on failure.
 */

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.js',
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: E2E_TEST_TIMEOUT_MS,
  globalTimeout: E2E_BENCHMARK ? E2E_BENCHMARK_GLOBAL_TIMEOUT_MS : E2E_GLOBAL_TIMEOUT_MS,
  expect: { timeout: 12_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  // PWDEBUG=1 floods API traces and hides perf lines — leave unset (see npm run test:verbose).
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: {
      args: [
        '--enable-unsafe-webgpu',
        '--enable-features=LanguageModelAPI,OptimizationGuideOnDeviceModel',
        '--optimization-guide-on-device-model-bypass-perf-requirement',
      ],
    },
  },
  webServer: {
    command: 'npm run dev --prefix examples -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
